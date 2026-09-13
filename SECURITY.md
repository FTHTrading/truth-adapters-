# Security

Status: `LOCAL_VERIFIED`, `NOT_AUDITED_EXTERNALLY`. See `STATUS.md`.

## Reporting

Email security reports to the UnyKorn LLC security contact named in the
served `/.well-known/security.txt` once the gateway is deployed. Until then,
open a private report to the repository owner. Do not file integrity defects
as public issues before a remediation window has been offered.

## What is protected and how

| Asset | Protection | Where |
|---|---|---|
| Witness private key | Ed25519 in a Cloudflare secret (`WITNESS_PRIVATE_KEY_JWK`); never in vars, logs or responses; local copies gitignored under `keys/` | `packages/gateway/src/index.ts`, `scripts/keygen.ts` |
| Ledger history | prev-hash chain verified from genesis; D1 `BEFORE UPDATE/DELETE` triggers abort; `seq` primary key prevents forks | `packages/kernel/src/ledger.ts`, `packages/gateway/schema.sql` |
| Payment | facilitator verify then settle; pay-to, amount and network checked locally before any facilitator call; zero pay-to disables paid routes | `packages/gateway/src/x402.ts`, `config.ts` |
| Agent funds | client refuses to sign above `X402_MAX_ATOMIC`; payer key only from env | `packages/mcp/src/x402-client.ts` |
| Outbound fetch (SSRF) | `http-served` refuses localhost, private, link-local and credentialed URLs; https-only RPC | `packages/adapters/src/http-served.ts`, `evm-tx.ts` |
| Write amplification | unpaid requests never write; body capped at 64 KiB | ADR-0004 |
| Integrity failure | file ledger refuses to open a broken chain; verifier exits 1; nothing is repaired | HEARTH Rule 10 |

## Known gaps before PUBLIC

- No rate limiting on free GET routes (`/entries`, `/verify`).
- Facilitator response field names and USDC EIP-712 domain names are
  unverified against live networks.
- No external anchor; internal anchors are signed by the same key as events.
- No HawkScan or third-party review has run.

## Pre-commit checklist

```powershell
pnpm check
git status
git diff --check
git ls-files | Select-String -Pattern "\.env$|\.jwk|secret|seed|wallet|ledger\.jsonl"
```

The only permitted matches are `.env.example`, the two test-only keys under
`vectors/keys/` (public by design, see `vectors/README.md`), and source files
that reference those words by name.
