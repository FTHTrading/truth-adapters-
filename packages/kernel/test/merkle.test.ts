import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAnchor, MemoryLedger, merkleProof, merkleRoot, proveInclusion, sha256Hex, verifyMerkleProof } from "../src/index.ts";

const leaves = ["a", "b", "c", "d", "e"].map((s) => s.repeat(64));

test("root of two leaves is sha256(left+right), as in the frozen substrate", async () => {
  const [a, b] = leaves as [string, string];
  assert.equal(await merkleRoot([a, b]), await sha256Hex(a + b));
});

test("odd leaf is duplicated, matching runtime/merkle.ts", async () => {
  const [a, b, c] = leaves as [string, string, string];
  const ab = await sha256Hex(a + b);
  const cc = await sha256Hex(c + c);
  assert.equal(await merkleRoot([a, b, c]), await sha256Hex(ab + cc));
});

test("inclusion proofs verify for every index", async () => {
  const root = await merkleRoot(leaves);
  for (let i = 0; i < leaves.length; i++) {
    const p = await merkleProof(leaves, i);
    assert.equal(p.root, root);
    assert.equal(await verifyMerkleProof(p), true);
  }
});

test("a proof does not verify for a different leaf", async () => {
  const p = await merkleProof(leaves, 1);
  assert.equal(await verifyMerkleProof({ ...p, leaf: "f".repeat(64) }), false);
});

test("anchor + inclusion proof over a ledger", async () => {
  const l = new MemoryLedger(() => 1);
  for (let i = 0; i < 7; i++) await l.append({ kind: "MACHINE", i });
  const anchor = await buildAnchor(l.snapshot(), () => 2);
  assert.equal(anchor.entries, 7);
  const proof = await proveInclusion(l.snapshot(), anchor, 4);
  assert.equal(await verifyMerkleProof(proof), true);
  await l.append({ kind: "MACHINE", i: 7 });
  await assert.rejects(proveInclusion(l.snapshot(), anchor, 7), RangeError);
});

test("empty ledger cannot be anchored", async () => {
  await assert.rejects(merkleRoot([]), /Empty ledger/);
});
