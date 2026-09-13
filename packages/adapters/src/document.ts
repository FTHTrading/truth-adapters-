import { isObject, normHash, optionalInt, optionalString, type AdapterSpec } from "./types.ts";

/**
 * Witnesses that a party submitted a document digest at a point in time.
 * The gateway never sees the document. What is observed is the submission:
 * digest, declared size/type/name, and who paid to submit it.
 */
export const document: AdapterSpec = {
  name: "document",
  version: "1.0.0",
  observation: "submitted",
  runtime: "any",
  description: "Records the submission of a SHA-256 document digest with declared size, media type and name.",
  price: { atomic: "1000" },
  inputExample: { sha256: "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08", bytes: 3, media_type: "text/plain", name: "hello.txt" },
  async translate(input) {
    if (!isObject(input)) return null;
    const sha256 = normHash(input.sha256);
    if (!sha256) return null;
    return {
      kind: "document",
      sha256,
      bytes: optionalInt(input.bytes) ?? null,
      media_type: optionalString(input.media_type, 128) ?? null,
      name: optionalString(input.name, 256) ?? null,
      submitted_by: optionalString(input.submitted_by, 128) ?? null,
    };
  },
};
