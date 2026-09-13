# truth-adapters — FORGE Progress Log

Started: 2026-09-13
Base: new repository beside the read-only clone of kevanbtc/truth at `C:\Users\Kevan\truth`
Branch: `main` (initialised locally, no commits, remote set to FTHTrading/truth-adapters-, nothing pushed)

Under FORGE against the ANVIL canon. HEARTH runtime rules always apply.

---

## M1 — Kernel, adapters, gateway, verifier, MCP

**Status:** built and verified locally; ship gate not crossed
**Brief:** `.forge/task-1-brief.md` · **Report:** `.forge/task-1-report.md`

Task 01: complete (uncommitted tree; self-review; typecheck clean ×2; node:test 85/85; demo INTACT ×2; wrangler dry-run bundles). Founder flags F-1..F-8 open.

## M2 — Portable, independently checkable records

**Status:** built and verified locally; ship gate not crossed
**Brief:** `.forge/task-2-brief.md` · **Report:** `.forge/task-2-report.md`

Task 02: complete (uncommitted; self-review found 3 defects in my own vectors/scripts → FIXED before report; typecheck clean ×2; node:test 106/106; vectors reproduce byte-for-byte; fresh-copy check PASS; wrangler dry-run bundles). Claims discipline: STATUS.md is the truth panel; every emitted document carries labels + limitations.

=== CHECKPOINT after Task 02: kernel/adapters/gateway/verify/mcp + frozen schemas + vectors + discovery. 106/106 passing. LOCAL_UNRELEASED. ===

---

## Open founder-flags

See `.forge/founder-flags.md`. F-1 blocks push; F-2, F-3, F-5 block deploy; F-8 blocks any public copy.
