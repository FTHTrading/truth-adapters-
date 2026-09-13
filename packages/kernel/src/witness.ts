import type { Clock } from "./clock.ts";
import { systemClock } from "./clock.ts";
import type { Event } from "./event.ts";
import { eventId } from "./event.ts";
import type { WitnessKeys } from "./keys.ts";
import { signHex } from "./keys.ts";

/** SPECIFICATION.md § Witness. May return null. No interpretation. */
export interface Witness {
  id: string;
  publicKeyHex?: string;
  observe(input: unknown): Promise<Event | null>;
}

/**
 * A translator maps external input to a payload. It returns null when there is
 * nothing to observe. It must not add rules, scores or judgements
 * (USAGE.md § Domain adapters — translation only).
 */
export type Translate = (input: unknown) => Promise<unknown | null> | unknown | null;

export interface WitnessOptions {
  clock?: Clock;
}

/**
 * Builds a signing witness. A translator that throws produces a FAILED event:
 * an attempted observation that failed is itself a fact worth recording.
 */
export function createWitness(id: string, keys: WitnessKeys, translate: Translate, opts: WitnessOptions = {}): Witness {
  const clock = opts.clock ?? systemClock;
  return {
    id,
    publicKeyHex: keys.publicKeyHex,
    async observe(input: unknown): Promise<Event | null> {
      let payload: unknown;
      let type: Event["type"] = "OBSERVED";
      try {
        payload = await translate(input);
      } catch (err) {
        type = "FAILED";
        payload = { error: err instanceof Error ? err.message : String(err) };
      }
      if (payload === null || payload === undefined) return null;
      const base = { type, ts: clock(), witness: id, payload };
      const eid = await eventId(base);
      const sig = await signHex(keys.privateKey, eid);
      return { id: eid, ...base, sig, pub: keys.publicKeyHex };
    },
  };
}

/** An unsigned witness, shape-compatible with the frozen substrate's Popeye. */
export function createUnsignedWitness(id: string, translate: Translate, opts: WitnessOptions = {}): Witness {
  const clock = opts.clock ?? systemClock;
  return {
    id,
    async observe(input: unknown): Promise<Event | null> {
      const payload = await translate(input);
      if (payload === null || payload === undefined) return null;
      const base = { type: "OBSERVED" as const, ts: clock(), witness: id, payload };
      return { id: await eventId(base), ...base };
    },
  };
}
