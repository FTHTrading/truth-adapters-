# ADR-0004: A settled payment is the stake; unpaid paths write nothing

- **Status:** Proposed
- **Date:** 2026-09-13
- **Deciders:** Kevan, Claude
- **Scope:** gateway

## Context

Invariant 2: no commitment without cost. Over HTTP the only cost a stranger
can pay without an account is a payment. x402 gives an agent a way to pay in
USDC from a signed authorization, with a facilitator verifying and settling
on-chain. The gateway also has to survive being hit for free all day.

## Decision

1. **The stake is the settlement.** Before any adapter runs, the facilitator's
   settle response is observed by a `COST:<rail>` witness and recorded. The
   adapter's finalization carries a `CostProof` whose `witnessed_event_id`
   must exist in the same ledger. A cost that was not observed here is not
   a cost (adversarial test 2.4).
2. **Order of operations:** decode header → local checks (pay-to, amount,
   network) → facilitator `/verify` → facilitator `/settle` → cost witnessed →
   adapter observes → finalization. Verify failure and settle failure return
   402 and write nothing, because nothing was paid.
3. **Unpaid paths write nothing.** Unknown adapter, malformed body, missing or
   invalid payment: 4xx, no ledger entry. The substrate records refusals; the
   gateway's refusals-before-payment are not the substrate's refusals, they
   are the front door declining to open. Once paid, everything is recorded,
   including REFUSED (unobservable input), FAILED (upstream error; recorded and
   REJECTED for finalization) and adapter opinions (refused as unobservable).
4. **Two rails, one witness shape.** x402 `exact` on Base (USDC, EIP-3009) and
   the Apostle Chain ATP receipt rail (`X-Payment-Receipt`, verified at the
   existing UnyKorn facilitator). The cost event records rail, asset, amount,
   payer, reference, facilitator host and settle time.
5. **Non-custodial.** The facilitator settles directly to `X402_PAY_TO`, an
   address controlled by UnyKorn LLC. The gateway never constructs or
   broadcasts a transfer and never holds a balance.
6. **Fail-safe default.** No pay-to address (or the zero address) disables paid
   routes with 503. The manifest says so.
7. **Agent-side cap.** The MCP client refuses to sign any single payment above
   `X402_MAX_ATOMIC` (default $0.10) before touching the key.

## Alternatives considered

- **Record unpaid refusals** (closer to the substrate's letter) — rejected;
  free unbounded writes are a denial-of-history vector and would make the
  ledger mostly noise.
- **Charge, then refund on REFUSED** — rejected; refunds are a bypass and a
  custody act. The paid refusal is the product working as specified.
- **API keys / accounts** — rejected; USAGE.md forbids permission systems, and
  accounts are exactly what agents do not want.

## Consequences

- UNVERIFIED until first testnet call: the facilitator response field names
  (`transaction` vs `txHash`) and the USDC EIP-712 domain names. Both are
  handled defensively and listed in `.forge/minor-findings.md` / F-3.
- Prices are founder-owned (F-2).
