# Ship receipt — genesis402.com + troptionsmint.com on the truth gateway, then LIVE

Date: 2026-09-16 · Entity: UnyKorn LLC · FORGE-CLASS sec=HIGH claims=REGULATED custody=NONE hearth=NONE chain=ISSUE(x402 mainnet) surface=PUBLIC
Operator direction (Kevan, 2026-09-16): "YES" to troptionsmint.com as an x402 agent surface; "it needs to say nothing"; remove DRY_RUN and go live; transactions happening.

## What is staged (committed on `main`, 120/120 tests, claims gate green for both hosts)

| Item | State |
|---|---|
| Worker `genesis402-apex` = truth gateway (`packages/gateway`), routes `genesis402.com/*`, `www.genesis402.com/*`, `troptionsmint.com/*`, `www.troptionsmint.com/*` | wrangler.jsonc (test mode: Base Sepolia, x402.org facilitator) |
| Landing: host name + live labels only, no slogan, no brand string; head canvas with pointer tracking and **opt-in camera tracking** (MediaPipe face landmarks from cdn.jsdelivr.net, on-device; motion-centroid fallback; frames never leave the page); **agents panel** reading `twin.unykorn.org/health` and `/prove/stats` live | `src/landing.ts`, test "landing says nothing…" |
| **Facilitator proxy** `/facilitator/{supported,verify,settle}`: bearer-keyed, forwards to the CDP facilitator with the gateway's own JWT. One CDP credential serves every UnyKorn Worker. | `src/app.ts`, test "facilitator proxy…" |
| `wrangler.live.jsonc` = same Worker, `X402_NETWORK=base`, CDP facilitator | needs the two CDP secrets (step 3) |
| Zone `troptionsmint.com` | **PAUSED** at Cloudflare (that is why it does not load); DNS already proxied; routes already bound |
| Desk (`~/unykorn-control`) | "Path to the first dollar" panel: 8 live-checked steps, wallet balances from a Base RPC node, Bazaar index scan; buttons **First settled call** and **daily keepalive**; commits 7b7d262, c9281f9 |
| blockchainfraud.org worker | `wrangler.toml` now points `X402_FACILITATOR` at `https://genesis402.com/facilitator` (commit 89bd33a, not deployed) |

## Step 0 — Kevan: fund the settlement twin (F-1 resolved: settlement-01 pays)

Send **5 USDC on Base** to the desk's settlement twin `0x69595cce62bD0D128d5760774406bb253Ea97DB1` (balance 0.00 on 2026-09-16; the desk reads it live). No ETH needed: exact-scheme x402 payments are EIP-3009 authorizations and the facilitator pays gas. For reference: treasury `0x7d9a…56DB` holds 1.00 USDC, Scout `0x710c…7ab9` holds 0.07.

## Step 1 — Kevan: deploy the gateway (test mode) to both domains

```powershell
cd C:\Users\Kevan\dev\truth-adapters\packages\gateway; npx wrangler deploy
```

Rollback: `npx wrangler rollback --name genesis402-apex` (previous version 36d59739 = old apex page).

## Step 2 — unpause troptionsmint.com (I do this on your "DEPLOYED", or you run it)

```powershell
$t = "<a Cloudflare API token with Zone Settings:Edit on troptionsmint.com>"
Invoke-RestMethod -Method Patch -Uri "https://api.cloudflare.com/client/v4/zones/b5df82b6556421e070b8a277a0d3dd78" -Headers @{Authorization="Bearer $t"} -ContentType 'application/json' -Body '{"paused":false}'
```

Rollback: same call with `{"paused":true}`.

## Step 3 — Kevan: go LIVE on Base mainnet

The CDP key pair already exists on the operator's machine (the task rail settles with it today; `twin.unykorn.org/health` reports `settlement.cdp: ready`). Where it lives and the proxy bearer's location are in the operator's private note, not in this public repo.

```powershell
cd C:\Users\Kevan\dev\truth-adapters\packages\gateway
npx wrangler secret put CDP_API_KEY_ID --name genesis402-apex         # CDP key id
npx wrangler secret put CDP_API_KEY_SECRET --name genesis402-apex     # CDP key secret
npx wrangler secret put FACILITATOR_PROXY_KEY --name genesis402-apex  # the shared proxy bearer
npx wrangler deploy -c wrangler.live.jsonc
```

Rollback to test mode: `npx wrangler deploy` (plain wrangler.jsonc). Secrets can stay.

## Step 4 — Kevan: mainnet settlement for blockchainfraud.org /api/x402/screen

```powershell
cd C:\Users\Kevan\dev\platforms\blockchainfraud
npx wrangler secret put X402_FACILITATOR_KEY --name blockchainfraud-site   # the SAME shared proxy bearer
npx wrangler deploy
```

Verify: `curl -X POST https://blockchainfraud.org/api/x402/screen` → 402 whose body says `settlement: live`.

## Step 5 — the first settled call, then keepalive (desk, your clicks)

Command view → **Enable LIVE settlement** → **First settled call (Bazaar listing)**. The settlement twin quotes `POST twin.unykorn.org/prove`, signs, submits; the rail settles through CDP; the receipt appears under Receipts; the Coinbase Bazaar (16,058 resources on 2026-09-16, none of ours) indexes the rail on its next crawl and the desk shows "Listed". Optional: **Start daily keepalive call** = one self-paid 0.25 USDC call per day while LIVE. Self-paid calls are not revenue; they keep the listing fresh.

## Verify-served (I run this after each step)

- `https://genesis402.com/` and `https://troptionsmint.com/` → 200, `<title>` = host + " — x402 truth gateway", no "TROPTIONS"/slogan strings, camera button present.
- `/.well-known/x402` on both → after step 3 `mode: LIVE`, `network: eip155:8453`, payTo `0x7d9a…56DB`.
- `/status.json` labels `mode: live`, `status: LIVE_LIMITED`.
- `/facilitator/supported` with the bearer → 200 with `eip155:8453`; without → 401.
- Claims gate on served bytes = the test "landing says nothing…" run against the live HTML.
- Paid path exercised once from the desk (step 5), receipt visible at `/verify/<entry_hash>` and in Receipts.

## What this does not do

Going LIVE lets an agent pay. It does not make one pay. Buyers arrive through the Bazaar index (first settled call), the x402.org ecosystem listing (PR coinbase/x402#331, open, review required), payforapi-style directories, or a client's own agents.
