import { hashCanonical, HEX64 } from "./canonical.ts";
import { verifyHex } from "./keys.ts";

/**
 * SPECIFICATION.md § Core Primitives → Event. `sig`/`pub` are the optional
 * "witness signature verification" extension point named in the spec.
 *
 * Deviation from the frozen substrate, recorded in ADR-0003: the id commits to
 * {type, ts, witness, payload}, not payload alone, so two observations of the
 * same payload are two events rather than one id appearing twice.
 */
export type EventType = "OBSERVED" | "FAILED" | "REFUSED";

export interface Event {
  id: string; // sha256(canonical{type, ts, witness, payload})
  type: EventType;
  ts: number; // unix ms
  witness: string;
  payload: unknown;
  sig?: string; // ed25519(id), hex
  pub?: string; // raw ed25519 public key, hex
}

export type UnsignedEvent = Omit<Event, "id" | "sig" | "pub">;

export async function eventId(e: UnsignedEvent): Promise<string> {
  return hashCanonical({ type: e.type, ts: e.ts, witness: e.witness, payload: e.payload });
}

export interface Verdict {
  ok: boolean;
  reason?: string;
}

/** Recomputes the id and, when a signature is present, verifies it. */
export async function verifyEvent(e: Event): Promise<Verdict> {
  if (typeof e.id !== "string" || !HEX64.test(e.id)) return { ok: false, reason: "id is not a sha256 hex" };
  const expected = await eventId(e);
  if (expected !== e.id) return { ok: false, reason: "id does not match content" };
  if (e.sig !== undefined || e.pub !== undefined) {
    if (!e.sig || !e.pub) return { ok: false, reason: "signature incomplete" };
    const good = await verifyHex(e.pub, e.id, e.sig);
    if (!good) return { ok: false, reason: "signature invalid" };
  }
  return { ok: true };
}
