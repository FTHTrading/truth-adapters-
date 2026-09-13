import { isObject, normHash, optionalString, type AdapterSpec } from "./types.ts";

/**
 * USAGE.md § 3: "Correction is a new event, not an edit. Wrong history is
 * still history." This adapter records that a party submitted a reference
 * to a prior entry, optionally with the digest of replacement content. The
 * referenced entry is not touched, not flagged, not re-labelled. Verifiers
 * may list corrections that point at an entry; they never change its verdict.
 */
export const correction: AdapterSpec = {
  name: "correction",
  version: "1.0.0",
  observation: "submitted",
  runtime: "any",
  description: "Records the submission of a reference to a prior ledger entry, with an optional replacement digest. Append-only; the referenced entry is unchanged.",
  price: { atomic: "1000" },
  inputExample: { references: "0".repeat(64), replacement_sha256: "1".repeat(64), note_sha256: "2".repeat(64) },
  async translate(input) {
    if (!isObject(input)) return null;
    const references = normHash(input.references);
    if (!references) return null;
    return {
      kind: "correction",
      references,
      replacement_sha256: normHash(input.replacement_sha256) ?? null,
      note_sha256: normHash(input.note_sha256) ?? null,
      submitted_by: optionalString(input.submitted_by, 128) ?? null,
    };
  },
};
