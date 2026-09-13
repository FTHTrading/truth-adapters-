/**
 * Local end-to-end run against a real file ledger:
 *   observe README digest, observe a git commit, attempt a forged cost proof,
 *   anchor, then verify the file with the read-only verifier.
 * No network, no payment: outcomes are OBSERVED / REFUSED / REJECTED, never FINALIZED.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { NODE_ADAPTERS } from "../packages/adapters/src/registry-node.ts";
import { buildAnchor, createWitness, generateKeys, kindOf, submit, type CostProof } from "../packages/kernel/src/index.ts";
import { FileLedger } from "../packages/kernel/src/ledger-file.ts";
import { verifyEntries } from "../packages/verify/src/cli.ts";

const ledgerPath = process.argv[2] ?? "data/ledger.jsonl";
const keys = await generateKeys();
const ledger = await FileLedger.open(ledgerPath);
const clock = () => Date.now();
const ctx = { fetch, clock };
const witnessFor = (name: string) => {
  const spec = NODE_ADAPTERS[name]!;
  return createWitness(`ADAPTER:${spec.name}@${spec.version}`, keys, (i) => spec.translate(i, ctx));
};

console.log(`ledger: ${ledger.filePath} (${await ledger.length()} entries before run)`);

const readme = readFileSync("README.md");
const doc = await submit(ledger, witnessFor("document"), {
  sha256: createHash("sha256").update(readme).digest("hex"),
  bytes: statSync("README.md").size,
  media_type: "text/markdown",
  name: "README.md",
});
console.log(`document      → ${doc.outcome} seq=${doc.entry?.seq}`);

const truthRepo = "C:/Users/Kevan/truth";
if (existsSync(truthRepo)) {
  const git = await submit(ledger, witnessFor("git-commit"), { repo: truthRepo, sha: "HEAD" });
  console.log(`git-commit    → ${git.outcome} seq=${git.entry?.seq} sha=${(git.event?.payload as { sha?: string } | undefined)?.sha}`);
}

const refused = await submit(ledger, witnessFor("document"), { sha256: "not a digest" });
console.log(`bad digest    → ${refused.outcome} seq=${refused.refusal?.seq}`);

const forged: CostProof = { rail: "x402", asset: "USDC", amount: "1000", payer: "0xnobody", reference: "0xfake", witnessed_event_id: "0".repeat(64) };
const rejected = await submit(ledger, witnessFor("document"), { sha256: "a".repeat(64) }, forged);
console.log(`forged cost   → ${rejected.outcome} (${rejected.reason})`);

const anchor = await buildAnchor(ledger.snapshot(), clock);
const anchorEntry = await ledger.append({ kind: "ANCHOR", ...anchor });
console.log(`anchor        → seq=${anchorEntry.seq} root=${anchor.merkle_root.slice(0, 16)}… covers ${anchor.entries} entries`);

const report = await verifyEntries(ledger.snapshot());
const counts: Record<string, number> = {};
for (const e of ledger.snapshot()) counts[kindOf(e.record)] = (counts[kindOf(e.record)] ?? 0) + 1;
console.log(`kinds         → ${JSON.stringify(counts)}`);
console.log(`verify        → chain ${report.chain.ok ? "INTACT" : "BROKEN"}, events ${report.events.total} (${report.events.signed} signed, ${report.events.bad.length} bad), anchors ${report.anchors.total} (${report.anchors.bad.length} bad)`);
console.log(`VERDICT: ${report.ok ? "INTACT" : "INTEGRITY FAILURE"}`);
process.exit(report.ok ? 0 : 1);
