# Task 3 — genesis402.com becomes the truth gateway

```
FORGE-CLASS: entity=UnyKorn LLC  sec=CRITICAL  claims=MARKETING  custody=NONE
             hearth=TOUCHES  chain=READ  surface=PUBLIC
```
Routing: FULL FORGE, including Phase 6 (ship receipt + verify-served).

Authorisation: Kevan, chat, 2026-09-13: "genesis402.com needs to be the
github.com/FTHTrading/truth-adapters- … it has to be sites that represent the
truth not anything else … lead this make all the changes". That resolves F-1
(push as-is) and the cross-repo F-7 (truth-adapters is canonical for
genesis402.com).

## What

Replace every served surface of genesis402.com with the truth gateway: a
truthful landing page at `/`, the manifest, discovery documents, the paid
`/witness/*` routes, `/verify/*`, `/entries`, `/anchor`, schemas. Publish the
repository. Record the plan and the decision in the UnyKorn console.

## Why

The apex page served today says "THE EMPIRE IS BUILT DIFFERENT", "570+
agents", "37k+/mo", "Not a demo. A live operating system." The discovery
documents describe a task server with a policy layer. Neither represents the
substrate. genesis402.com is to say only what the ledger can show.

## In scope

- Landing page served by the gateway, approved phrases only, labels visible.
- `/.well-known/agent.json` agent card for the truth gateway.
- Claims gate over every served document (forbidden phrases, ADR-0002).
- `verify-served` script run against the live host after deploy.
- D1 `truth-ledger` created and migrated; witness key provisioned as a secret.
- Worker routed on `genesis402.com/*` and `www.genesis402.com/*`; the prior
  `genesis402-discovery` Worker un-routed (kept deployable for rollback).
- Mode: `test` (Base Sepolia, x402.org facilitator) until the CDP facilitator
  credentials for mainnet are provisioned by Kevan (F-3 successor).
- Push `main` to `FTHTrading/truth-adapters-`.
- Go-to-market copy for selling paid observations, in the repo.
- UnyKorn console (`~/unykorn-control`): plan document, F-7 resolution,
  estate registry entry.

## Out of scope

Touching `twin.unykorn.org` (the existing task server keeps running, its own
discovery document stays its own), mainnet settlement, `/llms.txt` (owned by
`unykorn-geo-index`, deliberately not routed), Moltbook.

## Acceptance

1. Every route on genesis402.com returns the truth gateway's document, with
   `labels` and `limitations`, and passes the claims gate on served bytes.
2. `/` is HTML for browsers and the manifest for `Accept: application/json`.
3. A paid observation round-trips on Base Sepolia (or the exact blocker is named).
4. Rollback is one documented command and was tested before cut-over.
5. Console plan exists and links every artefact.
