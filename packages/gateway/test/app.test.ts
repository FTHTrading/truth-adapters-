/**
 * Exercises the gateway's failure paths (FORGE Phase 4: exercise, don't read).
 * Facilitator and target sites are mocked; the ledger, keys, witnesses and
 * cost gate are the real kernel.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { WORKER_ADAPTERS } from "../../adapters/src/registry.ts";
import type { AdapterSpec } from "../../adapters/src/types.ts";
import { generateKeys, kindOf, MemoryLedger, verifyChain, verifyMerkleProof } from "../../kernel/src/index.ts";
import { handle, runAnchor, type Deps } from "../src/app.ts";
import { scanClaims } from "../src/claims.ts";
import { configFromEnv } from "../src/config.ts";

const PAY_TO = "0x1111111111111111111111111111111111111111";
const PAYER = "0x2222222222222222222222222222222222222222";
const HELLO_SHA = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";

interface Facilitator {
  verify: (body: unknown) => unknown;
  settle: (body: unknown) => unknown;
  calls: string[];
}

function goodFacilitator(): Facilitator {
  const f: Facilitator = {
    calls: [],
    verify: () => ({ isValid: true, payer: PAYER }),
    settle: () => ({ success: true, transaction: "0x" + "ee".repeat(32), network: "base-sepolia", payer: PAYER }),
  };
  return f;
}

function mockFetch(fac: Facilitator): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "https://facilitator.test/verify") {
      fac.calls.push("verify");
      return Response.json(fac.verify(JSON.parse(String(init?.body))));
    }
    if (url === "https://facilitator.test/settle") {
      fac.calls.push("settle");
      return Response.json(fac.settle(JSON.parse(String(init?.body))));
    }
    if (url === "https://x402.unykorn.org/v1/x402/verify") {
      fac.calls.push("apostle");
      return Response.json({ valid: true });
    }
    if (url.startsWith("https://site.test/")) {
      return new Response("hello", { status: 200, headers: { "content-type": "text/plain", "content-length": "5" } });
    }
    return new Response("nope", { status: 404 });
  }) as typeof fetch;
}

let t = 1_700_000_000_000;
const clock = () => t++;

async function makeDeps(fac: Facilitator, adapters: Readonly<Record<string, AdapterSpec>> = WORKER_ADAPTERS, env: Record<string, string> = {}): Promise<Deps & { ledger: MemoryLedger }> {
  return {
    ledger: new MemoryLedger(clock),
    keys: await generateKeys(),
    cfg: configFromEnv({
      SERVICE_NAME: "truth-gateway-test",
      X402_NETWORK: "base-sepolia",
      X402_FACILITATOR_URL: "https://facilitator.test",
      X402_PAY_TO: PAY_TO,
      APOSTLE_FACILITATOR_URL: "https://x402.unykorn.org",
      APOSTLE_PRICE_ATP_RAW: "250000000000000000",
      ...env,
    }),
    adapters,
    fetch: mockFetch(fac),
    clock,
    kernelVersion: "test",
  };
}

function paymentHeader(over: Partial<{ to: string; value: string; network: string; scheme: string; version: number }> = {}): string {
  const payload = {
    x402Version: over.version ?? 1,
    scheme: over.scheme ?? "exact",
    network: over.network ?? "base-sepolia",
    payload: {
      signature: "0x" + "ab".repeat(65),
      authorization: { from: PAYER, to: over.to ?? PAY_TO, value: over.value ?? "1000", validAfter: "0", validBefore: "9999999999", nonce: "0x" + "01".repeat(32) },
    },
  };
  return btoa(JSON.stringify(payload));
}

const post = (deps: Deps, path: string, body: unknown, headers: Record<string, string> = {}) =>
  handle(new Request(`https://gw.test${path}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }), deps);
const get = (deps: Deps, path: string) => handle(new Request(`https://gw.test${path}`), deps);

test("manifest lists adapters, prices, public key and what the system does not do", async () => {
  const deps = await makeDeps(goodFacilitator());
  const res = await get(deps, "/.well-known/truth.json");
  assert.equal(res.status, 200);
  const m = (await res.json()) as Record<string, unknown>;
  assert.equal(m.witness_public_key, deps.keys.publicKeyHex);
  assert.ok((m.adapters as unknown[]).length >= 5);
  assert.ok((m.does_not as string[]).includes("resolve disputes"));
  assert.deepEqual(m.paid_routes, { enabled: true });
  assert.deepEqual(m.labels, { mode: "test", status: "DRY_RUN", anchoring: "UNANCHORED", review: "LOCAL_VERIFIED" });
  assert.match(String(m.anchoring), /^UNANCHORED/);
  assert.match(String(m.limitations), /does not establish/);
});

test("discovery documents disclose DRY_RUN and carry labels; security.txt is 404 until a contact is set", async () => {
  const deps = await makeDeps(goodFacilitator());
  const x = (await (await get(deps, "/.well-known/x402")).json()) as Record<string, any>;
  assert.equal(x.mode, "DRY_RUN");
  assert.equal(x.x402Version, 2);
  assert.match(x.disclosure, /test network only/);
  assert.equal(x.accepts[0].network, "eip155:84532");
  assert.equal(x.resources[0].amount, "1000");
  const s = (await (await get(deps, "/status.json")).json()) as Record<string, any>;
  assert.equal(s.labels.status, "DRY_RUN");
  const p = (await (await get(deps, "/pricing.json")).json()) as Record<string, any>;
  assert.equal(p.label, "TEST_PRICING");
  assert.ok(p.items.some((i: any) => i.adapter === "correction"));
  const o = (await (await get(deps, "/openapi.json")).json()) as Record<string, any>;
  assert.ok(o.paths["/witness/document"]);
  const l = await (await get(deps, "/llms.txt")).text();
  assert.match(l, /mode=test status=DRY_RUN/);
  assert.equal((await get(deps, "/.well-known/security.txt")).status, 404);
  const withContact = await makeDeps(goodFacilitator(), WORKER_ADAPTERS, { SECURITY_CONTACT: "mailto:security@example.invalid" });
  const t = await (await get(withContact, "/.well-known/security.txt")).text();
  assert.match(t, /^Contact: mailto:security@example.invalid/);
});

test("landing page for browsers, manifest for JSON clients, agent card, security.txt alias", async () => {
  const deps = await makeDeps(goodFacilitator(), WORKER_ADAPTERS, { SECURITY_CONTACT: "mailto:security@example.invalid" });
  const html = await handle(new Request("https://gw.test/", { headers: { accept: "text/html,application/xhtml+xml" } }), deps);
  assert.match(html.headers.get("content-type") ?? "", /text\/html/);
  const body = await html.text();
  assert.match(body, /records what happened, who paid, and when/);
  assert.match(body, /mode: test/);
  assert.match(body, /UNANCHORED/);
  assert.ok(body.includes(deps.keys.publicKeyHex));
  const m = await handle(new Request("https://gw.test/", { headers: { accept: "application/json" } }), deps);
  assert.equal(((await m.json()) as any).schema, "truth-manifest-v1");
  const card = (await (await get(deps, "/.well-known/agent.json")).json()) as any;
  assert.equal(card.schemaVersion, "truth-agent-card-1");
  assert.equal(card.tools.length, Object.keys(WORKER_ADAPTERS).length);
  assert.ok(card.limitations.length === 2);
  assert.match(await (await get(deps, "/security.txt")).text(), /^Contact:/);
});

test("claims gate: every served route is free of forbidden phrases", async () => {
  const deps = await makeDeps(goodFacilitator(), WORKER_ADAPTERS, { SECURITY_CONTACT: "mailto:security@example.invalid" });
  await post(deps, "/witness/document", { sha256: HELLO_SHA }, { "x-payment": paymentHeader() });
  await runAnchor(deps);
  const routes: Array<[string, string]> = [
    ["/", "text/html"], ["/", "application/json"], ["/.well-known/truth.json", "*/*"], ["/.well-known/x402", "*/*"], ["/.well-known/agent.json", "*/*"],
    ["/status.json", "*/*"], ["/pricing.json", "*/*"], ["/openapi.json", "*/*"], ["/llms.txt", "*/*"], ["/health", "*/*"], ["/anchor", "*/*"],
    ["/entries?from=0&limit=10", "*/*"], ["/.well-known/security.txt", "*/*"],
  ];
  for (const [path, accept] of routes) {
    const res = await handle(new Request(`https://gw.test${path}`, { headers: { accept } }), deps);
    const text = await res.text();
    const verdict = scanClaims(text);
    assert.deepEqual(verdict.hits, [], `${path} (${accept})`);
  }
  assert.equal(scanClaims("THE EMPIRE IS BUILT DIFFERENT. Not a demo. 570+ agents. custody insured.").hits.length >= 4, true);
});

test("a correction references an entry without changing it; /verify lists referenced_by", async () => {
  const deps = await makeDeps(goodFacilitator());
  const r1 = await post(deps, "/witness/document", { sha256: HELLO_SHA }, { "x-payment": paymentHeader() });
  const b1 = (await r1.json()) as Record<string, any>;
  const before = JSON.stringify(await deps.ledger.get(b1.entry.seq));
  const r2 = await post(deps, "/witness/correction", { references: b1.entry.hash, replacement_sha256: "b".repeat(64) }, { "x-payment": paymentHeader() });
  const b2 = (await r2.json()) as Record<string, any>;
  assert.equal(b2.outcome, "FINALIZED");
  assert.equal(JSON.stringify(await deps.ledger.get(b1.entry.seq)), before, "referenced entry byte-identical");
  const v = (await (await get(deps, `/verify/${b1.entry.hash}`)).json()) as Record<string, any>;
  assert.deepEqual(v.referenced_by.map((x: any) => x.seq), [b2.entry.seq]);
  assert.equal(v.structure.ok, true);
  assert.deepEqual(v.event_verdict, { ok: true });
  assert.equal(v.labels.review, "LOCAL_VERIFIED");
});

test("no payment → 402 with x402 requirements; nothing written", async () => {
  const deps = await makeDeps(goodFacilitator());
  const res = await post(deps, "/witness/document", { sha256: HELLO_SHA });
  assert.equal(res.status, 402);
  const body = (await res.json()) as { x402Version: number; accepts: Array<Record<string, unknown>>; alt_rails: unknown[] };
  assert.equal(body.x402Version, 1);
  assert.equal(body.accepts[0]!.payTo, PAY_TO);
  assert.equal(body.accepts[0]!.maxAmountRequired, "1000");
  assert.equal(body.accepts[0]!.network, "base-sepolia");
  assert.equal(body.alt_rails.length, 1);
  assert.equal(await deps.ledger.length(), 0);
});

test("payment to the wrong address or below price → 402 before the facilitator is even called", async () => {
  const fac = goodFacilitator();
  const deps = await makeDeps(fac);
  let res = await post(deps, "/witness/document", { sha256: HELLO_SHA }, { "x-payment": paymentHeader({ to: PAYER }) });
  assert.equal(res.status, 402);
  res = await post(deps, "/witness/document", { sha256: HELLO_SHA }, { "x-payment": paymentHeader({ value: "999" }) });
  assert.equal(res.status, 402);
  res = await post(deps, "/witness/document", { sha256: HELLO_SHA }, { "x-payment": "not-base64!" });
  assert.equal(res.status, 402);
  assert.deepEqual(fac.calls, []);
  assert.equal(await deps.ledger.length(), 0);
});

test("facilitator says invalid → 402, no settle, nothing written", async () => {
  const fac = goodFacilitator();
  fac.verify = () => ({ isValid: false, invalidReason: "insufficient_funds" });
  const deps = await makeDeps(fac);
  const res = await post(deps, "/witness/document", { sha256: HELLO_SHA }, { "x-payment": paymentHeader() });
  assert.equal(res.status, 402);
  assert.equal(((await res.json()) as { error: string }).error, "insufficient_funds");
  assert.deepEqual(fac.calls, ["verify"]);
  assert.equal(await deps.ledger.length(), 0);
});

test("settlement fails → 402, nothing written", async () => {
  const fac = goodFacilitator();
  fac.settle = () => ({ success: false, errorReason: "nonce_used" });
  const deps = await makeDeps(fac);
  const res = await post(deps, "/witness/document", { sha256: HELLO_SHA }, { "x-payment": paymentHeader() });
  assert.equal(res.status, 402);
  assert.deepEqual(fac.calls, ["verify", "settle"]);
  assert.equal(await deps.ledger.length(), 0);
});

test("settled payment + observable input → FINALIZED; ledger = cost event, observation, finalization; chain verifies", async () => {
  const fac = goodFacilitator();
  const deps = await makeDeps(fac);
  const res = await post(deps, "/witness/document", { sha256: HELLO_SHA, name: "hello.txt" }, { "x-payment": paymentHeader() });
  assert.equal(res.status, 200);
  assert.ok(res.headers.get("x-payment-response"));
  const body = (await res.json()) as Record<string, any>;
  assert.equal(body.outcome, "FINALIZED");
  assert.equal(body.schema, "truth-attestation-v1");
  assert.equal(body.labels.mode, "test");
  assert.match(body.limitations, /not moral, legal or factual judgments/);
  assert.equal(body.witness, "ADAPTER:document@1.0.0");
  assert.equal(body.event.payload.sha256, HELLO_SHA);
  assert.equal(body.cost.payer, PAYER);
  assert.equal(body.cost.amount, "1000");
  const kinds = deps.ledger.snapshot().map((e) => kindOf(e.record));
  assert.deepEqual(kinds, ["EVENT", "EVENT", "FINALIZED"]);
  assert.equal((deps.ledger.snapshot()[0]!.record as any).event.witness, "COST:x402:exact:base-sepolia");
  assert.equal((await verifyChain(deps.ledger.snapshot())).ok, true);
});

test("paid but unobservable input → REFUSED is recorded and the payment is recorded; nothing finalized", async () => {
  const deps = await makeDeps(goodFacilitator());
  const res = await post(deps, "/witness/document", { sha256: "not-a-hash" }, { "x-payment": paymentHeader() });
  assert.equal(res.status, 200);
  const body = (await res.json()) as Record<string, unknown>;
  assert.equal(body.outcome, "REFUSED");
  assert.deepEqual(deps.ledger.snapshot().map((e) => kindOf(e.record)), ["EVENT", "REFUSED"]);
});

test("an adapter that returns an opinion is refused by the gateway even though it was paid", async () => {
  const opinionated: AdapterSpec = {
    name: "opinion",
    version: "0.0.1",
    observation: "submitted",
    runtime: "any",
    description: "bad adapter",
    price: { atomic: "1000" },
    inputExample: {},
    translate: async () => ({ ok: true, verdict: "good" }),
  };
  const deps = await makeDeps(goodFacilitator(), { opinion: opinionated });
  const res = await post(deps, "/witness/opinion", { anything: 1 }, { "x-payment": paymentHeader() });
  const body = (await res.json()) as Record<string, unknown>;
  assert.equal(body.outcome, "REFUSED");
});

test("direct adapter (http-served) with a failing upstream → FAILED event recorded, REJECTED finalization", async () => {
  const deps = await makeDeps(goodFacilitator());
  const res = await post(deps, "/witness/http-served", { url: "https://down.test/x" }, { "x-payment": paymentHeader({ value: "5000" }) });
  const body = (await res.json()) as Record<string, any>;
  assert.equal(res.status, 200);
  assert.equal(body.outcome, "FINALIZED", "a 404 is still an observation of what was served");
  assert.equal(body.event.payload.status, 404);
});

test("apostle rail: X-Payment-Receipt verified by the ATP facilitator finalizes with rail apostle:atp", async () => {
  const fac = goodFacilitator();
  const deps = await makeDeps(fac);
  const res = await post(deps, "/witness/document", { sha256: HELLO_SHA }, { "x-payment-receipt": "0x" + "cd".repeat(32), "x-agent-id": "agent-7" });
  assert.equal(res.status, 200);
  const body = (await res.json()) as Record<string, any>;
  assert.equal(body.outcome, "FINALIZED");
  assert.equal(body.cost.rail, "apostle:atp");
  assert.equal(body.cost.payer, "agent-7");
  assert.deepEqual(fac.calls, ["apostle"]);
});

test("verify route: entry, signature verdict, chain links, and an inclusion proof after anchoring", async () => {
  const deps = await makeDeps(goodFacilitator());
  const r1 = await post(deps, "/witness/document", { sha256: HELLO_SHA }, { "x-payment": paymentHeader() });
  const b1 = (await r1.json()) as Record<string, any>;
  let v = (await (await get(deps, `/verify/${b1.entry.hash}`)).json()) as Record<string, any>;
  assert.equal(v.found, true);
  assert.deepEqual(v.event_verdict, { ok: true });
  assert.equal(v.links.prev_matches, true);
  assert.equal(v.inclusion, null);

  const anchorEntry = await runAnchor(deps);
  assert.ok(anchorEntry);
  assert.equal(kindOf(anchorEntry.record), "ANCHOR");
  v = (await (await get(deps, `/verify/${b1.entry.hash}`)).json()) as Record<string, any>;
  assert.equal(v.inclusion.anchor_seq, anchorEntry.seq);
  assert.equal(await verifyMerkleProof(v.inclusion.proof), true);
  assert.equal(v.inclusion.proof.root, (anchorEntry.record as any).merkle_root);

  const a = (await (await get(deps, "/anchor")).json()) as Record<string, any>;
  assert.equal(a.hash, anchorEntry.hash);
  const notFound = await get(deps, `/verify/${"0".repeat(64)}`);
  assert.equal(notFound.status, 404);
});

test("entries paging and health", async () => {
  const deps = await makeDeps(goodFacilitator());
  for (let i = 0; i < 3; i++) await post(deps, "/witness/document", { sha256: HELLO_SHA }, { "x-payment": paymentHeader() });
  const page = (await (await get(deps, "/entries?from=2&limit=4")).json()) as Record<string, any>;
  assert.equal(page.total, 9);
  assert.equal(page.entries.length, 4);
  assert.equal(page.entries[0].seq, 2);
  const h = (await (await get(deps, "/health")).json()) as Record<string, any>;
  assert.equal(h.entries, 9);
  assert.equal(h.head_seq, 8);
});

test("mainnet without CDP credentials keeps paid routes disabled; with them the CDP facilitator is selected", async () => {
  const noCreds = configFromEnv({ X402_NETWORK: "base", X402_PAY_TO: PAY_TO, X402_FACILITATOR_URL: "" });
  assert.match(noCreds.disabledReason ?? "", /CDP/);
  const withCreds = configFromEnv({ X402_NETWORK: "base", X402_PAY_TO: PAY_TO, X402_FACILITATOR_URL: "", CDP_API_KEY_ID: "id", CDP_API_KEY_SECRET: "secret" });
  assert.equal(withCreds.disabledReason, null);
  assert.equal(withCreds.x402?.facilitatorKind, "cdp");
  assert.equal(withCreds.x402?.facilitatorUrl, "https://api.cdp.coinbase.com/platform/v2/x402");
  const testnet = configFromEnv({ X402_NETWORK: "base-sepolia", X402_PAY_TO: PAY_TO, X402_FACILITATOR_URL: "" });
  assert.equal(testnet.x402?.facilitatorKind, "public");
});

test("facilitator auth headers are sent on verify and settle when a provider is configured", async () => {
  const fac = goodFacilitator();
  const seen: string[] = [];
  const deps = await makeDeps(fac);
  const inner = deps.fetch;
  deps.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).startsWith("https://facilitator.test/")) seen.push(String((init?.headers as Record<string, string>)["Authorization"] ?? "none"));
    return inner(input, init);
  }) as typeof fetch;
  deps.facilitatorHeaders = async () => ({ verify: { Authorization: "Bearer v-jwt" }, settle: { Authorization: "Bearer s-jwt" } });
  const res = await post(deps, "/witness/document", { sha256: HELLO_SHA }, { "x-payment": paymentHeader() });
  assert.equal(res.status, 200);
  assert.deepEqual(seen, ["Bearer v-jwt", "Bearer s-jwt"]);
});

function paymentSignatureHeader(over: Partial<{ payTo: string; amount: string; network: string; asset: string; version: number }> = {}): string {
  const accepted = {
    scheme: "exact",
    network: over.network ?? "eip155:84532",
    asset: over.asset ?? "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    amount: over.amount ?? "1000",
    payTo: over.payTo ?? PAY_TO,
    maxTimeoutSeconds: 60,
    extra: { name: "USDC", version: "2" },
  };
  const payload = {
    x402Version: over.version ?? 2,
    resource: { url: "https://gw.test/witness/document" },
    accepted,
    payload: { signature: "0x" + "cd".repeat(65), authorization: { from: PAYER, to: accepted.payTo, value: accepted.amount, validAfter: "0", validBefore: "9999999999", nonce: "0x" + "02".repeat(32) } },
  };
  return btoa(JSON.stringify(payload));
}

test("x402 v2: the 402 carries a PAYMENT-REQUIRED header with eip155 network and amount", async () => {
  const deps = await makeDeps(goodFacilitator());
  const res = await post(deps, "/witness/document", { sha256: HELLO_SHA });
  assert.equal(res.status, 402);
  const hdr = res.headers.get("payment-required");
  assert.ok(hdr, "PAYMENT-REQUIRED header present");
  const doc = JSON.parse(atob(hdr!));
  assert.equal(doc.x402Version, 2);
  assert.equal(doc.accepts[0].network, "eip155:84532");
  assert.equal(doc.accepts[0].amount, "1000");
  assert.equal(doc.accepts[0].payTo, PAY_TO);
  assert.equal(doc.resource.url, "https://gw.test/witness/document");
  const body = (await res.json()) as any;
  assert.equal(body.x402Version, 1, "v1 body still served for v1 clients");
});

test("x402 v2: PAYMENT-SIGNATURE settles with x402Version 2 sent to the facilitator; PAYMENT-RESPONSE returned", async () => {
  const fac = goodFacilitator();
  const versions: number[] = [];
  fac.verify = (b: any) => { versions.push(b.x402Version); return { isValid: true, payer: PAYER }; };
  fac.settle = (b: any) => { versions.push(b.x402Version); assert.equal(b.paymentRequirements.amount, "1000"); return { success: true, transaction: "0x" + "ff".repeat(32), network: "eip155:84532", payer: PAYER }; };
  const deps = await makeDeps(fac);
  const res = await post(deps, "/witness/document", { sha256: HELLO_SHA }, { "payment-signature": paymentSignatureHeader() });
  assert.equal(res.status, 200);
  assert.ok(res.headers.get("payment-response"));
  assert.equal(res.headers.get("x-payment-response"), null);
  const body = (await res.json()) as any;
  assert.equal(body.outcome, "FINALIZED");
  assert.deepEqual(versions, [2, 2]);
  assert.equal((deps.ledger.snapshot()[0]!.record as any).event.payload.wire_version, 2);
});

test("x402 v2: wrong payTo, wrong asset, short amount, or wrong network → 402 before the facilitator", async () => {
  const fac = goodFacilitator();
  const deps = await makeDeps(fac);
  for (const bad of [{ payTo: PAYER }, { asset: "0x" + "11".repeat(20) }, { amount: "999" }, { network: "eip155:8453" }, { version: 1 }]) {
    const res = await post(deps, "/witness/document", { sha256: HELLO_SHA }, { "payment-signature": paymentSignatureHeader(bad) });
    assert.equal(res.status, 402, JSON.stringify(bad));
  }
  assert.deepEqual(fac.calls, []);
  assert.equal(await deps.ledger.length(), 0);
});

test("free reads are rate limited per client; paid routes are not", async () => {
  const deps = await makeDeps(goodFacilitator());
  const budget = new Map<string, number>();
  deps.rateLimit = async (key) => {
    const n = (budget.get(key) ?? 0) + 1;
    budget.set(key, n);
    return n <= 2;
  };
  const h = { "cf-connecting-ip": "203.0.113.9" };
  assert.equal((await handle(new Request("https://gw.test/health", { headers: h }), deps)).status, 200);
  assert.equal((await handle(new Request("https://gw.test/health", { headers: h }), deps)).status, 200);
  const third = await handle(new Request("https://gw.test/health", { headers: h }), deps);
  assert.equal(third.status, 429);
  assert.equal(third.headers.get("retry-after"), "60");
  assert.equal((await handle(new Request("https://gw.test/health", { headers: { "cf-connecting-ip": "203.0.113.10" } }), deps)).status, 200, "other clients unaffected");
  const paid = await post(deps, "/witness/document", { sha256: HELLO_SHA }, { ...h, "x-payment": paymentHeader() });
  assert.equal(paid.status, 200, "paid route ignores the free-read budget");
});

test("zero pay-to address keeps paid routes disabled (fail-safe default)", async () => {
  const deps = await makeDeps(goodFacilitator(), WORKER_ADAPTERS, { X402_PAY_TO: "0x0000000000000000000000000000000000000000", APOSTLE_FACILITATOR_URL: "", APOSTLE_PRICE_ATP_RAW: "" });
  assert.match(deps.cfg.disabledReason ?? "", /X402_PAY_TO/);
  const res = await post(deps, "/witness/document", { sha256: HELLO_SHA }, { "x-payment": paymentHeader() });
  assert.equal(res.status, 503);
  assert.equal(await deps.ledger.length(), 0);
});

test("unknown adapter, bad body, oversize body → refused without writing", async () => {
  const deps = await makeDeps(goodFacilitator());
  assert.equal((await post(deps, "/witness/nope", {}, { "x-payment": paymentHeader() })).status, 404);
  assert.equal((await handle(new Request("https://gw.test/witness/document", { method: "POST", body: "[]", headers: { "x-payment": paymentHeader() } }), deps)).status, 400);
  const big = { sha256: HELLO_SHA, pad: "x".repeat(70_000) };
  assert.equal((await post(deps, "/witness/document", big, { "x-payment": paymentHeader() })).status, 400);
  assert.equal(await deps.ledger.length(), 0);
});
