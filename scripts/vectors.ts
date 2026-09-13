/**
 * Generates reproducible test vectors under vectors/.
 *
 * Deterministic inputs: a committed TEST-ONLY witness key (vectors/keys/
 * vectors.jwk.json — public by design, never used by a real gateway), a
 * counter clock, and fixed payloads. Ed25519 is deterministic (RFC 8032), so
 * regeneration yields identical bytes; the vectors test asserts that.
 *
 *   node scripts/vectors.ts            # regenerate
 *   node scripts/vectors.ts --check    # regenerate to memory and diff against disk
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildAnchor,
  computeEntryHash,
  createWitness,
  exportKeysJwk,
  generateKeys,
  importKeysJwk,
  MemoryLedger,
  signHex,
  submit,
  type CostProof,
  type Entry,
  type WitnessKeys,
} from "../packages/kernel/src/index.ts";

const ROOT = "vectors";
const KEY_PATH = join(ROOT, "keys", "vectors.jwk.json");

const FORGER_KEY_PATH = join(ROOT, "keys", "forger.jwk.json");

/** Loads a committed TEST-ONLY key, creating it on first run. Both keys are public by design. */
async function keys(path: string = KEY_PATH): Promise<WitnessKeys> {
  if (existsSync(path)) return importKeysJwk(JSON.parse(readFileSync(path, "utf8")));
  const k = await generateKeys();
  mkdirSync(join(ROOT, "keys"), { recursive: true });
  writeFileSync(path, JSON.stringify(await exportKeysJwk(k), null, 2) + "\n");
  return k;
}

export interface Vector {
  name: string;
  description: string;
  expected: { ok: boolean; chain_at?: number; structure_bad?: number; events_bad?: number; anchors_bad?: number };
  entries: Entry[];
}

export async function generate(): Promise<Vector[]> {
  const k = await keys();
  let t = 1_700_000_000_000;
  const clock = () => (t += 1000);
  const ledger = new MemoryLedger(clock);
  const doc = createWitness("ADAPTER:document@1.0.0", k, (i) => i, { clock });
  const cost = createWitness("COST:x402:exact:base-sepolia", k, (i) => i, { clock });
  const silent = createWitness("SILENT", k, () => null, { clock });
  const failing = createWitness("ADAPTER:http-served@1.0.0", k, () => { throw new Error("upstream 502"); }, { clock });

  const paid = async (amount = "1000"): Promise<CostProof> => {
    const c = await submit(ledger, cost, { rail: "x402:exact:base-sepolia", asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", amount, payer: "0x2222222222222222222222222222222222222222", reference: "0x" + "ee".repeat(32), settled_at: clock() }, undefined, { clock });
    return { rail: "x402:exact:base-sepolia", asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", amount, payer: "0x2222222222222222222222222222222222222222", reference: "0x" + "ee".repeat(32), witnessed_event_id: c.event!.id };
  };

  const a1 = await submit(ledger, doc, { kind: "document", sha256: "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824", bytes: 5, media_type: "text/plain", name: "hello.txt", submitted_by: null }, await paid(), { clock });
  await submit(ledger, silent, { nothing: true }, await paid(), { clock });
  await submit(ledger, doc, { kind: "document", sha256: "a".repeat(64), bytes: null, media_type: null, name: null, submitted_by: null }, await paid("0"), { clock });
  await submit(ledger, failing, { url: "https://down.test/" }, await paid("5000"), { clock });
  await submit(ledger, doc, { kind: "correction", references: a1.entry!.hash, replacement_sha256: "b".repeat(64), note_sha256: null, submitted_by: null }, await paid(), { clock });
  const anchor = await buildAnchor(ledger.snapshot(), clock);
  await ledger.append({ kind: "ANCHOR", ...anchor, witness: "ANCHOR:MERKLE", pub: k.publicKeyHex });
  await submit(ledger, doc, { kind: "document", sha256: "c".repeat(64), bytes: 1, media_type: null, name: "after-anchor", submitted_by: null }, undefined, { clock });

  const good = ledger.snapshot();
  const clone = (): Entry[] => JSON.parse(JSON.stringify(good));

  /**
   * An attacker who holds the ledger file can recompute every entry hash after
   * tampering, so the chain still links. What they cannot do is re-sign with
   * the witness key or make a merkle root match entries they did not alter
   * consistently. These vectors rechain so the signature and anchor checks,
   * not the chain check, are what catch them.
   */
  const rechain = async (entries: Entry[], from: number): Promise<void> => {
    for (let i = from; i < entries.length; i++) {
      const e = entries[i]!;
      e.prev = i === 0 ? "0".repeat(64) : entries[i - 1]!.hash;
      e.hash = await computeEntryHash({ seq: e.seq, prev: e.prev, ts: e.ts, record: e.record });
    }
  };

  // seq 0 cost EVENT · 1 document EVENT · 2 FINALIZED · 3 cost EVENT · 4 REFUSED · 5 cost EVENT · 6 document EVENT · 7 REJECTED · ...
  const edited = clone();
  (edited[1]!.record as { event: { payload: { sha256: string } } }).event.payload.sha256 = "d".repeat(64);

  const deleted = clone();
  deleted.splice(3, 1);

  const reordered = clone();
  [reordered[4], reordered[5]] = [reordered[5]!, reordered[4]!];

  const forgedSig = clone();
  const other = await keys(FORGER_KEY_PATH);
  const ev = (forgedSig[0]!.record as { event: { id: string; sig: string } }).event;
  ev.sig = await signHex(other.privateKey, ev.id);
  await rechain(forgedSig, 0);

  const badAnchor = clone();
  const anchorIdx = badAnchor.findIndex((e) => (e.record as { kind: string }).kind === "ANCHOR");
  (badAnchor[anchorIdx]!.record as { merkle_root: string }).merkle_root = "f".repeat(64);
  await rechain(badAnchor, anchorIdx);

  const malformed = clone();
  delete (malformed[1]!.record as { event: { ts?: number } }).event.ts;
  await rechain(malformed, 1);

  return [
    { name: "01-good", description: "FINALIZED, REFUSED, REJECTED (zero cost), FAILED+REJECTED, correction, ANCHOR, unpaid OBSERVED", expected: { ok: true }, entries: good },
    { name: "02-edited-payload", description: "payload of seq 1 edited after the fact", expected: { ok: false, chain_at: 1 }, entries: edited },
    { name: "03-deleted-entry", description: "seq 3 removed", expected: { ok: false, chain_at: 3 }, entries: deleted },
    { name: "04-reordered", description: "seq 4 and 5 swapped", expected: { ok: false, chain_at: 4 }, entries: reordered },
    { name: "05-forged-signature", description: "seq 0 event re-signed with another key, chain rehashed so only the signature check can catch it", expected: { ok: false, events_bad: 1 }, entries: forgedSig },
    { name: "06-bad-anchor-root", description: "anchor merkle root altered, chain rehashed so only the anchor check can catch it", expected: { ok: false, anchors_bad: 1 }, entries: badAnchor },
    { name: "07-malformed-record", description: "document EVENT at seq 1 missing event.ts, chain rehashed so only the structural check can catch it", expected: { ok: false, structure_bad: 1 }, entries: malformed },
  ];
}

function serialize(v: Vector): string {
  return JSON.stringify({ name: v.name, description: v.description, expected: v.expected, entries: v.entries }, null, 2) + "\n";
}

if (process.argv[1] && /vectors\.ts$/.test(process.argv[1])) {
  const check = process.argv.includes("--check");
  const vectors = await generate();
  let drift = 0;
  for (const v of vectors) {
    const path = join(ROOT, `${v.name}.json`);
    const text = serialize(v);
    if (check) {
      if (!existsSync(path) || readFileSync(path, "utf8") !== text) {
        drift++;
        console.error(`DRIFT: ${path}`);
      }
    } else {
      mkdirSync(ROOT, { recursive: true });
      writeFileSync(path, text);
      console.log(`wrote ${path} (${v.entries.length} entries, expected ok=${v.expected.ok})`);
    }
  }
  if (check) {
    console.log(drift === 0 ? "vectors reproduce byte-for-byte" : `${drift} vector(s) drifted`);
    process.exit(drift === 0 ? 0 : 1);
  }
}
