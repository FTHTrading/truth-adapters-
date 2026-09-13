/**
 * Port of the frozen substrate's tests/ADVERSARIAL.md categories with real
 * assertions against the ledger. The original suite hard-codes `passed: true`
 * for 8 of its 13 cases; here every case inspects what was actually recorded.
 *
 * NO MOCKING OF THE LEDGER. Refusals and rejections must be present as history.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createWitness,
  generateKeys,
  kindOf,
  MemoryLedger,
  StateMachines,
  submit,
  type CostProof,
  type WitnessKeys,
} from "../src/index.ts";

let t = 1_700_000_000_000;
const clock = () => t++;

async function setup() {
  const keys = await generateKeys();
  const ledger = new MemoryLedger(clock);
  const popeye = createWitness("POPEYE", keys, (i) => (i ? i : null), { clock });
  const silent = createWitness("SILENT", keys, () => null, { clock });
  const malformed = createWitness("MALFORMED", keys, (i) => {
    const d = i as Record<string, unknown> | null;
    return d && d.required_field ? d : null;
  }, { clock });
  return { keys, ledger, popeye, silent, malformed };
}

/** A real cost: a settlement observed by a cost witness and recorded in this ledger. */
async function paidCost(ledger: MemoryLedger, keys: WitnessKeys, amount = "1000", payer = "0xpayer"): Promise<CostProof> {
  const costWitness = createWitness("COST:TEST", keys, (i) => i, { clock });
  const att = await submit(ledger, costWitness, { rail: "test", amount, payer, reference: "tx_1" });
  assert.equal(att.outcome, "OBSERVED");
  return { rail: "test", asset: "TEST", amount, payer, reference: "tx_1", witnessed_event_id: att.event!.id };
}

function kinds(ledger: MemoryLedger): string[] {
  return ledger.snapshot().map((e) => kindOf(e.record));
}

// CATEGORY 1: WITNESS ABSENCE
test("1.1 silent witness + commitment → REFUSED, recorded, nothing finalized", async () => {
  const { ledger, keys, silent } = await setup();
  const cost = await paidCost(ledger, keys);
  const att = await submit(ledger, silent, { data: "test" }, cost, { clock });
  assert.equal(att.outcome, "REFUSED");
  assert.equal(kinds(ledger).at(-1), "REFUSED");
  assert.equal(kinds(ledger).filter((k) => k === "FINALIZED").length, 0);
});

test("1.2 null input + commitment → REFUSED", async () => {
  const { ledger, keys, popeye } = await setup();
  const cost = await paidCost(ledger, keys);
  const att = await submit(ledger, popeye, null, cost, { clock });
  assert.equal(att.outcome, "REFUSED");
  assert.equal(kinds(ledger).at(-1), "REFUSED");
});

test("1.3 state transition without witness → REJECTED and recorded", async () => {
  const { ledger } = await setup();
  const sm = new StateMachines(ledger, clock);
  await sm.init("m1");
  assert.equal(await sm.transition("m1", "OBSERVED", undefined, 0n), false);
  assert.equal(sm.state("m1"), "INIT");
  const last = ledger.snapshot().at(-1)!.record as { result: string };
  assert.equal(last.result, "TRANSITION_REJECTED");
});

// CATEGORY 2: COST EVASION
test("2.1 zero stake commitment → REJECTED, event still recorded", async () => {
  const { ledger, keys, popeye } = await setup();
  const cost = await paidCost(ledger, keys, "0");
  const att = await submit(ledger, popeye, { work: "zero cost" }, cost, { clock });
  assert.equal(att.outcome, "REJECTED");
  assert.deepEqual(kinds(ledger).slice(-2), ["EVENT", "REJECTED"]);
});

test("2.2 negative stake commitment → REJECTED", async () => {
  const { ledger, keys, popeye } = await setup();
  const cost = await paidCost(ledger, keys, "-50");
  const att = await submit(ledger, popeye, { work: "negative cost" }, cost, { clock });
  assert.equal(att.outcome, "REJECTED");
  assert.equal(kinds(ledger).at(-1), "REJECTED");
});

test("2.3 claim without minimum stake → REJECTED", async () => {
  const { ledger, popeye } = await setup();
  const sm = new StateMachines(ledger, clock);
  await sm.init("m2");
  const obs = await popeye.observe({ work: "test" });
  assert.equal(await sm.transition("m2", "OBSERVED", obs!.witness, 0n), true);
  assert.equal(await sm.transition("m2", "CLAIMED", undefined, 0n), false);
  assert.equal(sm.state("m2"), "OBSERVED");
});

test("2.4 cost proof that was never witnessed in this ledger → REJECTED", async () => {
  const { ledger, popeye } = await setup();
  const fake: CostProof = { rail: "x402", asset: "USDC", amount: "1000", payer: "0xp", reference: "tx", witnessed_event_id: "f".repeat(64) };
  const att = await submit(ledger, popeye, { work: "forged cost" }, fake, { clock });
  assert.equal(att.outcome, "REJECTED");
  assert.equal(att.reason, "cost event not in this ledger");
});

test("2.5 float or non-integer amounts are not money → REJECTED", async () => {
  const { ledger, keys, popeye } = await setup();
  const cost = await paidCost(ledger, keys, "0.5");
  const att = await submit(ledger, popeye, { work: "float" }, cost, { clock });
  assert.equal(att.outcome, "REJECTED");
});

// CATEGORY 3: INVALID STATE TRANSITIONS
test("3.1 jump INIT → FINALIZED → REJECTED", async () => {
  const { ledger } = await setup();
  const sm = new StateMachines(ledger, clock);
  await sm.init("m3");
  assert.equal(await sm.transition("m3", "FINALIZED", undefined, 100n), false);
});

test("3.2 backward transition → REJECTED", async () => {
  const { ledger, popeye } = await setup();
  const sm = new StateMachines(ledger, clock);
  await sm.init("m4");
  const obs = await popeye.observe({ work: "forward" });
  await sm.transition("m4", "OBSERVED", obs!.witness, 0n);
  await sm.transition("m4", "CLAIMED", undefined, 10n);
  assert.equal(await sm.transition("m4", "OBSERVED", obs!.witness, 0n), false);
  assert.equal(sm.state("m4"), "CLAIMED");
});

test("3.3 nonexistent machine → REJECTED and recorded", async () => {
  const { ledger } = await setup();
  const sm = new StateMachines(ledger, clock);
  assert.equal(await sm.transition("nope", "OBSERVED", "FAKE", 0n), false);
  const last = ledger.snapshot().at(-1)!.record as { reason: string };
  assert.equal(last.reason, "Machine not found");
});

test("3.4 full valid lifecycle reaches FINALIZED", async () => {
  const { ledger, popeye } = await setup();
  const sm = new StateMachines(ledger, clock);
  await sm.init("m5");
  const obs = await popeye.observe({ work: "lifecycle" });
  assert.equal(await sm.transition("m5", "OBSERVED", obs!.witness, 0n), true);
  assert.equal(await sm.transition("m5", "CLAIMED", undefined, 10n), true);
  assert.equal(await sm.transition("m5", "VALIDATED", obs!.witness, 10n), true);
  assert.equal(await sm.transition("m5", "FINALIZED", undefined, 10n), true);
  assert.equal(sm.state("m5"), "FINALIZED");
});

// CATEGORY 4: SILENCE STABILITY
test("4.1 silent witness without commitment → REFUSED recorded", async () => {
  const { ledger, silent } = await setup();
  const att = await submit(ledger, silent, { any: "data" }, undefined, { clock });
  assert.equal(att.outcome, "REFUSED");
  assert.equal(kinds(ledger).at(-1), "REFUSED");
});

test("4.2 malformed input with commitment → REFUSED", async () => {
  const { ledger, keys, malformed } = await setup();
  const cost = await paidCost(ledger, keys);
  const att = await submit(ledger, malformed, { wrong: "field" }, cost, { clock });
  assert.equal(att.outcome, "REFUSED");
});

// CATEGORY 5: INTERPRETATION INJECTION
test("5.1 explanation fields are stored as data and never surface as a system field", async () => {
  const { ledger, keys, popeye } = await setup();
  const cost = await paidCost(ledger, keys);
  const att = await submit(ledger, popeye, { work: "legit", explanation: "why it is good" }, cost, { clock });
  assert.equal(att.outcome, "FINALIZED");
  const fin = att.finalization!.record as Record<string, unknown>;
  assert.deepEqual(Object.keys(fin).sort(), ["claimant", "cost", "kind", "reference", "ts"]);
  assert.deepEqual(att.event!.payload, { work: "legit", explanation: "why it is good" });
});

test("5.2 meta-claims about other events are recorded, not acted upon", async () => {
  const { ledger, keys, popeye } = await setup();
  const first = await submit(ledger, popeye, { work: "target" }, await paidCost(ledger, keys), { clock });
  const before = ledger.snapshot().length;
  const meta = await submit(ledger, popeye, { claims_about: first.event!.id, judgment: "invalid" }, await paidCost(ledger, keys), { clock });
  assert.equal(meta.outcome, "FINALIZED");
  const targetStill = await ledger.findByHash(first.entry!.hash);
  assert.ok(targetStill, "earlier history untouched");
  assert.equal(ledger.snapshot().length, before + 3);
});

// CATEGORY 6: FAILED OBSERVATIONS
test("6.1 a FAILED observation with cost is recorded but never finalized", async () => {
  const { ledger, keys } = await setup();
  const failing = createWitness("FAILING", keys, () => {
    throw new Error("rpc timeout");
  }, { clock });
  const att = await submit(ledger, failing, { x: 1 }, await paidCost(ledger, keys), { clock });
  assert.equal(att.outcome, "REJECTED");
  assert.equal(att.event!.type, "FAILED");
  assert.deepEqual(kinds(ledger).slice(-2), ["EVENT", "REJECTED"]);
});

test("the suite as a whole refuses more than it accepts", async () => {
  const { ledger, keys, popeye, silent, malformed } = await setup();
  await submit(ledger, silent, {}, await paidCost(ledger, keys), { clock });
  await submit(ledger, popeye, null, await paidCost(ledger, keys), { clock });
  await submit(ledger, popeye, { w: 1 }, await paidCost(ledger, keys, "0"), { clock });
  await submit(ledger, malformed, { w: 1 }, await paidCost(ledger, keys), { clock });
  await submit(ledger, popeye, { w: 1 }, await paidCost(ledger, keys), { clock });
  const k = kinds(ledger);
  const refusedOrRejected = k.filter((x) => x === "REFUSED" || x === "REJECTED").length;
  const finalized = k.filter((x) => x === "FINALIZED").length;
  assert.ok(refusedOrRejected > finalized, `${refusedOrRejected} refusals vs ${finalized} finalizations`);
});
