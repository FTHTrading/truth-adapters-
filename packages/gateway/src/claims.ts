/**
 * Claims gate (ADR-0002). Scans a served document for forbidden phrases after
 * removing the two standing statements that legitimately name what the
 * system is NOT. Used by tests on every route and by verify-served on live bytes.
 */
import { LIMITATIONS } from "./config.ts";
import { PERIMETER } from "./landing.ts";

export const FORBIDDEN_PHRASES: readonly string[] = [
  "verified true",
  "proves ",
  "proof of correctness",
  "proof of authenticity",
  "authenticated",
  "compliant",
  "compliance",
  "audit-grade",
  "regulator-approved",
  "tamper-proof",
  "unhackable",
  "immutable guarantee",
  "notarized",
  "notary",
  "legally binding",
  "admissible",
  "insured",
  "guaranteed",
  "licensed",
  "registered",
  "FDIC",
  "SIPC",
  "custody",
  "custodian",
  "vault",
  "zero-knowledge",
  "BitGo",
  "UNYKORN 7777",
  "TROPTIONS",
  "2549008J7LUHSQ73SI26",
  "UBEC",
  "570+",
  "empire",
  "not a demo",
];

const CASE_SENSITIVE = new Set(["FDIC", "SIPC", "BitGo", "UBEC", "TROPTIONS", "UNYKORN 7777"]);

export interface ClaimsVerdict {
  ok: boolean;
  hits: Array<{ phrase: string; context: string }>;
}

export function scanClaims(text: string): ClaimsVerdict {
  let body = text.split(LIMITATIONS).join(" ").split(PERIMETER).join(" ");
  // HTML-escaped copies of the same statements.
  const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  body = body.split(escape(LIMITATIONS)).join(" ").split(escape(PERIMETER)).join(" ");
  const hits: ClaimsVerdict["hits"] = [];
  for (const phrase of FORBIDDEN_PHRASES) {
    const hay = CASE_SENSITIVE.has(phrase) ? body : body.toLowerCase();
    const needle = CASE_SENSITIVE.has(phrase) ? phrase : phrase.toLowerCase();
    let i = -1;
    while ((i = hay.indexOf(needle, i + 1)) >= 0) {
      // "SEC" style words need boundaries; the rest are phrases and safe as substrings.
      hits.push({ phrase, context: body.slice(Math.max(0, i - 40), i + needle.length + 40).replace(/\s+/g, " ") });
      if (hits.length > 50) break;
    }
  }
  const sec = /\bSEC\b/.exec(body);
  if (sec) hits.push({ phrase: "SEC", context: body.slice(Math.max(0, sec.index - 40), sec.index + 43) });
  return { ok: hits.length === 0, hits };
}
