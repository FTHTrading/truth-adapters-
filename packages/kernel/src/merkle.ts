import { sha256Hex } from "./canonical.ts";

/**
 * Same tree as the frozen substrate's runtime/merkle.ts: pairwise
 * sha256(leftHex + rightHex), odd leaf duplicated. Adds inclusion proofs so a
 * third party can check one entry against a published root without the ledger.
 */
export async function merkleRoot(hashes: string[]): Promise<string> {
  if (hashes.length === 0) throw new Error("Empty ledger");
  let layer = hashes.slice();
  while (layer.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < layer.length; i += 2) {
      const left = layer[i]!;
      const right = layer[i + 1] ?? left;
      next.push(await sha256Hex(left + right));
    }
    layer = next;
  }
  return layer[0]!;
}

export interface ProofStep {
  hash: string;
  position: "left" | "right";
}

export interface InclusionProof {
  leaf: string;
  index: number;
  path: ProofStep[];
  root: string;
}

export async function merkleProof(hashes: string[], index: number): Promise<InclusionProof> {
  if (index < 0 || index >= hashes.length) throw new RangeError("index out of range");
  const leaf = hashes[index]!;
  const path: ProofStep[] = [];
  let layer = hashes.slice();
  let idx = index;
  while (layer.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < layer.length; i += 2) {
      const left = layer[i]!;
      const right = layer[i + 1] ?? left;
      if (i === idx) path.push({ hash: right, position: "right" });
      else if (i + 1 === idx) path.push({ hash: left, position: "left" });
      next.push(await sha256Hex(left + right));
    }
    idx = Math.floor(idx / 2);
    layer = next;
  }
  return { leaf, index, path, root: layer[0]! };
}

export async function verifyMerkleProof(proof: InclusionProof): Promise<boolean> {
  let h = proof.leaf;
  for (const step of proof.path) {
    h = step.position === "right" ? await sha256Hex(h + step.hash) : await sha256Hex(step.hash + h);
  }
  return h === proof.root;
}
