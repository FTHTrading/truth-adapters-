# ADR-0005: Append-only enforcement at the storage layer

- **Status:** Proposed
- **Date:** 2026-09-13
- **Deciders:** Kevan, Claude
- **Scope:** gateway (D1), kernel (file ledger)

## Context

Invariant 3: no edits, no deletes, ever. HEARTH incident 2026-08-10: two
`ReceiptLog` writers in one process produced two entries at seq 88 with the
same `prevHash` (defect class L-05). Application code promising append-only is
not enough; the store has to refuse.

## Decision

1. **D1 schema installs `BEFORE UPDATE` and `BEFORE DELETE` triggers that
   `RAISE(ABORT)`.** The `D1Ledger` class exposes no update or delete. Both
   layers would have to be removed for history to change, and dropping a
   trigger is itself visible in D1's audit history.
2. **`seq` is the PRIMARY KEY.** Two isolates racing for the same head both
   compute `seq = head + 1`; exactly one INSERT succeeds. The loser re-reads
   the head and retries up to 8 times, then fails loudly. A fork at the
   storage layer is impossible by construction.
3. **In-process appends are serialised** (`AppendQueue`) for the memory and
   file ledgers, so a single process cannot interleave head reads.
4. **Anchors are ledger records.** The hourly cron computes the merkle root
   over entries `0..n-1` and appends `{kind:"ANCHOR", merkle_root, entries,
   head_hash, ts}` as entry `n`. The anchor of history is history; the
   verifier checks every anchor against the entries it covers.
5. **Integrity failure stops work.** `FileLedger.open` verifies the whole
   chain and throws `IntegrityError` at the first defect; the verifier exits 1.
   Nothing repairs, re-pins or re-runs (HEARTH Rule 10).

## Alternatives considered

- **Durable Object as single writer** — deferred (ADR-0001).
- **Soft-delete / redaction column** for legal takedowns — rejected; USAGE.md
  answers this: if append-only conflicts with law in a domain, the system is
  not suitable for that domain. Submitted adapters store digests, not content,
  which keeps most such conflicts out of the ledger to begin with.

## Consequences

- The `data/*.jsonl` file ledgers used locally are single-writer per process
  (minor finding).
- Ledger growth is bounded by paid requests only (ADR-0004).
