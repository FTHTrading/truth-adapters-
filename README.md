# truth-adapters

Translation-only adapters, an x402-gated witness gateway, a read-only verifier
and agent tooling built on the frozen truth substrate
([github.com/kevanbtc/truth](https://github.com/kevanbtc/truth), v1.0.0,
SPECIFICATION.md status FROZEN).

The substrate records what happened. It does not explain why, judge
correctness, or resolve disputes. Everything in this repository inherits that
boundary and is tested against it.

```
truth (frozen)  ──spec──▶  packages/kernel      the invariants as a runtime binding
                           packages/adapters    translate domains → observations (no opinions)
                           packages/gateway     Cloudflare Worker: pay per observation over x402
                           packages/verify      read-only verifier, exit 1 on any defect
                           packages/mcp         five tools for agents, nothing else
```

## What an observation costs and what it buys

An agent POSTs input to `/witness/{adapter}`, receives HTTP 402 with x402
payment requirements, pays a fraction of a cent in USDC through a facilitator,
and retries. The settlement itself is witnessed first (a `COST:` event), then
the adapter observes the input, then the finalization records payer, amount
and the reference of the settlement. All three are signed with the gateway's
Ed25519 witness key and chained. Anyone can verify any entry at
`/verify/{hash}` with no trust in the operator.

| Outcome | Meaning | Written to history |
|---|---|---|
| FINALIZED | observed and paid | cost event, observation, finalization |
| REFUSED | nothing observable in the input | cost event, refusal |
| REJECTED | observed but the cost did not hold (or the observation FAILED) | cost event, observation, rejection |
| 402 / 4xx | not paid, or malformed before payment | nothing |

## Packages

- **kernel** (zero dependencies, WebCrypto only): canonical JSON hashing,
  hash-chained append-only ledger (memory, file, D1), Ed25519 witnesses,
  witnessed cost proofs, the frozen state-transition table, merkle anchors with
  inclusion proofs. See `docs/decisions/ADR-0003` for what was hardened relative
  to the frozen implementation.
- **adapters**: `document`, `ai-output` (submitted digests);
  `http-served`, `evm-tx`, `xrpl-tx`, `git-commit` (direct observation).
  Every adapter payload is scanned for opinion vocabulary (`verdict`, `score`,
  `compliant`, `risk`, …) and refused if any is present. That is
  USAGE.md Question 4 made executable.
- **gateway**: Worker + D1 with `BEFORE UPDATE`/`BEFORE DELETE` triggers that
  abort. Rails: x402 `exact` on Base (USDC) and the Apostle Chain ATP receipt
  rail already used by UnyKorn-X402-aws. Hourly cron writes a merkle anchor
  into the ledger itself.
- **verify**: `pnpm verify <ledger.jsonl | https://gateway>`. Checks structure
  against the frozen `truth-record-v1` schema (built in, no schema library),
  the chain, every signature, every anchor, and lists corrections that
  reference an entry.
- **schemas and vectors**: `docs/schema/` holds the frozen wire formats;
  `vectors/` holds seven reproducible positive and negative ledgers with
  committed test-only keys. `pnpm vectors:check` must say byte-for-byte.
- **discovery**: `/status.json`, `/pricing.json`, `/openapi.json`,
  `/llms.txt`, `/.well-known/x402` all carry the same labels as the manifest
  and say `DRY_RUN` unless the gateway is on mainnet. `STATUS.md` is the
  human-readable truth panel.
- **mcp**: `truth_manifest`, `truth_witness_paid`, `truth_verify`,
  `truth_witness_local` (unpaid, therefore never FINALIZED),
  `truth_verify_ledger_file`.

## Run it

Requires Node ≥ 24 (TypeScript runs natively, no build step) and pnpm.

```bash
pnpm install
pnpm check          # typecheck (node + worker) and the full test suite
pnpm demo           # local file ledger: observe, refuse, reject, anchor, verify
pnpm keygen         # writes keys/witness.jwk.json (gitignored); prints the public key
pnpm gateway:dev    # wrangler dev; paid routes stay 503 until X402_PAY_TO is real
pnpm mcp            # stdio MCP server for agents
```

Ship steps, in order, each gated by a deploy receipt in `.forge/`:
`wrangler d1 create truth-ledger` → paste the id into `wrangler.jsonc` →
`pnpm gateway:migrate:remote` → `wrangler secret put WITNESS_PRIVATE_KEY_JWK`
→ set `X402_PAY_TO` → `pnpm gateway:deploy` → verify the served manifest.

## System boundary (inherited, unchanged)

This system records witnessed events, enforces cost before finalization, and
preserves immutable history. It does not judge intent, interpret meaning,
decide fairness, resolve disputes, explain outcomes, grant exceptions, or hold
client funds. Payments settle through a third-party facilitator to an address
owned by UnyKorn LLC; the gateway never custodies anything.

## License

The substrate says: *"This system has no license. It has constraints."*
This repository follows that statement until the founder decides otherwise
(`.forge/founder-flags.md` F-7). Use it anywhere constraints matter more than
convenience.
