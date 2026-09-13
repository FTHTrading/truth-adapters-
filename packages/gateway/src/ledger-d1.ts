/**
 * D1 (SQLite) ledger. Append-only is enforced twice: this class exposes no
 * update/delete, and schema.sql installs BEFORE UPDATE / BEFORE DELETE
 * triggers that abort, so even a console session cannot rewrite history
 * without first dropping the triggers (which D1's own audit log records).
 *
 * Forks are impossible at the storage layer: seq is the PRIMARY KEY, so two
 * isolates racing for the same head both compute seq=N and only one INSERT
 * succeeds. The loser re-reads the head and retries (HEARTH L-05 class).
 */
import type { Clock } from "../../kernel/src/clock.ts";
import { computeEntryHash, eventIdOf, GENESIS_PREV, kindOf, type Entry, type Ledger } from "../../kernel/src/ledger.ts";
import { referencedEntry } from "../../kernel/src/records.ts";

interface Row {
  seq: number;
  prev: string;
  hash: string;
  ts: number;
  record: string;
}

function rowToEntry(r: Row): Entry {
  return { seq: r.seq, prev: r.prev, ts: r.ts, hash: r.hash, record: JSON.parse(r.record) };
}

export class D1Ledger implements Ledger {
  private db: D1Database;
  private clock: Clock;

  constructor(db: D1Database, clock: Clock) {
    this.db = db;
    this.clock = clock;
  }

  async append(record: unknown): Promise<Entry> {
    const recordJson = JSON.stringify(record);
    const eventId = eventIdOf(record);
    const kind = kindOf(record);
    for (let attempt = 0; attempt < 8; attempt++) {
      const head = await this.db.prepare("SELECT seq, hash FROM ledger ORDER BY seq DESC LIMIT 1").first<{ seq: number; hash: string }>();
      const seq = head ? head.seq + 1 : 0;
      const prev = head ? head.hash : GENESIS_PREV;
      const ts = this.clock();
      const hash = await computeEntryHash({ seq, prev, ts, record });
      try {
        await this.db
          .prepare("INSERT INTO ledger (seq, prev, hash, ts, record, event_id, kind) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)")
          .bind(seq, prev, hash, ts, recordJson, eventId, kind)
          .run();
        return { seq, prev, ts, record, hash };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!/UNIQUE|PRIMARY KEY|constraint/i.test(msg)) throw err;
      }
    }
    throw new Error("ledger append contention: gave up after 8 attempts");
  }

  async head(): Promise<Entry | null> {
    const r = await this.db.prepare("SELECT seq, prev, hash, ts, record FROM ledger ORDER BY seq DESC LIMIT 1").first<Row>();
    return r ? rowToEntry(r) : null;
  }

  async length(): Promise<number> {
    const r = await this.db.prepare("SELECT COUNT(*) AS n FROM ledger").first<{ n: number }>();
    return r?.n ?? 0;
  }

  async range(fromSeq: number, toSeq: number): Promise<Entry[]> {
    const { results } = await this.db
      .prepare("SELECT seq, prev, hash, ts, record FROM ledger WHERE seq >= ?1 AND seq <= ?2 ORDER BY seq ASC")
      .bind(fromSeq, toSeq)
      .all<Row>();
    return results.map(rowToEntry);
  }

  async get(seq: number): Promise<Entry | null> {
    const r = await this.db.prepare("SELECT seq, prev, hash, ts, record FROM ledger WHERE seq = ?1").bind(seq).first<Row>();
    return r ? rowToEntry(r) : null;
  }

  async findByHash(hash: string): Promise<Entry | null> {
    const r = await this.db.prepare("SELECT seq, prev, hash, ts, record FROM ledger WHERE hash = ?1").bind(hash).first<Row>();
    return r ? rowToEntry(r) : null;
  }

  async hasEvent(eventId: string): Promise<boolean> {
    const r = await this.db.prepare("SELECT 1 AS one FROM ledger WHERE event_id = ?1 LIMIT 1").bind(eventId).first<{ one: number }>();
    return !!r;
  }

  async findReferences(entryHash: string): Promise<Entry[]> {
    // Text scan over EVENT rows; corrections are rare. Index `references` if this is ever measured hot.
    const { results } = await this.db
      .prepare("SELECT seq, prev, hash, ts, record FROM ledger WHERE kind = 'EVENT' AND instr(record, ?1) > 0 ORDER BY seq ASC LIMIT 200")
      .bind(`"references":"${entryHash}"`)
      .all<Row>();
    return results.map(rowToEntry).filter((e) => referencedEntry(e.record) === entryHash);
  }
}
