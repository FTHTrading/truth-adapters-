# ADR-0007: The `g402-receipt` adapter witnesses console receipts one way

- **Status:** Accepted (follows from ADR-0006)
- **Date:** 2026-09-13
- **Deciders:** Kevan
- **Scope:** adapters

## Context

ADR-0006 makes `genesis402-receipt-v1` a producer profile. The console issues
receipts with a decision layer, truth labels and a policy hash; the substrate
must give those receipts an independent witness without adopting any of that.

## Decision

`g402-receipt` is a submitted-observation adapter. From a receipt it records:
version, id, kind, mode, issuer id and key id, issued-at, canonical body hash,
leaf hash, segment root, and the submitter. It refuses anything that is not a
well-formed v1 receipt with all integrity commitments present.

It does not record `decision`, `truthLabels`, `claim`, `policy`, `body` or the
issuer signature, and it does not verify the signature. Verifying would make
the substrate a second judge of the receipt; recording the outcome would make
it a mouthpiece. The receipt's own verifier (`402-truth/packages/verify`)
remains the place where the receipt is checked.

Direction is one way: console → gateway → ledger. The gateway never calls
the console and the console's format never defines a substrate record.

## Consequences

- A buyer of a console receipt can obtain a second, independent, time-bound
  record that the receipt existed, from a key the console does not hold.
- Price: 1000 atomic USDC (F-2 applies).
- The console may automate this call after every sealed segment; that is the
  console's decision and its own founder flag.
