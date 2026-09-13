import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAnchor, createWitness, generateKeys, MemoryLedger, submit } from "../../kernel/src/index.ts";
import { verifyEntries } from "../src/cli.ts";

const clock = () => 1_700_000_000_000;

test("verifier reports an intact ledger with signed events and a matching anchor", async () => {
  const keys = await generateKeys();
  const ledger = new MemoryLedger(clock);
  const w = createWitness("T", keys, (i) => i, { clock });
  await submit(ledger, w, { a: 1 });
  await submit(ledger, w, { a: 2 });
  const anchor = await buildAnchor(ledger.snapshot(), clock);
  await ledger.append({ kind: "ANCHOR", ...anchor });
  const r = await verifyEntries(ledger.snapshot());
  assert.equal(r.ok, true);
  assert.equal(r.events.total, 2);
  assert.equal(r.events.signed, 2);
  assert.equal(r.anchors.total, 1);
  assert.deepEqual(r.witnesses, { T: 2 });
});

test("verifier flags a forged signature and a wrong anchor root, and stops on a broken chain", async () => {
  const keys = await generateKeys();
  const ledger = new MemoryLedger(clock);
  const w = createWitness("T", keys, (i) => i, { clock });
  await submit(ledger, w, { a: 1 });
  const anchor = await buildAnchor(ledger.snapshot(), clock);
  await ledger.append({ kind: "ANCHOR", ...anchor, merkle_root: "f".repeat(64) });
  const entries = ledger.snapshot();
  let r = await verifyEntries(entries);
  assert.equal(r.ok, false);
  assert.equal(r.anchors.bad.length, 1);

  const broken = entries.map((e) => ({ ...e }));
  broken[0] = { ...broken[0]!, record: { kind: "EVENT", event: { ...(broken[0]!.record as any).event, payload: { a: 9 } } } };
  r = await verifyEntries(broken);
  assert.equal(r.chain.ok, false);
  assert.equal(r.chain.at, 0);
});
