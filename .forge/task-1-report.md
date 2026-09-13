# Task 1 — Report

Brief: `.forge/task-1-brief.md`. Date: 2026-09-13. State: built and verified
locally; uncommitted; nothing pushed or deployed.

## What got built (backend state per HEARTH Rule 6)

| Component | State | Verified how |
|---|---|---|
| kernel: canonical hash, chained ledger (memory/file), Ed25519 witnesses, witnessed cost, state machine, merkle + inclusion proofs, anchors | REAL | 39 node:test cases incl. the ported adversarial suite with real assertions |
| adapters: document, ai-output, http-served, evm-tx, xrpl-tx, git-commit; forbidden-key scanner | REAL (network adapters exercised against mocked fetch; git against a real temp repo) | 27 cases |
| gateway: routes, x402 exact flow, Apostle receipt rail, cost witness, refusal recording, verify/anchor/entries, cron anchor | REAL against MemoryLedger + mocked facilitator; D1Ledger typechecked and bundled, not executed | 14 cases; `wrangler deploy --dry-run` 64.80 KiB / 17.29 KiB gzip |
| verify CLI | REAL | 2 cases + demo run |
| MCP server (5 tools) + x402 client (EIP-3009 signing, spend cap) | REAL | stdio smoke: initialize, tools/list, `truth_witness_local` → OBSERVED seq 0; 3 client cases with a public test key |
| local demo | REAL, run twice on one file ledger | second run reopened, verified, continued: 12 entries, chain INTACT, 6 signed events, 2 anchors |
| Live x402 settlement on Base Sepolia | ABSENT (needs F-3 pay-to + testnet USDC) | — |
| D1 triggers in a real D1 | ABSENT (needs F-5) | schema.sql written; not applied |
| Moltbook channel | ABSENT (F-4) | — |
| External timestamping (OTS/TSA) | ABSENT | minor finding |
| HawkScan DAST | NOT RUN | `HAWK_API_KEY` is not configured in this environment; run against `wrangler dev` before PUBLIC |

Totals, each column separately (Rule 7): running and verified: 6 rows ·
written but not run: 2 (D1 in production, wrangler.jsonc) · absent: 4.

## Test results

```
node --test "packages/**/test/*.test.ts"   →  85 tests, 85 pass, 0 fail
tsc -p tsconfig.json                        →  clean
tsc -p packages/gateway/tsconfig.json       →  clean
```

## Deviations from the brief

- **Event id includes ts and witness** (ADR-0003 §3). The frozen substrate
  hashes payload alone, which makes identical payloads share an id.
- **Unpaid refusals are not written** (ADR-0004 §3). The substrate's letter
  says refusals are recorded; the gateway records every refusal *after*
  payment and none before, to keep the ledger cost-gated end to end.
- **git clone location.** The read-only clone of kevanbtc/truth landed at
  `C:\Users\Kevan\truth` instead of the scratchpad (a `cd` with an empty
  variable fell through to home). It is untouched and removable.
- **`wrangler --dry-run --outdir`** printed the upload size but left no file in
  `dist/`; bundling is confirmed by the size line only.

## Security properties — exercised

S1 chain tamper (edit, delete, transplant) · S2 forged/transplanted/missing
signature · S3 unwitnessed, zero, negative, float cost · S4 unpaid paths write
nothing (7 paths) · S5 SSRF host classes refused · S6 spend cap before signing
· S7 zero pay-to → 503 · S8 50 concurrent appends, no fork. All in the suite
above; none read a policy, each runs the denied path.

## Known limitations

See `.forge/minor-findings.md`. The two that matter before PUBLIC: no rate
limit on free reads, and facilitator/EIP-712 field names UNVERIFIED against
the live network.

## What is open

Founder flags F-1..F-8. The build cannot reach a customer surface until F-1
(push), F-2 (prices), F-3 (pay-to/network), F-5 (domain, D1) and F-8 (copy)
are resolved, then a Phase 6 ship receipt is written and the served manifest
is checked.
