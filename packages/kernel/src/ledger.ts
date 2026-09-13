import { hashCanonical, HEX64 } from "./canonical.ts";
import type { Clock } from "./clock.ts";
import { systemClock } from "./clock.ts";
import type { CostProof } from "./cost.ts";
import type { Event } from "./event.ts";
import { referencedEntry } from "./records.ts";

/**
 * Hash-chained, append-only ledger (SPECIFICATION.md Invariant 3, and the
 * "ledger integrity (hash chain)" verification promised in README.md).
 *
 * Every entry commits to the previous entry's hash. Any edit, delete or
 * reorder breaks the chain from that point forward and is detected by
 * verifyChain(). Appends are serialised per ledger instance so two writers in
 * one process cannot fork the chain (the HEARTH L-05 defect class).
 */
export const GENESIS_PREV = "0".repeat(64);

export interface Entry {
  seq: number;
  prev: string;
  ts: number;
  record: unknown;
  hash: string; // sha256(canonical{seq, prev, ts, record})
}

export type LedgerRecord =
  | { kind: "EVENT"; event: Event }
  | { kind: "REFUSED"; ts: number; witness: string; reason: string }
  | { kind: "REJECTED"; ts: number; reference: string; reason: string }
  | { kind: "FINALIZED"; ts: number; claimant: string; reference: string; cost: CostProof }
  | { kind: "MACHINE"; [k: string]: unknown }
  | { kind: "ANCHOR"; [k: string]: unknown };

export interface Ledger {
  append(record: unknown): Promise<Entry>;
  head(): Promise<Entry | null>;
  length(): Promise<number>;
  /** Inclusive range by seq. */
  range(fromSeq: number, toSeq: number): Promise<Entry[]>;
  get(seq: number): Promise<Entry | null>;
  findByHash(hash: string): Promise<Entry | null>;
  /** True when an EVENT record with this event id exists in this ledger. */
  hasEvent(eventId: string): Promise<boolean>;
  /** Entries whose EVENT payload carries `references: <entryHash>` (corrections). Read-only analysis. */
  findReferences(entryHash: string): Promise<Entry[]>;
}

export async function computeEntryHash(e: Omit<Entry, "hash">): Promise<string> {
  return hashCanonical({ seq: e.seq, prev: e.prev, ts: e.ts, record: e.record });
}

export function eventIdOf(record: unknown): string | null {
  if (record && typeof record === "object" && (record as { kind?: unknown }).kind === "EVENT") {
    const ev = (record as { event?: { id?: unknown } }).event;
    if (ev && typeof ev.id === "string") return ev.id;
  }
  return null;
}

export function kindOf(record: unknown): string {
  if (record && typeof record === "object" && typeof (record as { kind?: unknown }).kind === "string") {
    return (record as { kind: string }).kind;
  }
  return "UNKNOWN";
}

export interface ChainVerdict {
  ok: boolean;
  entries: number;
  head: string | null;
  at?: number;
  reason?: string;
}

/** Verifies a full chain from genesis. Stops at the first defect (HEARTH Rule 10). */
export async function verifyChain(entries: Entry[]): Promise<ChainVerdict> {
  let prev = GENESIS_PREV;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]!;
    if (e.seq !== i) return { ok: false, entries: entries.length, head: null, at: i, reason: `seq ${e.seq} at position ${i}` };
    if (e.prev !== prev) return { ok: false, entries: entries.length, head: null, at: i, reason: "prev hash mismatch" };
    if (typeof e.hash !== "string" || !HEX64.test(e.hash)) return { ok: false, entries: entries.length, head: null, at: i, reason: "hash not sha256 hex" };
    const expected = await computeEntryHash(e);
    if (expected !== e.hash) return { ok: false, entries: entries.length, head: null, at: i, reason: "entry hash mismatch" };
    prev = e.hash;
  }
  return { ok: true, entries: entries.length, head: entries.length ? prev : null };
}

/** Serialises async appends: the next append cannot read the head until the previous one has written. */
export class AppendQueue {
  private tail: Promise<unknown> = Promise.resolve();
  run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.tail.then(fn, fn);
    this.tail = next.catch(() => undefined);
    return next;
  }
}

export class MemoryLedger implements Ledger {
  private entries: Entry[] = [];
  private eventIds = new Set<string>();
  private byHash = new Map<string, Entry>();
  private queue = new AppendQueue();
  private clock: Clock;

  constructor(clock: Clock = systemClock) {
    this.clock = clock;
  }

  append(record: unknown): Promise<Entry> {
    return this.queue.run(async () => {
      const seq = this.entries.length;
      const prev = seq === 0 ? GENESIS_PREV : this.entries[seq - 1]!.hash;
      const ts = this.clock();
      const hash = await computeEntryHash({ seq, prev, ts, record });
      const entry: Entry = { seq, prev, ts, record, hash };
      this.entries.push(entry);
      this.byHash.set(hash, entry);
      const eid = eventIdOf(record);
      if (eid) this.eventIds.add(eid);
      return entry;
    });
  }
  async head(): Promise<Entry | null> {
    return this.entries.length ? this.entries[this.entries.length - 1]! : null;
  }
  async length(): Promise<number> {
    return this.entries.length;
  }
  async range(fromSeq: number, toSeq: number): Promise<Entry[]> {
    return this.entries.slice(Math.max(0, fromSeq), Math.max(0, toSeq + 1));
  }
  async get(seq: number): Promise<Entry | null> {
    return this.entries[seq] ?? null;
  }
  async findByHash(hash: string): Promise<Entry | null> {
    return this.byHash.get(hash) ?? null;
  }
  async hasEvent(eventId: string): Promise<boolean> {
    return this.eventIds.has(eventId);
  }
  async findReferences(entryHash: string): Promise<Entry[]> {
    return this.entries.filter((e) => referencedEntry(e.record) === entryHash);
  }
  /** Read-only snapshot for verification and anchoring. */
  snapshot(): Entry[] {
    return this.entries.slice();
  }
}
