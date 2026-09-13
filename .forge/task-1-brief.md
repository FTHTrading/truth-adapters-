# Task 1 — truth-adapters: kernel, adapters, x402 gateway, verifier, MCP

```
FORGE-CLASS: entity=UnyKorn LLC
             sec=CRITICAL        (witness signing key; payment verification)
             claims=MARKETING    (public manifest + agent playbook copy)
             custody=NONE        (facilitator settles to a UnyKorn LLC address; gateway holds nothing)
             hearth=TOUCHES      (append-only ledger; receipts-shaped history)
             chain=READ          (evm-tx / xrpl-tx read receipts; nothing is issued)
             surface=INTERNAL    (this task; PUBLIC only after the Phase 6 receipt)
```

Routing verdict: **FULL FORGE**. Phase 6 not crossed in this task.

## What

Turn the frozen truth substrate (kevanbtc/truth v1.0.0) into something agents
can buy from: a hardened runtime binding of its invariants, translation-only
adapters for six domains, an x402-gated Cloudflare gateway, a read-only
verifier, and an MCP server so any agent can pay, witness and verify with no
account.

## Why

The substrate's value is what it refuses to do. Its implementation as shipped
(981 lines) leaves four of its own promises unimplemented: the README claims
"ledger integrity (hash chain)" but entries do not chain; witnesses are plain
string ids with no signature; "cost" is any number > 0 with nothing staked; and
8 of the 13 formal adversarial tests hard-code `passed: true`. Selling
attestations on top of that would be selling a promise the code does not keep.
This task keeps the promise without touching the frozen repo.

## In scope

kernel · adapters (document, ai-output, http-served, evm-tx, xrpl-tx,
git-commit) · gateway (Worker + D1, x402 exact/USDC + Apostle ATP rails,
anchor cron) · verify CLI · MCP server + x402 client · tests · ADRs ·
agent constitution and playbook.

## Out of scope

Deploying anything · pushing to GitHub · mainnet facilitator credentials ·
Moltbook integration · external timestamp anchoring (Bitcoin OTS / TSA) ·
modifying kevanbtc/truth.

## Acceptance criteria

1. Every invariant in SPECIFICATION.md has at least one test that exercises the
   failure path against the real ledger (no tautological asserts).
2. Editing, deleting or reordering any ledger entry is detected by `verifyChain`.
3. Every event is Ed25519-signed; a forged or transplanted signature fails.
4. No finalization without a cost proof whose settlement event exists in the
   same ledger; float, zero, negative and unwitnessed costs are REJECTED.
5. Every adapter payload is free of opinion keys; an adapter that returns one
   is refused by the gateway even when paid.
6. Unpaid requests never write; paid requests always write, including refusals.
7. `verify/{hash}` returns a merkle inclusion proof that verifies against the
   latest anchor.
8. Both tsconfigs clean; full suite green; worker bundles under `wrangler --dry-run`.

## Security properties (each exercised in tests)

- S1 chain tamper-evidence (ledger.test.ts)
- S2 signature forgery rejection (witness.test.ts)
- S3 cost forgery rejection incl. unwitnessed event id (adversarial 2.4)
- S4 write-amplification: unpaid paths write nothing (app.test.ts)
- S5 SSRF: http-served refuses localhost/private/link-local/credentialed URLs
- S6 spend cap on the agent side before signing (x402-client.test.ts)
- S7 fail-safe default: zero pay-to keeps paid routes at 503
- S8 concurrent appends cannot fork (ledger.test.ts, D1 PK + retry)

## Claims touched

See `docs/decisions/ADR-0002-marketing-copy.md`. Manifest strings: "records
what happened, who paid, when; signed and chained" and the `does_not` list.

## Test plan

node:test, RED/GREEN per module; gateway failure paths with a mocked
facilitator and the real kernel; local demo against a real file ledger, run
twice to prove reopen + continue.
