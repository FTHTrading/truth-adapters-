/**
 * JSONL file ledger for Node (data/ledger.jsonl in the frozen substrate's layout).
 * Node-only: imports node:fs. Single writer per file; multi-process locking is
 * out of scope and listed in .forge/minor-findings.md.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Clock } from "./clock.ts";
import { systemClock } from "./clock.ts";
import type { Entry, Ledger } from "./ledger.ts";
import { AppendQueue, computeEntryHash, eventIdOf, GENESIS_PREV, verifyChain } from "./ledger.ts";
import { referencedEntry } from "./records.ts";

export class IntegrityError extends Error {
  readonly at: number | undefined;
  constructor(message: string, at?: number) {
    super(message);
    this.name = "IntegrityError";
    this.at = at;
  }
}

export class FileLedger implements Ledger {
  private entries: Entry[] = [];
  private eventIds = new Set<string>();
  private byHash = new Map<string, Entry>();
  private queue = new AppendQueue();
  private path: string;
  private clock: Clock;

  private constructor(path: string, clock: Clock) {
    this.path = path;
    this.clock = clock;
  }

  /**
   * Opens (or creates) a ledger file and verifies the whole chain before
   * returning. A broken chain throws IntegrityError and nothing is repaired
   * (HEARTH Rule 10: stop on integrity failure).
   */
  static async open(path: string, clock: Clock = systemClock): Promise<FileLedger> {
    const ledger = new FileLedger(path, clock);
    mkdirSync(dirname(path), { recursive: true });
    if (existsSync(path)) {
      const text = readFileSync(path, "utf8");
      const lines = text.split("\n").filter((l) => l.trim().length > 0);
      const parsed: Entry[] = [];
      for (let i = 0; i < lines.length; i++) {
        try {
          parsed.push(JSON.parse(lines[i]!) as Entry);
        } catch {
          throw new IntegrityError(`line ${i} is not valid JSON`, i);
        }
      }
      const verdict = await verifyChain(parsed);
      if (!verdict.ok) throw new IntegrityError(`chain broken at seq ${verdict.at}: ${verdict.reason}`, verdict.at);
      ledger.entries = parsed;
      for (const e of parsed) {
        ledger.byHash.set(e.hash, e);
        const eid = eventIdOf(e.record);
        if (eid) ledger.eventIds.add(eid);
      }
    }
    return ledger;
  }

  append(record: unknown): Promise<Entry> {
    return this.queue.run(async () => {
      const seq = this.entries.length;
      const prev = seq === 0 ? GENESIS_PREV : this.entries[seq - 1]!.hash;
      const ts = this.clock();
      const hash = await computeEntryHash({ seq, prev, ts, record });
      const entry: Entry = { seq, prev, ts, record, hash };
      appendFileSync(this.path, JSON.stringify(entry) + "\n", { flag: "a" });
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
  snapshot(): Entry[] {
    return this.entries.slice();
  }
  get filePath(): string {
    return this.path;
  }
}
