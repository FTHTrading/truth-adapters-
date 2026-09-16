# Ship receipt — genesis402.com + troptionsmint.com on the truth gateway, then LIVE

Date: 2026-09-16 · Entity: UnyKorn LLC · FORGE-CLASS sec=HIGH claims=REGULATED custody=NONE hearth=NONE chain=ISSUE(x402 mainnet) surface=PUBLIC
Operator direction (Kevan, 2026-09-16): "YES" to troptionsmint.com as an x402 agent surface; "it needs to say nothing"; remove DRY_RUN and go live.

## What is staged (committed on `main`, 119/119 tests, claims gate green for both hosts)

| Item | State |
|---|---|
| Worker `genesis402-apex` = truth gateway (`packages/gateway`), routes `genesis402.com/*`, `www.genesis402.com/*`, `troptionsmint.com/*`, `www.troptionsmint.com/*` | wrangler.jsonc (test mode: Base Sepolia, x402.org facilitator) |
| Landing: host name + live labels only, no slogan, no brand string; head canvas with pointer tracking and **opt-in camera tracking** (MediaPipe face landmarks from cdn.jsdelivr.net, on-device; motion-centroid fallback; frames never leave the page); **agents panel** reading `twin.unykorn.org/health` and `/prove/stats` live | `src/landing.ts`, test "landing says nothing…" |
| `wrangler.live.jsonc` = same Worker, `X402_NETWORK=base`, CDP facilitator | needs the two secrets below |
| Zone `troptionsmint.com` | **PAUSED** at Cloudflare (that is why it does not load); DNS already proxied to the edge; routes already bound |

## Step 1 — Kevan: deploy the gateway (test mode) to both domains

```powershell
cd C:\Users\Kevan\dev\truth-adapters\packages\gateway; npx wrangler deploy
```

Rollback: `npx wrangler rollback --name genesis402-apex` (previous version 36d59739 = old apex page).

## Step 2 — unpause troptionsmint.com (I do this on your "DEPLOYED", or you run it)

```powershell
$t = (Get-Content "$env:USERPROFILE\.cloudflare.env" | Select-String '^CLOUDFLARE_API_TOKEN=').ToString().Split('=')[1]
Invoke-RestMethod -Method Patch -Uri "https://api.cloudflare.com/client/v4/zones/b5df82b6556421e070b8a277a0d3dd78" -Headers @{Authorization="Bearer $t"} -ContentType 'application/json' -Body '{"paused":false}'
```

Rollback: same call with `{"paused":true}`.

## Step 3 — Kevan: go LIVE on Base mainnet

The rail's `.env` (`GitHub_Audit\UnyKorn-X402-aws\packages\fth-x402-site\.env`) already holds a working CDP pair (`COINBASE_CDP_API_KEY` = key id, `COINBASE_CDP_API_SECRET` = secret; the rail reports `settlement.cdp: ready`). The gateway wants the same values under its own names:

```powershell
cd C:\Users\Kevan\dev\truth-adapters\packages\gateway
npx wrangler secret put CDP_API_KEY_ID --name genesis402-apex       # paste COINBASE_CDP_API_KEY
npx wrangler secret put CDP_API_KEY_SECRET --name genesis402-apex   # paste COINBASE_CDP_API_SECRET
npx wrangler deploy -c wrangler.live.jsonc
```

Rollback to test mode: `npx wrangler deploy` (plain wrangler.jsonc). Secrets can stay.

## Verify-served (I run this after each step)

- `https://genesis402.com/` and `https://troptionsmint.com/` → 200, `<title>` = host + " — x402 truth gateway", no "TROPTIONS"/slogan strings, camera button present.
- `/.well-known/x402` on both → after step 3 `mode: LIVE`, `network: eip155:8453`, payTo `0x7d9a…56DB`.
- `/status.json` labels `mode: live`, `status: LIVE_LIMITED`.
- Claims gate on served bytes: `node discovery/check-claims.cjs` equivalent = the test `landing says nothing…` run against the live HTML.
- Paid path exercised once with the desk settlement twin (Kevan approves), receipt visible at `/verify/<entry_hash>`.

## What this does not do

Going LIVE lets an agent pay. It does not make one pay. Buyers still have to arrive through the Bazaar index (first settled call on the rail), payforapi-style directories, or a client's own agents.
