# ADR-0003: The kernel's relationship to the frozen substrate

- **Status:** Proposed
- **Date:** 2026-09-13
- **Deciders:** Kevan, Claude
- **Scope:** kernel

## Context

`kevanbtc/truth` v1.0.0 is FROZEN by its own specification. Read in full on
2026-09-13 (981 lines of source, commit 2e3c850). The specification is sound;
the implementation leaves gaps between what the documents promise and what the
code does. Backend state of each promise, per HEARTH Rule 6:

| Promise (README / SPEC) | State in v1.0.0 | Evidence |
|---|---|---|
| "Ledger integrity (hash chain)" verifiable | **ABSENT** — entries are independent JSON lines; only the merkle anchor relates them | `src/core/ledger.ts` appends `JSON.stringify(record)`; no `prev` field anywhere |
| "Witness provenance (event attribution)" | **SKELETON** — witness is a plain string; anyone can write `"witness":"POPEYE"` | `src/core/event.ts`, no signature field |
| "Cost-gated truth — no commitment without stake" | **SKELETON** — `requireCost` is `stake > 0` on a caller-supplied number; nothing is staked | `src/runtime/cost.ts` |
| "Deterministic hashing" | **REAL but order-dependent** — `sha256(JSON.stringify(data))` changes with key order | `src/runtime/integrity.ts` |
| "All tests passing" | **PARTIAL** — 8 of 13 formal adversarial cases record `passed: true` unconditionally; only the state-machine cases assert | `src/tests/adversarial_formal.ts` tests 1.1, 1.2, 2.1, 2.2, 4.1, 4.2, 5.1, 5.2 |
| Event identity | event `id = hash(payload)`, so identical payloads share an id; the shipped `data/ledger.jsonl` shows the same id at lines 1 and 3 | `src/core/witness.ts` |
| "This system has no license" | README says no license; `package.json` says `"license": "MIT"` | both files |
| Append-only file, merkle root, state-transition table, refusal recording | **REAL** | `ledger.ts`, `merkle.ts`, `transitions.ts`, `submit.ts` |

## Decision

1. **The frozen repo is not modified.** It remains the specification of
   record and the philosophical source.
2. **`packages/kernel` re-implements the specification's primitives** with
   four hardenings that the spec itself lists as extension points or
   implementation requirements:
   - canonical JSON before hashing (Implementation Requirement 2);
   - a `prev` hash on every entry, verified from genesis (README "hash chain");
   - Ed25519 signatures on events (spec "witness signature verification");
   - cost as a witnessed settlement (`CostProof.witnessed_event_id` must be an
     EVENT in the same ledger), not a bare number (Invariant 2).
3. **One deliberate deviation:** event id = `sha256(canonical{type, ts,
   witness, payload})`. Two observations of the same payload are two events.
4. **The adversarial suite is ported with real assertions** (every case reads
   the ledger) and extended: chain tamper, deletion, re-hash with stale prev,
   signature forgery, unwitnessed cost, float cost, FAILED-with-cost,
   concurrent appends.
5. The state-transition table is ported verbatim, with `min_stake` as bigint.

## Consequences

- The kernel implements signed, hash-chained, canonicalized records and
  witnessed settlement bindings designed to satisfy the substrate's stated
  integrity goals. Whether it does so in every edge case is a claim for an
  independent reviewer (FORGE Phase 4, two reviewers at sec=CRITICAL), not
  for this ADR. Until that review, the public label is LOCAL_VERIFIED.
- The frozen repository should be described as a conceptual/reference
  substrate and frozen design artifact, not as an independently proven
  integrity core.
- Founder flag F-6 decides whether the findings above go upstream.
- If v1.0.0 is ever amended upstream, this ADR is superseded by one that
  maps the new baseline.
