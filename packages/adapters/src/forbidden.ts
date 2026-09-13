/**
 * USAGE.md "How to Test Your Extension", Question 4:
 *   "Does your code decide what something means? If yes → move it outside the substrate."
 *
 * This file makes that question executable. Any adapter payload containing one
 * of these keys (at any depth) is not a translation; it is an opinion, and the
 * witness refuses to observe it. Values are not scanned: a document named
 * "risk-report.pdf" is a fact about a filename, not a judgement.
 */
export const FORBIDDEN_KEYS: readonly string[] = [
  "score",
  "scores",
  "rating",
  "grade",
  "verdict",
  "judgment",
  "judgement",
  "opinion",
  "interpretation",
  "meaning",
  "explanation",
  "reason",
  "reasons",
  "compliant",
  "compliance",
  "valid",
  "invalid",
  "validity",
  "approved",
  "approval",
  "rejected",
  "risk",
  "risky",
  "safe",
  "unsafe",
  "good",
  "bad",
  "fair",
  "unfair",
  "legit",
  "legitimate",
  "fraud",
  "fraudulent",
  "trust",
  "trusted",
  "trustworthy",
  "confidence",
  "recommendation",
  "recommended",
  "correct",
  "incorrect",
  "success",
  "failure",
  "passed",
  "failed",
];

const FORBIDDEN = new Set(FORBIDDEN_KEYS);

function normalizeKey(k: string): string {
  return k.toLowerCase().replace(/[^a-z]/g, "");
}

/** Returns the JSON paths of every forbidden key found. Empty array = translation only. */
export function findForbiddenKeys(value: unknown, path = "$", out: string[] = []): string[] {
  if (Array.isArray(value)) {
    value.forEach((v, i) => findForbiddenKeys(v, `${path}[${i}]`, out));
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN.has(normalizeKey(k))) out.push(`${path}.${k}`);
      findForbiddenKeys(v, `${path}.${k}`, out);
    }
  }
  return out;
}

export function isTranslationOnly(value: unknown): boolean {
  return findForbiddenKeys(value).length === 0;
}
