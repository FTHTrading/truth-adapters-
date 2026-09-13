# Status panel — what is real right now

Labels are literal and appear in the manifest, MCP tool descriptions and this
file. A label changes only when the evidence in the right-hand column changes.

| Capability | Label | Evidence |
|---|---|---|
| Kernel: canonical hash, chained ledger, Ed25519 witnesses, witnessed cost, merkle proofs | `LOCAL_VERIFIED` | 85/85 node:test; no external review yet |
| Adapters (6) with opinion-key refusal | `LOCAL_VERIFIED` | tests against mocked upstreams; git against a real temp repo |
| Gateway Worker | `DEPLOYED_PREVIEW` | `truth-gateway.kevanbtc.workers.dev`, verify-served PASS 14/14; genesis402.com cut-over blocked on a route held by `genesis402-apex` (ship receipt) |
| D1 append-only triggers | `DEPLOYED_EXERCISED` | `truth-ledger-v1`; UPDATE and DELETE abort with `SQLITE_CONSTRAINT_TRIGGER` (exercised on the abandoned `truth-ledger`, see ship receipt) |
| x402 settlement (USDC) | `DRY_RUN` | Base Sepolia via x402.org facilitator; pay-to = UnyKorn treasury; no paid round-trip exercised yet (needs a funded Sepolia payer key) |
| Apostle ATP rail | `PENDING_CONFIGURATION` | verify call shape reused from UnyKorn-X402-aws; not called live |
| Mode | `test` when `X402_NETWORK=base-sepolia`, `live` only on `base`, `local` for file ledgers | `packages/gateway/src/config.ts` |
| Anchoring | `UNANCHORED` externally | merkle anchors are internal ledger records signed by the same key; no OTS/TSA/chain anchor |
| Moltbook | `NOT_INSTALLED` | no client code on disk; founder flag F-4 |
| External security scan (HawkScan) | `NOT_AUDITED_EXTERNALLY` | no API key in this environment |
| Public domain, release | `LOCAL_UNRELEASED` | no commit, no push, no deploy |
| Upstream disclosure of substrate findings | `PENDING_GOVERNANCE_DECISION` | founder flag F-6 |
| Wire formats `truth-record-v1`, `truth-attestation-v1` | `FROZEN` (local) | `docs/schema/`; ajv and built-in checks agree on all vectors |
| Test vectors (7 positive/negative) | `LOCAL_VERIFIED`, reproducible | `pnpm vectors:check` byte-for-byte; committed test-only keys |
| Discovery documents (`/status.json`, `/pricing.json`, `/openapi.json`, `/llms.txt`, `/.well-known/x402`, `/.well-known/security.txt`) | `IMPLEMENTED_NOT_DEPLOYED` | served by the handler in tests; x402 doc says `DRY_RUN` off mainnet |
| Fresh-machine install | `LOCAL_VERIFIED` | `scripts/fresh-check.ps1` PASS, 106/106 |
| Independent review (two reviewers, sec=CRITICAL) | `NOT_STARTED` | none yet |

Rules for these labels:

- `LOCAL_VERIFIED` never means `LIVE`.
- `UNANCHORED` never means immutable; the ledger is tamper-evident, not tamper-proof.
- `test` mode never means production-settled funds.
- Nothing in this repository is offered to a customer until a Phase 6 ship
  receipt exists in `.forge/` and the served manifest has been read back.
