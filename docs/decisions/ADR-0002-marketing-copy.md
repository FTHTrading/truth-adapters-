# ADR-0002: Marketing copy — approved and forbidden phrases

- **Status:** Proposed (founder flag F-8)
- **Date:** 2026-09-13
- **Deciders:** Kevan, Claude, counsel for any REGULATED string
- **Scope:** Cross-cutting (manifest, README, agent playbook, agent replies)

## Context

The product's entire value is the narrowness of its claim. Copy that widens
the claim ("verified", "proves", "compliant") destroys the thing being sold.
The witness agents will generate copy at scale, so the lists must be literal.

## Decision

### APPROVED (verbatim)

- "records what happened, who paid, and when"
- "cryptographically witnessed" / "signed and hash-chained" / "append-only"
- "tamper-evident" (never tamper-proof)
- "independently verifiable by anyone, without trusting the operator"
- "it does not judge intent, interpret meaning, decide fairness, resolve disputes or explain outcomes"
- "no account, no API key: pay per observation over x402"
- "non-custodial: payments settle through a third-party facilitator to UnyKorn LLC; the gateway never holds funds"
- "translation-only adapters: they map a domain to an observation and add no rules"
- "UnyKorn LLC (Wyoming)"
- "built on the truth substrate (github.com/kevanbtc/truth)"

### FORBIDDEN (must not appear on any surface or in any agent reply)

- "verified true", "proves", "proof of correctness", "proof of authenticity",
  "authenticated" — the system proves an observation occurred, not that the
  observed thing is true, correct or authentic.
- "compliant", "compliance", "audit-grade", "regulator-approved" — no rulepack
  lives here; TEV is a separate product.
- "tamper-proof", "unhackable", "immutable guarantee" — say tamper-evident.
- "notarized", "notary", "legally binding", "admissible" — legal terms of art.
- "insured", "guaranteed", "licensed", "registered", "SEC", "FDIC", "SIPC".
- "custody", "custodian", "vault" — the gateway holds nothing.
- "zero-knowledge", "we can't see your data" — the gateway sees what it is sent
  (digests for submitted adapters, full responses for direct ones).
- "BitGo", "UNYKORN 7777", "TROPTIONS", "LEI 2549008J7LUHSQ73SI26", "MIC UBEC".
- Any revenue figure or valuation without a source in the same sentence.

### Standing perimeter statement

"UnyKorn LLC is a technology and administration service provider. It is not
a bank, broker-dealer, exchange, custodian, trustee, transfer agent,
appraiser, auditor, investment adviser, money transmitter, or issuer."

## Consequences

- `agents/WITNESS-AGENT.md` embeds both lists; an agent that cannot answer a
  question with approved phrases says "that is outside what this system records".
- CI (once the repo is pushed) greps every `.md` and manifest string against
  the forbidden list.
