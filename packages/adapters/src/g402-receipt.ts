import { isObject, normHash, optionalString, type AdapterSpec } from "./types.ts";

/**
 * Witnesses that a party submitted a genesis402-receipt-v1 (the UnyKorn
 * console's producer format, ADR-0006). What is recorded is the receipt's
 * identity and integrity commitments as submitted: id, kind, mode, the
 * canonical body hash, the leaf hash, the segment root, and the issuer key.
 *
 * Deliberately NOT recorded: `decision`, `truthLabels`, `claim`, `policy`,
 * `body`. Those are the issuer's statements about the receipt's subject. The
 * substrate records that the receipt existed at this time; it does not adopt
 * or evaluate what the receipt says. Direction is one way: console → substrate.
 */
const RECEIPT_ID = /^g402_rcpt_[0-9a-f]{12}$/;
const KEY_ID = /^g402-key-[0-9a-f]{16}$/;
const KIND = /^[a-z0-9_]+(\.[a-z0-9_]+)+$/;
const MODES = new Set(["LOCAL", "DRY_RUN", "TESTNET", "LIVE", "SIMULATED"]);

function sha256Prefixed(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const m = /^sha256:([0-9a-f]{64})$/.exec(v.trim());
  return m ? m[1] : undefined;
}

export const g402Receipt: AdapterSpec = {
  name: "g402-receipt",
  version: "1.0.0",
  observation: "submitted",
  runtime: "any",
  description: "Records the submission of a genesis402-receipt-v1 by its id, kind, mode, canonical body hash, leaf hash, segment root and issuer key. The receipt's decision, labels and claims are not recorded.",
  price: { atomic: "1000" },
  inputExample: {
    receiptVersion: "genesis402-receipt-v1",
    receiptId: "g402_rcpt_46e945cf29cd",
    kind: "payment.dry_run",
    mode: "DRY_RUN",
    issuer: { id: "unykorn-control", keyId: "g402-key-25a7b4924d932aa9" },
    lifecycle: { issuedAt: "2026-09-13T11:59:13.828Z" },
    integrity: {
      canonicalBodyHash: "sha256:13dd28671f537cf65f4e8e50cf132209f778e762da6ce812d4a5d8090b3ba467",
      leafHash: "500f1e63a5aa15356bce372a2affa5f2f3b5fe2d58f41370dc3439c2f75679f9",
      segmentRoot: "6c8f938e75f08fd65969950a764eba5b252d517acf626d32810d92546b6b9212",
    },
  },
  async translate(input) {
    if (!isObject(input)) return null;
    if (input.receiptVersion !== "genesis402-receipt-v1") return null;
    const receiptId = optionalString(input.receiptId, 40);
    const kind = optionalString(input.kind, 120);
    const mode = optionalString(input.mode, 16);
    const issuer = isObject(input.issuer) ? input.issuer : null;
    const integrity = isObject(input.integrity) ? input.integrity : null;
    const lifecycle = isObject(input.lifecycle) ? input.lifecycle : null;
    if (!receiptId || !RECEIPT_ID.test(receiptId)) return null;
    if (!kind || !KIND.test(kind)) return null;
    if (!mode || !MODES.has(mode)) return null;
    if (!issuer || !integrity) return null;
    const issuerId = optionalString(issuer.id, 64);
    const keyId = optionalString(issuer.keyId, 40);
    const canonicalBodyHash = sha256Prefixed(integrity.canonicalBodyHash);
    const leafHash = normHash(integrity.leafHash);
    if (!issuerId || !keyId || !KEY_ID.test(keyId) || !canonicalBodyHash || !leafHash) return null;
    const issuedAt = optionalString(lifecycle?.issuedAt, 40);
    return {
      kind: "g402_receipt",
      receipt_version: "genesis402-receipt-v1",
      receipt_id: receiptId,
      receipt_kind: kind,
      mode,
      issuer_id: issuerId,
      issuer_key_id: keyId,
      issued_at: issuedAt && !Number.isNaN(Date.parse(issuedAt)) ? issuedAt : null,
      canonical_body_hash: canonicalBodyHash,
      leaf_hash: leafHash,
      segment_root: normHash(integrity.segmentRoot) ?? null,
      submitted_by: optionalString(input.submitted_by, 128) ?? null,
    };
  },
};
