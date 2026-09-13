import type { Clock } from "./clock.ts";
import { systemClock } from "./clock.ts";
import type { Entry } from "./ledger.ts";
import { merkleProof, merkleRoot, type InclusionProof } from "./merkle.ts";

/** SPECIFICATION.md § Anchoring. The root is over entry hashes 0..entries-1. */
export interface Anchor {
  merkle_root: string;
  entries: number;
  head_hash: string;
  ts: number;
}

export async function buildAnchor(entries: Entry[], clock: Clock = systemClock): Promise<Anchor> {
  const hashes = entries.map((e) => e.hash);
  return { merkle_root: await merkleRoot(hashes), entries: hashes.length, head_hash: hashes[hashes.length - 1]!, ts: clock() };
}

export async function proveInclusion(entries: Entry[], anchor: Anchor, seq: number): Promise<InclusionProof> {
  if (seq >= anchor.entries) throw new RangeError("entry is newer than the anchor");
  const hashes = entries.slice(0, anchor.entries).map((e) => e.hash);
  if (hashes.length !== anchor.entries) throw new Error("ledger shorter than anchor");
  const proof = await merkleProof(hashes, seq);
  if (proof.root !== anchor.merkle_root) throw new Error("ledger does not match anchor");
  return proof;
}
