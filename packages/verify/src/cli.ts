/**
 * truth-verify <ledger.jsonl | https://gateway>
 *
 * Analysis tool, read-only (USAGE.md § Analysis tools). Verifies:
 *   1. chain integrity from genesis
 *   2. every EVENT's id and signature
 *   3. every ANCHOR's merkle root against the entries it covers
 * Prints a verdict. Exit 1 on the first defect; nothing is repaired.
 */
import { readFileSync } from "node:fs";
import { kindOf, merkleRoot, referencedEntry, validateEntryShape, verifyChain, verifyEvent, type Entry, type Event } from "../../kernel/src/index.ts";

async function loadFile(path: string): Promise<Entry[]> {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as Entry);
}

async function loadGateway(base: string): Promise<Entry[]> {
  const origin = base.replace(/\/$/, "");
  const out: Entry[] = [];
  let from = 0;
  for (;;) {
    const res = await fetch(`${origin}/entries?from=${from}&limit=500`);
    if (!res.ok) throw new Error(`GET /entries → ${res.status}`);
    const page = (await res.json()) as { total: number; entries: Entry[] };
    out.push(...page.entries);
    if (page.entries.length === 0 || out.length >= page.total) break;
    from += page.entries.length;
  }
  return out;
}

export interface Report {
  schema: "truth-verify-report-v1";
  entries: number;
  chain: { ok: boolean; at?: number; reason?: string; head: string | null };
  structure: { bad: Array<{ seq: number; problems: string[] }> };
  events: { total: number; signed: number; bad: Array<{ seq: number; reason: string }> };
  anchors: { total: number; bad: Array<{ seq: number; reason: string }> };
  references: { total: number; dangling: number[] };
  witnesses: Record<string, number>;
  ok: boolean;
}

export async function verifyEntries(entries: Entry[]): Promise<Report> {
  const report: Report = {
    schema: "truth-verify-report-v1",
    entries: entries.length,
    chain: { ok: false, head: null },
    structure: { bad: [] },
    events: { total: 0, signed: 0, bad: [] },
    anchors: { total: 0, bad: [] },
    references: { total: 0, dangling: [] },
    witnesses: {},
    ok: false,
  };
  for (const e of entries) {
    const s = validateEntryShape(e);
    if (!s.ok) report.structure.bad.push({ seq: (e as { seq?: number }).seq ?? -1, problems: s.problems });
  }
  if (report.structure.bad.length > 0) return report;

  const chain = await verifyChain(entries);
  report.chain = { ok: chain.ok, at: chain.at, reason: chain.reason, head: chain.head };
  if (!chain.ok) return report;

  const hashes = new Set(entries.map((e) => e.hash));
  for (const e of entries) {
    const kind = kindOf(e.record);
    const ref = referencedEntry(e.record);
    if (ref) {
      report.references.total++;
      if (!hashes.has(ref)) report.references.dangling.push(e.seq);
    }
    if (kind === "EVENT") {
      const ev = (e.record as { event: Event }).event;
      report.events.total++;
      if (ev.sig) report.events.signed++;
      report.witnesses[ev.witness] = (report.witnesses[ev.witness] ?? 0) + 1;
      const v = await verifyEvent(ev);
      if (!v.ok) report.events.bad.push({ seq: e.seq, reason: v.reason ?? "unknown" });
    } else if (kind === "ANCHOR") {
      report.anchors.total++;
      const a = e.record as { merkle_root: string; entries: number; head_hash: string };
      if (a.entries > e.seq) {
        report.anchors.bad.push({ seq: e.seq, reason: "anchor claims to cover itself or later entries" });
        continue;
      }
      const covered = entries.slice(0, a.entries).map((x) => x.hash);
      const root = await merkleRoot(covered);
      if (root !== a.merkle_root) report.anchors.bad.push({ seq: e.seq, reason: "merkle root does not match covered entries" });
      if (covered[covered.length - 1] !== a.head_hash) report.anchors.bad.push({ seq: e.seq, reason: "head hash does not match" });
    }
  }
  // A dangling reference is a fact about the referrer, not a defect of the ledger; it is reported, not failed.
  report.ok = report.events.bad.length === 0 && report.anchors.bad.length === 0;
  return report;
}

async function main(): Promise<void> {
  const target = process.argv[2];
  if (!target) {
    console.error("usage: truth-verify <ledger.jsonl | https://gateway>");
    process.exit(2);
  }
  const entries = /^https?:\/\//.test(target) ? await loadGateway(target) : await loadFile(target);
  const report = await verifyEntries(entries);
  console.log(JSON.stringify(report, null, 2));
  console.log(report.ok ? "\nVERDICT: INTACT" : "\nVERDICT: INTEGRITY FAILURE — stop, do not repair (HEARTH Rule 10)");
  process.exit(report.ok ? 0 : 1);
}

if (process.argv[1] && /cli\.ts$/.test(process.argv[1])) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
