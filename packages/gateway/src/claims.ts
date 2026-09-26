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
  "bank",
  "guarantee",
  "due diligence",
  "sanctions screening",
  "Bazaar",
];

/**
 * Extra phrases the genesis402.com front door's stricter copy rules forbid in the avatar's own
 * spoken words (F-5), layered on FORBIDDEN_PHRASES only for the avatar route.
 *
 * NOT added to FORBIDDEN_PHRASES itself: "attestation" is this gateway's own established record
 * name ("truth-attestation-v1" schema, served at /schema/truth-attestation-v1.schema.json and in
 * the agent card's tool outputs) and "verifiable"/"proof" are ADR-0002-APPROVED, already-served
 * copy ("independently verifiable by anyone, without trusting the operator" in the agent card;
 * "Inclusion proof & signature check" / "proof receipts" in the landing page's Merkle-proof
 * feature). Putting all three in the site-wide list would gate the landing page, agent card and
 * schema routes on their own honest, ADR-approved technical vocabulary. Scoping them to the avatar
 * closes the 2026-09-26 incident (the avatar itself said "you will receive a signed attestation")
 * without touching any of that other, unrelated, already-passing surface.
 */
export const AVATAR_FORBIDDEN_PHRASES: readonly string[] = ["attestation", "verifiable", "proof"];

const CASE_SENSITIVE = new Set(["FDIC", "SIPC", "BitGo", "UBEC", "TROPTIONS", "UNYKORN 7777", "Bazaar"]);

export interface ClaimsVerdict {
  ok: boolean;
  hits: Array<{ phrase: string; context: string }>;
}

/** `extra` layers additional forbidden phrases on top of FORBIDDEN_PHRASES for one call (see AVATAR_FORBIDDEN_PHRASES). */
export function scanClaims(text: string, extra: readonly string[] = []): ClaimsVerdict {
  let body = text.split(LIMITATIONS).join(" ").split(PERIMETER).join(" ");
  // HTML-escaped copies of the same statements.
  const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  body = body.split(escape(LIMITATIONS)).join(" ").split(escape(PERIMETER)).join(" ");
  const hits: ClaimsVerdict["hits"] = [];
  for (const phrase of extra.length ? [...FORBIDDEN_PHRASES, ...extra] : FORBIDDEN_PHRASES) {
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
