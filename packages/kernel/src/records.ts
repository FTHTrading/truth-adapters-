/**
 * Structural validation of ledger records: the executable twin of
 * docs/schema/truth-record-v1.schema.json. No schema library; a verifier must
 * run offline with zero dependencies. Tests check both agree on every vector.
 */
import { HEX64 } from "./canonical.ts";

export const RECORD_KINDS = ["EVENT", "REFUSED", "REJECTED", "FINALIZED", "MACHINE", "ANCHOR"] as const;
export type RecordKind = (typeof RECORD_KINDS)[number];

export interface RecordVerdict {
  ok: boolean;
  kind: string;
  problems: string[];
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isHex64 = (v: unknown): v is string => typeof v === "string" && HEX64.test(v);
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;
const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;

function checkEvent(ev: unknown, p: string[]): void {
  if (!isObj(ev)) return void p.push("event must be an object");
  if (!isHex64(ev.id)) p.push("event.id must be sha256 hex");
  if (!["OBSERVED", "FAILED", "REFUSED"].includes(String(ev.type))) p.push("event.type invalid");
  if (!isInt(ev.ts)) p.push("event.ts must be a non-negative integer");
  if (!isStr(ev.witness)) p.push("event.witness required");
  if (!("payload" in ev)) p.push("event.payload required");
  if ((ev.sig === undefined) !== (ev.pub === undefined)) p.push("event.sig and event.pub must appear together");
  if (ev.sig !== undefined && !/^[0-9a-f]{128}$/.test(String(ev.sig))) p.push("event.sig must be 64-byte hex");
  if (ev.pub !== undefined && !isHex64(ev.pub)) p.push("event.pub must be 32-byte hex");
}

function checkCost(c: unknown, p: string[]): void {
  if (!isObj(c)) return void p.push("cost must be an object");
  for (const k of ["rail", "asset", "payer", "reference"]) if (!isStr(c[k])) p.push(`cost.${k} required`);
  if (typeof c.amount !== "string" || !/^\d+$/.test(c.amount)) p.push("cost.amount must be a non-negative integer string");
  if (!isHex64(c.witnessed_event_id)) p.push("cost.witnessed_event_id must be sha256 hex");
}

export function validateRecord(record: unknown): RecordVerdict {
  const p: string[] = [];
  if (!isObj(record)) return { ok: false, kind: "UNKNOWN", problems: ["record must be an object"] };
  const kind = String(record.kind);
  if (!(RECORD_KINDS as readonly string[]).includes(kind)) return { ok: false, kind, problems: [`unknown kind ${kind}`] };
  switch (kind as RecordKind) {
    case "EVENT":
      checkEvent(record.event, p);
      break;
    case "REFUSED":
      if (!isInt(record.ts)) p.push("ts required");
      if (!isStr(record.witness)) p.push("witness required");
      if (!isStr(record.reason)) p.push("reason required");
      break;
    case "REJECTED":
      if (!isInt(record.ts)) p.push("ts required");
      if (!isHex64(record.reference)) p.push("reference must be an event id");
      if (!isStr(record.reason)) p.push("reason required");
      break;
    case "FINALIZED":
      if (!isInt(record.ts)) p.push("ts required");
      if (!isStr(record.claimant)) p.push("claimant required");
      if (!isHex64(record.reference)) p.push("reference must be an event id");
      checkCost(record.cost, p);
      break;
    case "MACHINE":
      if (!isStr(record.machine_id)) p.push("machine_id required");
      if (!isInt(record.ts)) p.push("ts required");
      break;
    case "ANCHOR":
      if (!isHex64(record.merkle_root)) p.push("merkle_root must be sha256 hex");
      if (!isInt(record.entries) || record.entries === 0) p.push("entries must be a positive integer");
      if (!isHex64(record.head_hash)) p.push("head_hash must be sha256 hex");
      if (!isInt(record.ts)) p.push("ts required");
      break;
  }
  return { ok: p.length === 0, kind, problems: p };
}

export function validateEntryShape(e: unknown): RecordVerdict {
  const p: string[] = [];
  if (!isObj(e)) return { ok: false, kind: "ENTRY", problems: ["entry must be an object"] };
  if (!isInt(e.seq)) p.push("seq must be a non-negative integer");
  if (!isHex64(e.prev)) p.push("prev must be sha256 hex");
  if (!isHex64(e.hash)) p.push("hash must be sha256 hex");
  if (!isInt(e.ts)) p.push("ts must be a non-negative integer");
  const r = validateRecord(e.record);
  return { ok: p.length === 0 && r.ok, kind: r.kind, problems: [...p, ...r.problems] };
}

/** Entry hash referenced by a record's payload (`references` field), if any. */
export function referencedEntry(record: unknown): string | null {
  if (!isObj(record) || record.kind !== "EVENT" || !isObj(record.event)) return null;
  const payload = (record.event as { payload?: unknown }).payload;
  if (!isObj(payload)) return null;
  return isHex64(payload.references) ? payload.references : null;
}
