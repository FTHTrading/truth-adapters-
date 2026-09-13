# Founder Flags — Kevan sign-off required

Per FORGE (`~/.claude/rules/08-sdd-process-doctrine.md`). Nothing below ships
until Kevan resolves it personally. Never edit a flag; append the decision.

---

## OPEN FLAGS

### F-1 (BLOCKS: git push) — Push this repository to FTHTrading/truth-adapters-

**Question:** Commit and push the current tree to the empty repo
`github.com/FTHTrading/truth-adapters-` (remote already set locally, nothing
pushed)? The trailing hyphen in the repo name looks accidental; rename on
GitHub before the first push, or keep it?

**Why it matters:** First push fixes the public name and history.

**Recommendation:** rename to `truth-adapters`, then push `main`.

**Gate:** no commit, no push until resolved.

### F-2 (BLOCKS: gateway deploy) — Prices

**Question:** Per-observation prices are set in code: submitted adapters
(document, ai-output, git-commit) 1000 atomic USDC ($0.001); direct adapters
(http-served, evm-tx, xrpl-tx) 5000 atomic ($0.005); Apostle rail 0.25 ATP per
op. Confirm or change.

**Why it matters:** Pricing on a live revenue surface is founder-owned.

**Gate:** `packages/adapters/src/*.ts` `price.atomic` and
`APOSTLE_PRICE_ATP_RAW` stay as-is until confirmed.

### F-3 (BLOCKS: gateway deploy) — Pay-to address, network, facilitator

**Question:** (a) Which UnyKorn LLC-controlled EVM address receives USDC
(`X402_PAY_TO`)? The zero address currently keeps paid routes disabled by
design. (b) Launch on `base-sepolia` with the public x402.org facilitator, or
go straight to `base` mainnet, which needs a CDP facilitator account and API
key? (c) The EIP-712 domain names for USDC (`USDC` on Base Sepolia, `USD Coin`
on Base) are UNVERIFIED against the live contracts; confirm via the contract's
`name()` before mainnet.

**Gate:** vars in `packages/gateway/wrangler.jsonc`.

### F-4 (BLOCKS: agent distribution) — Moltbook

**Question:** Kevan named Moltbook as a distribution channel. On disk the only
references are a `moltbook_api` secret name in the Finn provider layer and an
architecture map entry; no client code or API documentation was found. Is
there an API to post through, and should the witness agents post there?

**Gate:** `agents/sell-playbook.md` stays channel-agnostic; no Moltbook code.

### F-5 (BLOCKS: gateway deploy) — Domain and D1

**Question:** Hostname for the gateway (suggested `truth.unykorn.ai`), and
authorization to run `wrangler d1 create truth-ledger` under the UnyKorn
Cloudflare account.

**Gate:** ship receipt in `.forge/ship-receipt-<tag>.md` before `pnpm gateway:deploy`.

### F-6 (DECISION) — Findings against the frozen substrate

**Question:** ADR-0003 lists four defects in kevanbtc/truth (no hash chain
despite the README claim, tautological adversarial tests, duplicate event ids,
package.json says MIT while the README says no license). File them as issues
upstream, fix in a v1.0.1 there, or leave the frozen repo frozen and let this
repo carry the corrections?

**Recommendation:** leave v1.0.0 frozen; open one upstream issue linking
ADR-0003 so the record is public.

### F-7 (DECISION) — License

**Question:** This repo currently mirrors the substrate's "no license, it has
constraints" stance. Counsel note: with no license, third parties have no
grant to use it at all; "use it anywhere" is then an invitation without a
right. Choose: keep no-license, or adopt a real license (MIT, or a
source-available constraints license).

### F-8 (BLOCKS: any REGULATED string) — Marketing copy

**Question:** Approve ADR-0002's approved/forbidden lists before any public
surface (manifest is public once deployed; playbook posts are public).

---

## RESOLVED FLAGS

_(none yet)_

### F-3, amendment 2026-09-13 — mainnet is now two secrets and one variable
The gateway supports the Coinbase (CDP) facilitator with per-request JWT auth. To go live on Base mainnet:
```powershell
cd C:\Users\Kevan\truth-adapters
npx wrangler secret put CDP_API_KEY_ID -c packages\gateway\wrangler.jsonc       # paste when prompted
npx wrangler secret put CDP_API_KEY_SECRET -c packages\gateway\wrangler.jsonc
# in packages/gateway/wrangler.jsonc: "X402_NETWORK": "base", "X402_FACILITATOR_URL": ""
pnpm gateway:deploy; node scripts\verify-served.ts https://genesis402.com
```
Fail-safe: `X402_NETWORK=base` without both secrets keeps paid routes at 503. UNVERIFIED until the first live call: that the CDP `/platform/v2/x402` endpoints accept x402Version 1 payloads (they did for the original SDK; x402 v2 wire support is the next task if not), and the USDC EIP-712 domain name `USD Coin` / version `2` on Base.
