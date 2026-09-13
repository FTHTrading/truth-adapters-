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
  assert.match(x.disclosure, /test network only/);
  assert.equal(x.accepts[0].network, "base-sepolia");
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
