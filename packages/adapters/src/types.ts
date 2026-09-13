/**
 * USAGE.md § Domain adapters (translation only):
 *   "Map external systems to substrate. Adapters translate. They do not add rules."
 *
 * An adapter is a pure translator. It receives untrusted input, returns a
 * payload describing what it observed, or null when there is nothing to
 * observe. It never returns a score, verdict, judgement or explanation; that
 * is enforced mechanically by forbidden.ts and by the adapter test suite.
 */
export interface AdapterContext {
  fetch: typeof fetch;
  clock: () => number;
}

/**
 * direct    — the adapter itself observed the thing (fetched the URL, read the
 *             chain, read the repo). Strongest.
 * submitted — the adapter observed that a party submitted this data at this
 *             time. The content of the submission is the party's claim; the
 *             submission itself is the fact.
 */
export type ObservationKind = "direct" | "submitted";

export interface AdapterPrice {
  /** Integer atomic units of the gateway's configured asset (USDC has 6 decimals). */
  atomic: string;
}

export interface AdapterSpec {
  name: string;
  version: string;
  observation: ObservationKind;
  runtime: "any" | "node";
  description: string;
  price: AdapterPrice;
  inputExample: Record<string, unknown>;
  translate(input: unknown, ctx: AdapterContext): Promise<unknown | null>;
}

export function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function optionalString(v: unknown, max = 512): string | undefined {
  return typeof v === "string" && v.length > 0 && v.length <= max ? v : undefined;
}

export function optionalInt(v: unknown): number | undefined {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : undefined;
}

export const HEX64 = /^[0-9a-f]{64}$/;
export const HEX64_ANY = /^(0x)?[0-9a-fA-F]{64}$/;

export function normHash(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim().toLowerCase().replace(/^0x/, "");
  return HEX64.test(s) ? s : undefined;
}
