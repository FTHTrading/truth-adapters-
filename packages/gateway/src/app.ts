/**
 * Runtime-agnostic request handler for the truth gateway. index.ts binds it to
 * Cloudflare (D1 ledger, secrets); tests bind it to a MemoryLedger and a mock
 * facilitator. Nothing in this file imports a Cloudflare-only API.
 *
 * Routes
 *   GET  /                      manifest
 *   GET  /.well-known/truth.json manifest
 *   GET  /health
 *   GET  /anchor                latest anchor record
 *   GET  /entries?from=&limit=  chain segment (max 500)
 *   GET  /entries/:seq
 *   GET  /verify/:hash          entry + event verdict + inclusion proof against the latest anchor
 *   POST /witness/:adapter      x402-gated observation
 *
 * Unpaid refusals (bad body, unknown adapter, invalid payment) are NOT written
 * to the ledger: history is cost-gated, and free writes would let anyone grow
 * the ledger for nothing (ADR-0004). Everything after a settled payment is.
 */
import type { AdapterContext, AdapterSpec } from "../../adapters/src/types.ts";
import { findForbiddenKeys } from "../../adapters/src/forbidden.ts";
import {
  buildAnchor,
  createWitness,
  proveInclusion,
  submit,
  verifyEvent,
  validateEntryShape,
  kindOf,
  type Clock,
  type CostProof,
  type Entry,
  type Ledger,
  type WitnessKeys,
} from "../../kernel/src/index.ts";
import { ANCHORING_STATUS, formatAtomic, labelsOf, LIMITATIONS, type GatewayConfig } from "./config.ts";
import { llmsTxt, openapiJson, pricingJson, securityTxt, statusJson, wellKnownX402 } from "./discovery.ts";
import { agentCard, landingHtml } from "./landing.ts";
import {
  apostleVerify,
  buildPaymentRequiredV2,
  buildRequirements,
  buildRequirementsV2,
  decodePaymentHeader,
  decodePaymentSignatureHeader,
  encodeHeader,
  encodePaymentResponse,
  facilitatorSettle,
  facilitatorVerify,
  settlementReference,
  type FacilitatorHeaders,
  type PaymentPayload,
  type PaymentPayloadV2,
  type PaymentRequirements,
  type PaymentRequirementsV2,
} from "./x402.ts";

export interface Deps {
  ledger: Ledger;
  keys: WitnessKeys;
  cfg: GatewayConfig;
  adapters: Readonly<Record<string, AdapterSpec>>;
  fetch: typeof fetch;
  clock: Clock;
  kernelVersion: string;
  /** Published JSON schemas served at /schema/<name>. */
  schemas?: Readonly<Record<string, unknown>>;
  /** Auth headers for an authenticated facilitator (CDP). Absent for the public testnet facilitator. */
  facilitatorHeaders?: FacilitatorHeaders;
  /** Free-route rate limiter: returns false when the key has exceeded its budget. Absent = unlimited. */
  rateLimit?: (key: string) => Promise<boolean>;
  /** Bearer that other UnyKorn Workers present to use this gateway as their facilitator (CDP fronting). Absent = proxy off. */
  facilitatorProxyKey?: string;
}

const MAX_BODY_BYTES = 64 * 1024;
const MAX_PAGE = 500;

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type, x-payment, payment-signature, x-payment-receipt, x-agent-id",
  "access-control-expose-headers": "x-payment-response, payment-response, payment-required",
};

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...CORS, ...headers },
  });
}

const DOES_NOT = [
  "judge intent",
  "interpret meaning",
  "decide fairness",
  "resolve disputes",
  "explain outcomes",
  "grant exceptions",
  "edit or delete history",
  "hold or move client funds",
];

export function manifest(deps: Deps, origin: string, head: Entry | null): unknown {
  const { cfg } = deps;
  const rails: string[] = [];
  if (cfg.x402) rails.push(`x402:exact:${cfg.x402.network.network}`);
  if (cfg.apostle) rails.push("apostle:atp");
  return {
    schema: "truth-manifest-v1",
    service: cfg.serviceName,
    operator: cfg.entity,
    labels: labelsOf(cfg),
    anchoring: ANCHORING_STATUS,
    limitations: LIMITATIONS,
    schemas: { record: `${origin}/schema/truth-record-v1.schema.json`, attestation: `${origin}/schema/truth-attestation-v1.schema.json` },
    substrate: { repo: "github.com/kevanbtc/truth", version: "1.0.0", specification: "FROZEN", label: "reference substrate; see ADR-0003" },
    kernel: `@truth/kernel ${deps.kernelVersion}`,
    witness_public_key: deps.keys.publicKeyHex,
    signature_scheme: "ed25519 over sha256(canonical event)",
    ledger: { head_seq: head?.seq ?? null, head_hash: head?.hash ?? null, chain: "sha256(canonical{seq,prev,ts,record})" },
    rails,
    paid_routes: cfg.disabledReason ? { enabled: false, reason: cfg.disabledReason } : { enabled: true },
    adapters: Object.values(deps.adapters).map((a) => ({
      name: a.name,
      version: a.version,
      observation: a.observation,
      description: a.description,
      endpoint: `${origin}/witness/${a.name}`,
      price: cfg.x402
        ? { atomic: a.price.atomic, display: formatAtomic(a.price.atomic, cfg.x402.network.decimals), asset: cfg.x402.network.asset, network: cfg.x402.network.network }
        : { atomic: a.price.atomic },
      input_example: a.inputExample,
    })),
    endpoints: {
      witness: `${origin}/witness/{adapter}`,
      verify: `${origin}/verify/{entry_hash}`,
      entries: `${origin}/entries?from=0&limit=500`,
      anchor: `${origin}/anchor`,
      health: `${origin}/health`,
      status: `${origin}/status.json`,
      pricing: `${origin}/pricing.json`,
      openapi: `${origin}/openapi.json`,
      llms: `${origin}/llms.txt`,
      x402: `${origin}/.well-known/x402`,
    },
    records: "what happened, who paid, when; signed and chained",
    does_not: DOES_NOT,
  };
}

async function latestAnchor(ledger: Ledger): Promise<Entry | null> {
  // Walk backwards in pages; anchors are hourly so this is short in practice.
  const len = await ledger.length();
  for (let to = len - 1; to >= 0; to -= MAX_PAGE) {
    const page = await ledger.range(Math.max(0, to - MAX_PAGE + 1), to);
    for (let i = page.length - 1; i >= 0; i--) {
      if (kindOf(page[i]!.record) === "ANCHOR") return page[i]!;
    }
  }
  return null;
}

/** Cron entry point: anchors everything currently in the ledger and records the anchor as history. */
export async function runAnchor(deps: Deps): Promise<Entry | null> {
  const len = await deps.ledger.length();
  if (len === 0) return null;
  const entries = await deps.ledger.range(0, len - 1);
  const anchor = await buildAnchor(entries, deps.clock);
  return deps.ledger.append({ kind: "ANCHOR", ...anchor, witness: "ANCHOR:MERKLE", pub: deps.keys.publicKeyHex });
}

function adapterWitness(deps: Deps, spec: AdapterSpec) {
  const ctx: AdapterContext = { fetch: deps.fetch, clock: deps.clock };
  return createWitness(
    `ADAPTER:${spec.name}@${spec.version}`,
    deps.keys,
    async (input) => {
      const payload = await spec.translate(input, ctx);
      if (payload === null || payload === undefined) return null;
      // USAGE.md Q4 made executable: a payload with an opinion in it is not observable.
      if (findForbiddenKeys(payload).length > 0) return null;
      return payload;
    },
    { clock: deps.clock },
  );
}

function costWitness(deps: Deps, rail: string) {
  return createWitness(`COST:${rail}`, deps.keys, (i) => i, { clock: deps.clock });
}

function paymentRequired(reqs: PaymentRequirements | null, deps: Deps, error?: string, v2?: { resource: string; amount: string; description: string }): Response {
  // v1 clients read the body; v2 clients read the PAYMENT-REQUIRED header. Both are served on every 402.
  const body: Record<string, unknown> = { x402Version: 1, accepts: reqs ? [reqs] : [] };
  if (error) body.error = error;
  const headers: Record<string, string> = {};
  if (deps.cfg.x402 && v2) {
    headers["payment-required"] = encodeHeader(buildPaymentRequiredV2(deps.cfg.x402, v2.resource, v2.amount, v2.description, error));
    body.x402v2 = "PAYMENT-REQUIRED header carries the x402 v2 document; pay with PAYMENT-SIGNATURE";
  }
  if (deps.cfg.apostle) {
    body.alt_rails = [
      {
        rail: "apostle:atp",
        header: "X-Payment-Receipt",
        amount_raw: deps.cfg.apostle.priceAtpRaw,
        facilitator: deps.cfg.apostle.facilitatorUrl,
        how: "Pay ATP on Apostle Chain (chain 7332), retry with X-Payment-Receipt: <tx_hash>",
      },
    ];
  }
  return json(402, body, headers);
}

async function readJsonBody(req: Request): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; reason: string }> {
  const len = Number(req.headers.get("content-length") ?? "0");
  if (len > MAX_BODY_BYTES) return { ok: false, reason: `body over ${MAX_BODY_BYTES} bytes` };
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) return { ok: false, reason: `body over ${MAX_BODY_BYTES} bytes` };
  try {
    const v = JSON.parse(text);
    if (!v || typeof v !== "object" || Array.isArray(v)) return { ok: false, reason: "body must be a JSON object" };
    return { ok: true, body: v as Record<string, unknown> };
  } catch {
    return { ok: false, reason: "body must be JSON" };
  }
}

async function witnessRoute(req: Request, deps: Deps, url: URL, adapterName: string): Promise<Response> {
  const spec = deps.adapters[adapterName];
  if (!spec) return json(404, { refused: "unknown adapter", adapters: Object.keys(deps.adapters) });
  if (deps.cfg.disabledReason) return json(503, { refused: deps.cfg.disabledReason });

  const parsed = await readJsonBody(req);
  if (!parsed.ok) return json(400, { refused: parsed.reason });

  const resource = `${url.origin}${url.pathname}`;
  const reqs = deps.cfg.x402 ? buildRequirements(deps.cfg.x402, resource, spec.price.atomic, spec.description) : null;
  const v2 = { resource, amount: spec.price.atomic, description: spec.description };
  const xPayment = req.headers.get("x-payment");
  const paymentSignature = req.headers.get("payment-signature");
  const apostleReceipt = req.headers.get("x-payment-receipt");

  let cost: CostProof;
  const extraHeaders: Record<string, string> = {};

  if ((xPayment || paymentSignature) && reqs && deps.cfg.x402) {
    // One settlement path for both wire generations; only decoding and the response header differ.
    let wire: 1 | 2;
    let payload: PaymentPayload | PaymentPayloadV2;
    let requirements: PaymentRequirements | PaymentRequirementsV2;
    let payerFrom: string;
    if (paymentSignature) {
      const reqsV2 = buildRequirementsV2(deps.cfg.x402, spec.price.atomic);
      const decoded = decodePaymentSignatureHeader(paymentSignature, reqsV2);
      if (!decoded.ok) return paymentRequired(reqs, deps, decoded.reason, v2);
      wire = 2;
      payload = decoded.payload;
      requirements = reqsV2;
      payerFrom = decoded.payload.payload.authorization.from;
    } else {
      const decoded = decodePaymentHeader(xPayment!, reqs);
      if (!decoded.ok) return paymentRequired(reqs, deps, decoded.reason, v2);
      wire = 1;
      payload = decoded.payload;
      requirements = reqs;
      payerFrom = decoded.payload.payload.authorization.from;
    }
    let verify;
    try {
      verify = await facilitatorVerify(deps.fetch, deps.cfg.x402.facilitatorUrl, payload, requirements, deps.facilitatorHeaders);
    } catch (err) {
      return json(502, { refused: `facilitator unreachable: ${err instanceof Error ? err.message : String(err)}` });
    }
    if (!verify.isValid) return paymentRequired(reqs, deps, verify.invalidReason ?? "payment invalid", v2);
    let settle;
    try {
      settle = await facilitatorSettle(deps.fetch, deps.cfg.x402.facilitatorUrl, payload, requirements, deps.facilitatorHeaders);
    } catch (err) {
      return json(502, { refused: `facilitator unreachable: ${err instanceof Error ? err.message : String(err)}` });
    }
    const reference = settlementReference(settle);
    if (!settle.success || !reference) return paymentRequired(reqs, deps, settle.errorReason ?? "settlement failed", v2);
    const rail = `x402:exact:${reqs.network}`;
    const payer = settle.payer ?? payerFrom;
    const settlement = {
      rail,
      wire_version: wire,
      network: reqs.network,
      asset: reqs.asset,
      amount: spec.price.atomic,
      payer,
      reference,
      facilitator: new URL(deps.cfg.x402.facilitatorUrl).host,
      settled_at: deps.clock(),
    };
    const costAtt = await submit(deps.ledger, costWitness(deps, rail), settlement, undefined, { clock: deps.clock });
    if (costAtt.outcome !== "OBSERVED" || !costAtt.event) return json(500, { refused: "cost witness did not observe settlement" });
    cost = { rail, asset: reqs.asset, amount: spec.price.atomic, payer, reference, witnessed_event_id: costAtt.event.id };
    extraHeaders[wire === 2 ? "payment-response" : "x-payment-response"] = encodePaymentResponse(settle);
  } else if (apostleReceipt && deps.cfg.apostle) {
    const txHash = apostleReceipt.trim();
    if (!/^(0x)?[0-9a-fA-F]{64}$/.test(txHash)) return paymentRequired(reqs, deps, "X-Payment-Receipt is not a tx hash");
    let v;
    try {
      v = await apostleVerify(deps.fetch, deps.cfg.apostle.facilitatorUrl, txHash, deps.cfg.apostle.priceAtpRaw);
    } catch (err) {
      return json(502, { refused: `apostle facilitator unreachable: ${err instanceof Error ? err.message : String(err)}` });
    }
    if (!v.valid) return paymentRequired(reqs, deps, v.reason ?? "ATP receipt not verified");
    const payer = req.headers.get("x-agent-id")?.trim() || `apostle:${txHash.toLowerCase()}`;
    const settlement = { rail: "apostle:atp", asset: "ATP", amount: deps.cfg.apostle.priceAtpRaw, payer, reference: txHash, facilitator: new URL(deps.cfg.apostle.facilitatorUrl).host, settled_at: deps.clock() };
    const costAtt = await submit(deps.ledger, costWitness(deps, "apostle:atp"), settlement, undefined, { clock: deps.clock });
    if (costAtt.outcome !== "OBSERVED" || !costAtt.event) return json(500, { refused: "cost witness did not observe settlement" });
    cost = { rail: "apostle:atp", asset: "ATP", amount: deps.cfg.apostle.priceAtpRaw, payer, reference: txHash, witnessed_event_id: costAtt.event.id };
  } else {
    return paymentRequired(reqs, deps, undefined, v2);
  }

  const att = await submit(deps.ledger, adapterWitness(deps, spec), parsed.body, cost, { clock: deps.clock });
  const entryRef = (e?: Entry) => (e ? { seq: e.seq, hash: e.hash, prev: e.prev, ts: e.ts } : null);
  return json(
    200,
    {
      schema: "truth-attestation-v1",
      outcome: att.outcome,
      labels: labelsOf(deps.cfg),
      limitations: LIMITATIONS,
      witness: att.witness,
      witness_public_key: deps.keys.publicKeyHex,
      reason: att.reason ?? null,
      event: att.event ?? null,
      entry: entryRef(att.entry ?? att.refusal),
      finalization: entryRef(att.finalization),
      rejection: entryRef(att.rejection),
      cost,
      verify: att.entry ? `${url.origin}/verify/${att.entry.hash}` : att.refusal ? `${url.origin}/verify/${att.refusal.hash}` : null,
      anchor: `${url.origin}/anchor`,
    },
    extraHeaders,
  );
}

async function verifyRoute(deps: Deps, url: URL, hash: string): Promise<Response> {
  if (!/^[0-9a-f]{64}$/.test(hash)) return json(400, { refused: "hash must be sha256 hex" });
  const entry = await deps.ledger.findByHash(hash);
  if (!entry) return json(404, { found: false, hash });
  const head = await deps.ledger.head();
  const prevEntry = entry.seq > 0 ? await deps.ledger.get(entry.seq - 1) : null;
  const nextEntry = await deps.ledger.get(entry.seq + 1);
  const rec = entry.record as { kind?: string; event?: Parameters<typeof verifyEvent>[0] };
  const structure = validateEntryShape(entry);
  const event_verdict = rec.kind === "EVENT" && rec.event ? await verifyEvent(rec.event) : null;
  const referenced_by = (await deps.ledger.findReferences(entry.hash)).map((e) => ({ seq: e.seq, hash: e.hash, ts: e.ts }));
  const anchorEntry = await latestAnchor(deps.ledger);
  let inclusion: unknown = null;
  if (anchorEntry) {
    const anchor = anchorEntry.record as { merkle_root: string; entries: number; head_hash: string; ts: number };
    if (entry.seq < anchor.entries) {
      const entries = await deps.ledger.range(0, anchor.entries - 1);
      try {
        inclusion = { anchor_seq: anchorEntry.seq, anchor_hash: anchorEntry.hash, proof: await proveInclusion(entries, anchor, entry.seq) };
      } catch (err) {
        inclusion = { error: err instanceof Error ? err.message : String(err) };
      }
    } else {
      inclusion = { pending: true, note: "entry is newer than the latest anchor" };
    }
  }
  return json(200, {
    schema: "truth-verify-v1",
    found: true,
    labels: labelsOf(deps.cfg),
    limitations: LIMITATIONS,
    entry,
    structure,
    referenced_by,
    links: { prev_matches: prevEntry ? prevEntry.hash === entry.prev : entry.prev === "0".repeat(64), next_prev_matches: nextEntry ? nextEntry.prev === entry.hash : null },
    head: head ? { seq: head.seq, hash: head.hash } : null,
    event_verdict,
    inclusion,
    manifest: `${url.origin}/.well-known/truth.json`,
  });
}

export async function handle(req: Request, deps: Deps): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  // ---- facilitator proxy: bearer-keyed, CDP only, no free path ------------------------------------------
  if (path === "/facilitator/supported" || path === "/facilitator/verify" || path === "/facilitator/settle") {
    if (!deps.facilitatorProxyKey) return json(503, { refused: "facilitator proxy not configured (FACILITATOR_PROXY_KEY)" });
    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${deps.facilitatorProxyKey}`) return json(401, { refused: "bearer required" });
    if (!deps.cfg.x402 || deps.cfg.x402.facilitatorKind === "public" || !deps.facilitatorHeaders) return json(503, { refused: "proxy fronts an authenticated facilitator only; this gateway is not configured for it" });
    const base = deps.cfg.x402.facilitatorUrl;
    const hdrs = await deps.facilitatorHeaders();
    if (path === "/facilitator/supported") {
      if (req.method !== "GET") return json(405, { refused: "GET" });
      const up = await deps.fetch(`${base}/supported`, { headers: { accept: "application/json", ...hdrs.verify } });
      return new Response(await up.text(), { status: up.status, headers: { "content-type": "application/json; charset=utf-8", ...CORS } });
    }
    if (req.method !== "POST") return json(405, { refused: "POST" });
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) return json(413, { refused: "body too large" });
    let body: unknown;
    try { body = JSON.parse(raw); } catch { return json(400, { refused: "invalid JSON" }); }
    const b = body as { paymentPayload?: unknown; paymentRequirements?: unknown };
    if (!b || typeof b !== "object" || !b.paymentPayload || !b.paymentRequirements) return json(400, { refused: "paymentPayload and paymentRequirements required" });
    const which = path.endsWith("/verify") ? "verify" : "settle";
    const up = await deps.fetch(`${base}/${which}`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json", ...hdrs[which] }, body: raw });
    return new Response(await up.text(), { status: up.status, headers: { "content-type": "application/json; charset=utf-8", ...CORS } });
  }

  if (req.method === "GET" || req.method === "HEAD") {
    // Free reads are the only unpaid surface; they carry a per-client budget so the ledger cannot be scraped for nothing.
    if (deps.rateLimit) {
      const key = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for") ?? "anonymous";
      if (!(await deps.rateLimit(key))) return json(429, { refused: "rate limited: free reads are budgeted per client; paid routes are not" }, { "retry-after": "60" });
    }
    if (path === "/") {
      const accept = req.headers.get("accept") ?? "";
      const wantsJson = accept.includes("application/json") && !accept.includes("text/html");
      if (!wantsJson) {
        const head = await deps.ledger.head();
        const html = landingHtml(url.origin, deps.cfg, labelsOf(deps.cfg), deps.adapters, deps.keys.publicKeyHex, head ? { seq: head.seq, hash: head.hash } : null);
        return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", ...CORS } });
      }
      return json(200, manifest(deps, url.origin, await deps.ledger.head()));
    }
    if (path === "/.well-known/truth.json") return json(200, manifest(deps, url.origin, await deps.ledger.head()));
    if (path === "/.well-known/agent.json") return json(200, agentCard(url.origin, deps.cfg, labelsOf(deps.cfg), deps.adapters, deps.keys.publicKeyHex));
    if (path === "/health") {
      const head = await deps.ledger.head();
      return json(200, { ok: true, entries: await deps.ledger.length(), head_seq: head?.seq ?? null, head_hash: head?.hash ?? null, paid_routes: !deps.cfg.disabledReason });
    }
    if (path === "/anchor") {
      const a = await latestAnchor(deps.ledger);
      return a ? json(200, { ...a, labels: labelsOf(deps.cfg), anchoring: ANCHORING_STATUS }) : json(404, { found: false, note: "no anchor yet", anchoring: ANCHORING_STATUS });
    }
    if (path === "/status.json") {
      const head = await deps.ledger.head();
      return json(200, statusJson(deps.cfg, head ? { seq: head.seq, hash: head.hash } : null, deps.kernelVersion));
    }
    if (path === "/pricing.json") return json(200, pricingJson(deps.cfg, deps.adapters));
    if (path === "/.well-known/x402") return json(200, wellKnownX402(deps.cfg, url.origin, deps.adapters));
    if (path === "/openapi.json") return json(200, openapiJson(url.origin, deps.adapters, labelsOf(deps.cfg)));
    if (path === "/llms.txt") return new Response(llmsTxt(url.origin, deps.adapters, labelsOf(deps.cfg)), { headers: { "content-type": "text/plain; charset=utf-8", ...CORS } });
    if (path === "/robots.txt") {
      const robots = `User-agent: *\nAllow: /\n\nUser-agent: GPTBot\nAllow: /\n\nUser-agent: ClaudeBot\nAllow: /\n\nUser-agent: PerplexityBot\nAllow: /\n\nUser-agent: Google-Extended\nAllow: /\n\nSitemap: ${url.origin}/sitemap.xml\n`;
      return new Response(robots, { headers: { "content-type": "text/plain; charset=utf-8", ...CORS } });
    }
    if (path === "/sitemap.xml") {
      const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${url.origin}/</loc><changefreq>hourly</changefreq><priority>1.0</priority></url>\n  <url><loc>${url.origin}/.well-known/x402</loc><changefreq>daily</changefreq><priority>0.9</priority></url>\n  <url><loc>${url.origin}/.well-known/agent.json</loc><changefreq>daily</changefreq><priority>0.9</priority></url>\n  <url><loc>${url.origin}/.well-known/truth.json</loc><changefreq>daily</changefreq><priority>0.8</priority></url>\n  <url><loc>${url.origin}/openapi.json</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>\n  <url><loc>${url.origin}/pricing.json</loc><changefreq>daily</changefreq><priority>0.8</priority></url>\n  <url><loc>${url.origin}/status.json</loc><changefreq>hourly</changefreq><priority>0.7</priority></url>\n  <url><loc>${url.origin}/llms.txt</loc><changefreq>daily</changefreq><priority>0.8</priority></url>\n</urlset>\n`;
      return new Response(sitemap, { headers: { "content-type": "application/xml; charset=utf-8", ...CORS } });
    }
    if (path === "/.well-known/security.txt" || path === "/security.txt") {
      if (!deps.cfg.securityContact) return json(404, { refused: "SECURITY_CONTACT not configured" });
      return new Response(securityTxt(deps.cfg.securityContact, url.origin), { headers: { "content-type": "text/plain; charset=utf-8", ...CORS } });
    }
    const s = /^\/schema\/(truth-(?:record|attestation)-v1\.schema\.json)$/.exec(path);
    if (s) return json(200, deps.schemas?.[s[1]!] ?? { refused: "schema not bundled" });
    if (path === "/entries") {
      const from = Math.max(0, Number(url.searchParams.get("from") ?? "0") || 0);
      const limit = Math.min(MAX_PAGE, Math.max(1, Number(url.searchParams.get("limit") ?? String(MAX_PAGE)) || MAX_PAGE));
      const entries = await deps.ledger.range(from, from + limit - 1);
      return json(200, { from, limit, total: await deps.ledger.length(), entries });
    }
    const m = /^\/entries\/(\d+)$/.exec(path);
    if (m) {
      const e = await deps.ledger.get(Number(m[1]));
      return e ? json(200, e) : json(404, { found: false });
    }
    const v = /^\/verify\/([0-9a-fA-F]+)$/.exec(path);
    if (v) return verifyRoute(deps, url, v[1]!.toLowerCase());
    return json(404, { refused: "no such route" });
  }

  if (req.method === "POST") {
    const w = /^\/witness\/([a-z0-9-]+)$/.exec(path);
    if (w) return witnessRoute(req, deps, url, w[1]!);
    return json(404, { refused: "no such route" });
  }

  return json(405, { refused: "method not allowed" });
}
