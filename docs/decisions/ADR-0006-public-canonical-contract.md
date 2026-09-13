# ADR-0006: Public canonical contract for genesis402.com (resolves F-7)

- **Status:** Accepted 2026-09-13 (Kevan, chat: "okay keep going", after the cut-over sequence was laid out with this ADR as step 1, and consistent with his earlier directive "genesis402.com needs to be truth-adapters"). Supersedes the "receipt-v1 is the public format" line in the 402-truth push.
- **Date:** 2026-09-13
- **Deciders:** Kevan
- **Scope:** Cross-cutting; binds `truth-adapters`, `unykorn-control`, `402-truth`, and the `genesis402` Cloudflare zone.

## Context

Two sessions reached opposite conclusions on the same day. One pushed
`FTHTrading/402-truth` with the line "receipt-v1 is the public format, and
truth-adapters adapts to it." Kevan's directive to this session was
"genesis402.com needs to be truth-adapters … sites that represent the truth
not anything else." These are opposite public-product architectures: they
decide who owns the canonical schema, what third parties may build against,
whether the console can change its receipt model without a public break, and
which repository is the source of truth for the domain.

## Decision

genesis402.com publishes the truth witness contract as its canonical public
interface:

- **Canonical public formats:** `truth-record-v1` (ledger entry) and
  `truth-attestation-v1` (paid response), frozen in `truth-adapters/docs/schema/`.
  They are versioned independently of any producer.
- **`truth-adapters`** is the public product surface and the normalization
  layer: witnesses, adapters, gateway, verifier, MCP server.
- **`genesis402-receipt-v1`** is a producer format originated by the UnyKorn
  console (`unykorn-control`). It is supported through a `g402-receipt`
  adapter (to build; one direction only). It is not the canonical public
  format and does not define the Genesis402 platform contract.

Routing:

- `genesis402.com`, `www.genesis402.com` → the truth gateway (`truth-adapters`).
- Console interfaces and receipt-v1 artefacts → a console route or domain
  (`console.genesis402.com` or the console's existing host), never the apex.
- The `genesis402` Pages project is not pointed at `402-truth`.

Compatibility:

```
console receipt-v1  →  g402-receipt adapter  →  truth-record-v1 (witnessed, signed, chained)
future producer     →  its adapter           →  truth-record-v1
```

Positioning: the substrate is presented as the deterministic evidence and
verification layer underneath the broader agentic-commerce narrative, not as
a competing receipt-console brand.

## Consequences

- `402-truth` keeps its spec, verifier and examples as the console's producer
  toolkit; its `site/index.html` is not deployed to the apex. Its README should
  state that receipt-v1 is a producer profile witnessed by genesis402.com.
- `unykorn-control` founder flag F-7 is resolved by this ADR, not by a push.
- The truth gateway cut-over (`.forge/ship-receipt-genesis402-v1.md`) resumes
  only after acceptance, by one of the two paths recorded there.
- The `g402-receipt` adapter and its ADR-0007 are the first build after acceptance.

## Alternatives considered

- **receipt-v1 as the domain-wide standard** — rejected: the first producer
  would own the public schema, and every future evidence source would have to
  conform to a console's internal model.
- **Two public formats side by side** — rejected: two "canonical" schemas on
  one domain is the confusion this ADR exists to end.
