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

/**
 * x402 v2 (the @x402/core generation, used by current client libraries and by twin.unykorn.org):
 *   402 response:  header PAYMENT-REQUIRED = base64(JSON PaymentRequiredV2); body keeps the v1 document
 *   request:       header PAYMENT-SIGNATURE = base64(JSON PaymentPayloadV2)
 *   response:      header PAYMENT-RESPONSE = base64(JSON SettleResponse)
 *   networks:      CAIP-2 ids (eip155:8453, eip155:84532); `amount` replaces `maxAmountRequired`
 */
export interface PaymentRequirementsV2 {
  scheme: "exact";
  network: string; // eip155:<chainId>
  asset: string;
  amount: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra: { name: string; version: string };
}

export interface PaymentRequiredV2 {
  x402Version: 2;
  error?: string;
  resource: { url: string; description?: string; mimeType?: string; serviceName?: string };
  accepts: PaymentRequirementsV2[];
}

export interface PaymentPayloadV2 {
  x402Version: 2;
  resource?: { url: string };
  accepted: PaymentRequirementsV2;
  payload: { signature: string; authorization: ExactEvmAuthorization };
}

export function buildRequirementsV2(cfg: X402Config, amountAtomic: string): PaymentRequirementsV2 {
  return {
    scheme: "exact",
    network: `eip155:${cfg.network.chainId}`,
    asset: cfg.network.asset,
    amount: amountAtomic,
    payTo: cfg.payTo,
    maxTimeoutSeconds: cfg.maxTimeoutSeconds,
    extra: { name: cfg.network.assetName, version: cfg.network.assetVersion },
  };
}

export function buildPaymentRequiredV2(cfg: X402Config, resourceUrl: string, amountAtomic: string, description: string, error?: string): PaymentRequiredV2 {
  const doc: PaymentRequiredV2 = {
    x402Version: 2,
    resource: { url: resourceUrl, description, mimeType: "application/json", serviceName: "genesis402 truth gateway" },
    accepts: [buildRequirementsV2(cfg, amountAtomic)],
  };
  if (error) doc.error = error;
  return doc;
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

export function encodeHeader(v: unknown): string {
  return b64encode(JSON.stringify(v));
}

export type DecodedV2 = { ok: true; payload: PaymentPayloadV2 } | { ok: false; reason: string };

/** Decodes and checks a v2 PAYMENT-SIGNATURE header against the requirements this gateway advertised. */
export function decodePaymentSignatureHeader(header: string, reqs: PaymentRequirementsV2): DecodedV2 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(b64decode(header.trim()));
  } catch {
    return { ok: false, reason: "PAYMENT-SIGNATURE is not base64 JSON" };
  }
  const p = parsed as Partial<PaymentPayloadV2>;
  if (p.x402Version !== 2) return { ok: false, reason: "unsupported x402Version" };
  const acc = p.accepted;
  if (!acc || acc.scheme !== reqs.scheme) return { ok: false, reason: `accepted.scheme must be ${reqs.scheme}` };
  if (acc.network !== reqs.network) return { ok: false, reason: `accepted.network must be ${reqs.network}` };
  if (typeof acc.payTo !== "string" || acc.payTo.toLowerCase() !== reqs.payTo.toLowerCase()) return { ok: false, reason: "accepted.payTo is not the gateway pay-to address" };
  if (typeof acc.asset !== "string" || acc.asset.toLowerCase() !== reqs.asset.toLowerCase()) return { ok: false, reason: "accepted.asset is not the gateway asset" };
  if (typeof acc.amount !== "string" || !/^\d+$/.test(acc.amount) || BigInt(acc.amount) < BigInt(reqs.amount)) return { ok: false, reason: "accepted.amount below required amount" };
  const auth = p.payload?.authorization;
  if (!p.payload || typeof p.payload.signature !== "string" || !auth) return { ok: false, reason: "payload missing signature or authorization" };
  for (const k of ["from", "to", "value", "validAfter", "validBefore", "nonce"] as const) {
    if (typeof auth[k] !== "string") return { ok: false, reason: `authorization.${k} missing` };
  }
  if (auth.to.toLowerCase() !== reqs.payTo.toLowerCase()) return { ok: false, reason: "authorization.to is not the gateway pay-to address" };
  if (!/^\d+$/.test(auth.value) || BigInt(auth.value) < BigInt(reqs.amount)) return { ok: false, reason: "authorization.value below required amount" };
  return { ok: true, payload: p as PaymentPayloadV2 };
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

/** Per-request headers for an authenticated facilitator (CDP mints a bearer JWT per call). */
export type FacilitatorHeaders = () => Promise<{ verify: Record<string, string>; settle: Record<string, string> }>;

async function postJson<T>(fetchFn: typeof fetch, url: string, body: unknown, extraHeaders: Record<string, string> = {}): Promise<T> {
  const res = await fetchFn(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json", ...extraHeaders },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    // CDP answers a rejected authorization (e.g. the payer's transferWithAuthorization reverts for lack of funds)
    // with HTTP 400 and a normal VerifyResponse/SettleResponse body. That is a payment refusal, not an outage:
    // hand it back so the caller returns 402 with the reason instead of 502 "facilitator unreachable".
    let body: unknown = null;
    try { body = await res.json(); } catch { /* not JSON */ }
    if (res.status >= 400 && res.status < 500 && body && typeof body === "object" && (typeof (body as { isValid?: unknown }).isValid === "boolean" || (body as { success?: unknown }).success === false)) {
      return body as T;
    }
    throw new Error(`facilitator ${res.status} at ${new URL(url).pathname}`);
  }
  return (await res.json()) as T;
}

export async function facilitatorVerify(
  fetchFn: typeof fetch,
  facilitatorUrl: string,
  paymentPayload: PaymentPayload | PaymentPayloadV2,
  paymentRequirements: PaymentRequirements | PaymentRequirementsV2,
  headers?: FacilitatorHeaders,
): Promise<VerifyResponse> {
  const h = headers ? (await headers()).verify : {};
  return postJson<VerifyResponse>(fetchFn, `${facilitatorUrl}/verify`, { x402Version: paymentPayload.x402Version, paymentPayload, paymentRequirements }, h);
}

export async function facilitatorSettle(
  fetchFn: typeof fetch,
  facilitatorUrl: string,
  paymentPayload: PaymentPayload | PaymentPayloadV2,
  paymentRequirements: PaymentRequirements | PaymentRequirementsV2,
  headers?: FacilitatorHeaders,
): Promise<SettleResponse> {
  const h = headers ? (await headers()).settle : {};
  return postJson<SettleResponse>(fetchFn, `${facilitatorUrl}/settle`, { x402Version: paymentPayload.x402Version, paymentPayload, paymentRequirements }, h);
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
