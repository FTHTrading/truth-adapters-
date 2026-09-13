/**
 * Minimal x402 v1 client for the "exact" scheme on EVM: signs an EIP-3009
 * transferWithAuthorization for USDC and retries the request with X-PAYMENT.
 *
 * The payer key comes from the environment and is never logged. Every payment
 * is capped by X402_MAX_ATOMIC; anything above is refused before signing.
 */
import { privateKeyToAccount } from "viem/accounts";
import { bytesToHex } from "viem";

export interface Requirements {
  scheme: string;
  network: string;
  maxAmountRequired: string;
  resource: string;
  description: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
  extra?: { name?: string; version?: string };
}

const CHAIN_IDS: Record<string, number> = { "base-sepolia": 84532, base: 8453 };

export interface PayOptions {
  privateKey: `0x${string}`;
  maxAtomic: bigint;
  fetchFn?: typeof fetch;
  now?: () => number;
}

export interface PayResult {
  status: number;
  body: unknown;
  paid: boolean;
  requirements?: Requirements;
  paymentResponse?: string | null;
  refused?: string;
}

export async function signPayment(reqs: Requirements, opts: PayOptions): Promise<string> {
  const chainId = CHAIN_IDS[reqs.network];
  if (!chainId) throw new Error(`unsupported network ${reqs.network}`);
  if (reqs.scheme !== "exact") throw new Error(`unsupported scheme ${reqs.scheme}`);
  const value = BigInt(reqs.maxAmountRequired);
  if (value > opts.maxAtomic) throw new Error(`price ${value} exceeds X402_MAX_ATOMIC ${opts.maxAtomic}`);
  const account = privateKeyToAccount(opts.privateKey);
  const nowSec = Math.floor((opts.now ?? Date.now)() / 1000);
  const nonce = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
  const validAfter = 0n;
  const validBefore = BigInt(nowSec + (reqs.maxTimeoutSeconds || 60));
  const signature = await account.signTypedData({
    domain: { name: reqs.extra?.name ?? "USD Coin", version: reqs.extra?.version ?? "2", chainId, verifyingContract: reqs.asset as `0x${string}` },
    types: {
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    },
    primaryType: "TransferWithAuthorization",
    message: { from: account.address, to: reqs.payTo as `0x${string}`, value, validAfter, validBefore, nonce },
  });
  const payload = {
    x402Version: 1,
    scheme: "exact",
    network: reqs.network,
    payload: {
      signature,
      authorization: { from: account.address, to: reqs.payTo, value: value.toString(), validAfter: validAfter.toString(), validBefore: validBefore.toString(), nonce },
    },
  };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
}

/** POSTs JSON; on 402, signs the first acceptable requirement and retries once. */
export async function payAndPost(url: string, body: unknown, opts: PayOptions | null, fetchOverride?: typeof fetch): Promise<PayResult> {
  const fetchFn = fetchOverride ?? opts?.fetchFn ?? fetch;
  const first = await fetchFn(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const firstBody = await first.json().catch(() => null);
  if (first.status !== 402) return { status: first.status, body: firstBody, paid: false };
  const reqs = ((firstBody as { accepts?: Requirements[] } | null)?.accepts ?? [])[0];
  if (!reqs) return { status: 402, body: firstBody, paid: false, refused: "402 without requirements" };
  if (!opts) return { status: 402, body: firstBody, paid: false, requirements: reqs, refused: "no payer key configured (X402_PAYER_PRIVATE_KEY)" };
  let header: string;
  try {
    header = await signPayment(reqs, opts);
  } catch (err) {
    return { status: 402, body: firstBody, paid: false, requirements: reqs, refused: err instanceof Error ? err.message : String(err) };
  }
  const second = await fetchFn(url, { method: "POST", headers: { "content-type": "application/json", "x-payment": header }, body: JSON.stringify(body) });
  const secondBody = await second.json().catch(() => null);
  return { status: second.status, body: secondBody, paid: second.status === 200, requirements: reqs, paymentResponse: second.headers.get("x-payment-response") };
}
