import { isObject, normHash, optionalInt, optionalString, type AdapterSpec } from "./types.ts";

/**
 * Witnesses that a party submitted the digests of an AI prompt/output pair,
 * with the provider, model and request id they declared. Content never leaves
 * the caller; only digests are recorded. Whether the output was "good",
 * "safe" or "accurate" is not observable here and is not recorded.
 */
export const aiOutput: AdapterSpec = {
  name: "ai-output",
  version: "1.0.0",
  observation: "submitted",
  runtime: "any",
  description: "Records the submission of prompt and output SHA-256 digests with declared provider, model and request id.",
  price: { atomic: "1000" },
  inputExample: {
    provider: "anthropic",
    model: "claude-fable-5-1",
    request_id: "msg_01ABC",
    prompt_sha256: "2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae",
    output_sha256: "fcde2b2edba56bf408601fb721fe9b5c338d10ee429ea04fae5511b68fbf8fb9",
    tokens_in: 12,
    tokens_out: 34,
  },
  async translate(input) {
    if (!isObject(input)) return null;
    const prompt_sha256 = normHash(input.prompt_sha256);
    const output_sha256 = normHash(input.output_sha256);
    const provider = optionalString(input.provider, 64);
    const model = optionalString(input.model, 128);
    if (!prompt_sha256 || !output_sha256 || !provider || !model) return null;
    return {
      kind: "ai_output",
      provider,
      model,
      request_id: optionalString(input.request_id, 128) ?? null,
      prompt_sha256,
      output_sha256,
      tokens_in: optionalInt(input.tokens_in) ?? null,
      tokens_out: optionalInt(input.tokens_out) ?? null,
      submitted_by: optionalString(input.submitted_by, 128) ?? null,
    };
  },
};
