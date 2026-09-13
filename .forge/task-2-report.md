# Task 2 — Report (M2: portable, independently checkable records)

Brief: `.forge/task-2-brief.md`. Date: 2026-09-13. State: built and verified
locally; uncommitted; nothing pushed or deployed. Push blocked on F-1.

## What got built (backend state per HEARTH Rule 6)

| Component | State | Verified how |
|---|---|---|
| `truth-record-v1` and `truth-attestation-v1` JSON Schemas (2020-12), served at `/schema/*` | REAL | ajv validates every vector entry; agrees with built-in checks on all 111 entries across 7 vectors |
| Built-in structural validator (zero-dep) in kernel + verifier | REAL | vectors 07; `/verify` returns `structure` |
| `labels {mode,status,anchoring,review}` + `limitations` on manifest, attestation, verify, anchor, status | REAL | gateway tests assert presence and values |
| `correction` adapter + `referenced_by` on `/verify` + `findReferences` on all three ledgers | REAL (memory/file tested; D1 typechecked only) | gateway test proves the referenced entry is byte-identical after a correction |
| Reproducible vectors (7) with committed test-only keys | REAL | `vectors:check` byte-for-byte; test regenerates and diffs |
| Discovery routes: `/status.json`, `/pricing.json`, `/openapi.json`, `/llms.txt`, `/.well-known/x402`, `/.well-known/security.txt` | REAL, served by the handler; not deployed | gateway tests; x402 doc says `DRY_RUN` off mainnet; security.txt 404 until `SECURITY_CONTACT` |
| Fresh-copy check (`scripts/fresh-check.ps1`) | REAL, run | copy to temp, `pnpm install --frozen-lockfile`, typecheck, 106/106, vectors reproduce |
| Network guard in tests | REAL | real `fetch` throws in the x402 client test unless `TRUTH_TEST_ALLOW_NETWORK=1` |

Counts, separately: running and verified 8 · written not run 0 · absent 0
(for this task's scope). Items absent overall are unchanged: live settlement,
D1 in production, external anchoring, Moltbook, external review.

## Test results

```
node --test "packages/**/test/*.test.ts"   →  106 tests, 106 pass, 0 fail   (was 85)
tsc ×2                                      →  clean
node scripts/vectors.ts --check             →  vectors reproduce byte-for-byte
scripts/fresh-check.ps1                     →  FRESH CHECK: PASS (106/106 in a fresh copy)
wrangler deploy --dry-run                   →  bundles (see progress.md for size)
```

## Deviations from the review's M2 definition

- Names: `truth-record-v1` not `genesis402-receipt-v1`; naming is F-1.
- "Revocation and supersession lifecycle events": implemented as
  **references**, not lifecycle. A correction is a new paid observation whose
  payload points at a prior entry hash. Nothing about the referenced entry
  changes; verifiers list `referenced_by` and never re-label. USAGE.md § 3.
- No `AUTHORIZED` outcome, no RulePacks, no policy layer. The four gate
  outcomes are the whole vocabulary.

## Findings while building (fixed)

- Forging a signature also changes the entry hash, so a naive vector tripped
  the chain check rather than the signature check. Vectors 05 to 07 now
  re-chain after tampering, which is the realistic attacker (holds the file,
  lacks the key). A chain-only verifier passes those three vectors; ours fails
  them. That distinction is now documented in `vectors/README.md`.
- The root `.gitignore` would have excluded the committed vector keys from a
  real clone, making vectors non-reproducible for anyone but this machine.
  Fixed with an explicit un-ignore; SECURITY.md lists them as permitted.
- `fresh-check.ps1` excluded any directory named `keys`; now excludes only the
  root one.

## Still open

F-1..F-8 unchanged. Before `LIVE_LIMITED`: rate limiting on free reads,
facilitator and EIP-712 names verified on testnet, external anchor, two
independent reviewers (sec=CRITICAL).
