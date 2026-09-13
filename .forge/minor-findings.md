# Minor findings — batch into a hardening pass

- **File ledger has no cross-process lock.** `FileLedger` serialises appends
  within one process only. Two processes on one file could interleave. Use
  the gateway (D1) for anything shared; add an advisory lock if the file
  ledger ever backs a service.
- **Inclusion proofs are O(n).** `/verify/{hash}` loads every entry up to the
  anchor to build the proof. Fine to ~100k entries; cache per-anchor leaf
  lists or store proofs alongside anchors after that.
- **`latestAnchor` pages backwards.** With hourly anchors this touches one
  page; add a `kind` index query on D1 (`D1Ledger.latestByKind`) when it grows.
- **External timestamping is not wired.** Anchors are merkle roots in the
  ledger, signed by the same key. LPS-1 calls for Polygon + Bitcoin OTS; the
  anchor record shape is ready for an `external` field.
- **No rate limit on free GET routes.** `/entries` and `/verify` are
  unauthenticated reads; put Cloudflare rate limiting in front before PUBLIC.
- **Facilitator response shape is v1 as documented, not live-tested.** Handles
  both `transaction` and `txHash` keys; confirm against x402.org on first
  testnet call and delete the alternate.
- **`http-served` buffers up to 8 MB in memory.** Streams would let the cap
  rise; Workers `DigestStream` is the right tool.
- **Apostle rail payer identity** is the `X-Agent-Id` header (self-declared)
  or `apostle:<tx>`. The receipt verify endpoint does not return the sender;
  extend the facilitator response if payer attribution matters on that rail.
- **wrangler.jsonc `database_id` is a placeholder UUID** on purpose (deploy
  fails until F-5); the dry-run still resolves the binding.
- **`git-commit` adapter test flaked once in five full-suite runs** (2026-09-13,
  passes in isolation and 4/5 in parallel). Node runs test files concurrently;
  the test spawns `git init`/`commit` in a fresh temp dir with an explicit
  identity env. Suspect a Windows temp-dir or spawn timing race. Capture the
  assertion on next occurrence; consider `--test-concurrency=1` for that file.
- **Never probe a production ledger** (2026-09-13 incident, see
  `.forge/ship-receipt-genesis402-v1.md`). A trigger test inserted a permanent
  invalid row into the first production D1; the database was abandoned for a
  fresh one. Add to `/health`: `genesis_ok` = first row has `seq 0` and
  `prev` all zeros; move the trigger exercise to `wrangler d1 execute --local`.
