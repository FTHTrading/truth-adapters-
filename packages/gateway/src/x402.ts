/**
 * x402 (HTTP 402 payment protocol, v1) server side. The gateway never touches
 * funds: the client signs an EIP-3009 transferWithAuthorization for USDC, the
 * facilitator verifies and settles it on-chain to X402_PAY_TO, and the
 * facilitator's settle response is what the COST witness records.
 *
 * Wire format (x402 v1):
 *   402 body:   { x402Version: 1, accepts: [PaymentRequirements], error? }
 *   request:    X-PAYMENT: base64(JSON PaymentPayload)
 *   response:   X-PAYMENT-RESPONSE: base64(JSON SettleResponse)
 *   facilitator: POST /verify | POST /settle with { x402Version, paymentPayload, paymentRequirements }
 */
import type { X402Config } from "./config.ts";

export interface PaymentRequirements {
  scheme: "exact";
  network: string;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
  extra: { name: string; version: string };
}

export interface ExactEvmAuthorization {
  from: string;
  to: string;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: string;
}

export interface PaymentPayload {
  x402Version: number;
  scheme: string;
  network: string;
  payload: { signature: string; authorization: ExactEvmAuthorization };
}

export interface VerifyResponse {
  isValid: boolean;
  invalidReason?: string;
  payer?: string;
}

export interface SettleResponse {
  success: boolean;
  errorReason?: string;
  transaction?: string;
  txHash?: string;
  network?: string;
  networkId?: string;
  payer?: string;
}

export function buildRequirements(cfg: X402Config, resource: string, amountAtomic: string, description: string): PaymentRequirements {
  return {
    scheme: "exact",
    network: cfg.network.network,
    maxAmountRequired: amountAtomic,
    resource,
    description,
    mimeType: "application/json",
    payTo: cfg.payTo,
    maxTimeoutSeconds: cfg.maxTimeoutSeconds,
    asset: cfg.network.asset,
    extra: { name: cfg.network.assetName, version: cfg.network.assetVersion },
  };
}

function b64decode(s: string): string {
  const bin = atob(s);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function b64encode(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export type Decoded = { ok: true; payload: PaymentPayload } | { ok: false; reason: string };

export function decodePaymentHeader(header: string, reqs: PaymentRequirements): Decoded {
  let parsed: unknown;
  try {
    parsed = JSON.parse(b64decode(header.trim()));
  } catch {
    return { ok: false, reason: "X-PAYMENT is not base64 JSON" };
  }
  const p = parsed as Partial<PaymentPayload>;
  if (p.x402Version !== 1) return { ok: false, reason: "unsupported x402Version" };
  if (p.scheme !== reqs.scheme) return { ok: false, reason: `scheme must be ${reqs.scheme}` };
  if (p.network !== reqs.network) return { ok: false, reason: `network must be ${reqs.network}` };
  const auth = p.payload?.authorization;
  if (!p.payload || typeof p.payload.signature !== "string" || !auth) return { ok: false, reason: "payload missing signature or authorization" };
  for (const k of ["from", "to", "value", "validAfter", "validBefore", "nonce"] as const) {
    if (typeof auth[k] !== "string") return { ok: false, reason: `authorization.${k} missing` };
  }
  if (auth.to.toLowerCase() !== reqs.payTo.toLowerCase()) return { ok: false, reason: "authorization.to is not the gateway pay-to address" };
  if (!/^\d+$/.test(auth.value) || BigInt(auth.value) < BigInt(reqs.maxAmountRequired)) return { ok: false, reason: "authorization.value below required amount" };
  return { ok: true, payload: p as PaymentPayload };
}

async function postJson<T>(fetchFn: typeof fetch, url: string, body: unknown): Promise<T> {
  const res = await fetchFn(url, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`facilitator ${res.status} at ${new URL(url).pathname}`);
  return (await res.json()) as T;
}

export function facilitatorVerify(fetchFn: typeof fetch, facilitatorUrl: string, paymentPayload: PaymentPayload, paymentRequirements: PaymentRequirements): Promise<VerifyResponse> {
  return postJson<VerifyResponse>(fetchFn, `${facilitatorUrl}/verify`, { x402Version: 1, paymentPayload, paymentRequirements });
}

export function facilitatorSettle(fetchFn: typeof fetch, facilitatorUrl: string, paymentPayload: PaymentPayload, paymentRequirements: PaymentRequirements): Promise<SettleResponse> {
  return postJson<SettleResponse>(fetchFn, `${facilitatorUrl}/settle`, { x402Version: 1, paymentPayload, paymentRequirements });
}

export function encodePaymentResponse(settle: SettleResponse): string {
  return b64encode(JSON.stringify(settle));
}

export function settlementReference(s: SettleResponse): string | null {
  const ref = s.transaction ?? s.txHash;
  return typeof ref === "string" && ref.length > 0 ? ref : null;
}

/** Apostle Chain rail (packages/x402-standard in UnyKorn-X402-aws): X-Payment-Receipt: <tx_hash>. */
export interface ApostleVerifyResponse {
  valid?: boolean;
  reason?: string;
}

export function apostleVerify(fetchFn: typeof fetch, facilitatorUrl: string, txHash: string, expectedAmountRaw: string): Promise<ApostleVerifyResponse> {
  return postJson<ApostleVerifyResponse>(fetchFn, `${facilitatorUrl}/v1/x402/verify`, { tx_hash: txHash, expected_amount: expectedAmountRaw });
}
