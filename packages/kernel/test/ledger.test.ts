import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GENESIS_PREV, MemoryLedger, verifyChain } from "../src/index.ts";
import { FileLedger, IntegrityError } from "../src/ledger-file.ts";

const fixedClock = () => 1_700_000_000_000;

test("entries chain from genesis and verify", async () => {
  const l = new MemoryLedger(fixedClock);
  const e0 = await l.append({ kind: "MACHINE", n: 0 });
  const e1 = await l.append({ kind: "MACHINE", n: 1 });
  assert.equal(e0.seq, 0);
  assert.equal(e0.prev, GENESIS_PREV);
  assert.equal(e1.prev, e0.hash);
  const v = await verifyChain(l.snapshot());
  assert.equal(v.ok, true);
  assert.equal(v.head, e1.hash);
});

test("editing a past record breaks the chain at that seq (tamper-evident)", async () => {
  const l = new MemoryLedger(fixedClock);
  for (let i = 0; i < 5; i++) await l.append({ kind: "MACHINE", n: i });
  const snap = l.snapshot().map((e) => ({ ...e, record: { ...(e.record as object) } }));
  (snap[2]!.record as { n: number }).n = 99;
  const v = await verifyChain(snap);
  assert.equal(v.ok, false);
  assert.equal(v.at, 2);
  assert.equal(v.reason, "entry hash mismatch");
});

test("deleting a middle entry breaks the chain", async () => {
  const l = new MemoryLedger(fixedClock);
  for (let i = 0; i < 4; i++) await l.append({ kind: "MACHINE", n: i });
  const snap = l.snapshot();
  snap.splice(1, 1);
  const v = await verifyChain(snap);
  assert.equal(v.ok, false);
  assert.equal(v.at, 1);
});

test("re-hashing a tampered entry still fails because prev no longer matches", async () => {
  const l = new MemoryLedger(fixedClock);
  for (let i = 0; i < 3; i++) await l.append({ kind: "MACHINE", n: i });
  const snap = l.snapshot();
  const forged = new MemoryLedger(fixedClock);
  await forged.append({ kind: "MACHINE", n: 0 });
  await forged.append({ kind: "MACHINE", n: 42 });
  snap[1] = forged.snapshot()[1]!;
  const v = await verifyChain(snap);
  assert.equal(v.ok, false);
  assert.equal(v.at, 2);
  assert.equal(v.reason, "prev hash mismatch");
});

test("concurrent appends never fork the chain (L-05 class)", async () => {
  const l = new MemoryLedger(fixedClock);
  const results = await Promise.all(Array.from({ length: 50 }, (_, i) => l.append({ kind: "MACHINE", i })));
  const seqs = results.map((e) => e.seq).sort((a, b) => a - b);
  assert.deepEqual(seqs, Array.from({ length: 50 }, (_, i) => i));
  assert.equal((await verifyChain(l.snapshot())).ok, true);
});

test("file ledger persists, reopens, and verifies", async () => {
  const dir = mkdtempSync(join(tmpdir(), "truth-"));
  const path = join(dir, "ledger.jsonl");
  const l = await FileLedger.open(path, fixedClock);
  await l.append({ kind: "MACHINE", a: 1 });
  await l.append({ kind: "EVENT", event: { id: "a".repeat(64), type: "OBSERVED", ts: 1, witness: "T", payload: {} } });
  const reopened = await FileLedger.open(path, fixedClock);
  assert.equal(await reopened.length(), 2);
  assert.equal(await reopened.hasEvent("a".repeat(64)), true);
  assert.equal((await reopened.head())!.hash, (await l.head())!.hash);
});

test("file ledger refuses to open a tampered file and repairs nothing (Rule 10)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "truth-"));
  const path = join(dir, "ledger.jsonl");
  const l = await FileLedger.open(path, fixedClock);
  await l.append({ kind: "MACHINE", a: 1 });
  await l.append({ kind: "MACHINE", a: 2 });
  const before = readFileSync(path, "utf8");
  writeFileSync(path, before.replace('"a":1', '"a":7'));
  await assert.rejects(FileLedger.open(path, fixedClock), (err: unknown) => {
    assert.ok(err instanceof IntegrityError);
    assert.equal(err.at, 0);
    return true;
  });
  assert.equal(readFileSync(path, "utf8"), before.replace('"a":1', '"a":7'), "file must be left exactly as found");
});
