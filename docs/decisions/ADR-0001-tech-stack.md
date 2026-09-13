# ADR-0001: Tech stack baseline

- **Status:** Proposed
- **Date:** 2026-09-13
- **Deciders:** Kevan, Claude
- **Scope:** Cross-cutting

## Context

The substrate is 981 lines of TypeScript with no runtime dependencies. The
adapters layer must run in two places (Cloudflare Workers for the paid
gateway, Node for local witnessing and the MCP server) and must stay auditable
by a stranger in an afternoon. ANVIL §8: boring where it is load-bearing.

## Decision

- **Language/runtime:** TypeScript executed natively by Node ≥ 24 (type
  stripping; erasable syntax only, `.ts` import specifiers). No build step for
  Node targets. Cloudflare Workers bundled by wrangler/esbuild.
- **Kernel:** zero dependencies. Hashing and Ed25519 via WebCrypto so one
  implementation serves both runtimes.
- **Gateway:** Cloudflare Worker + D1 (SQLite) with append-only triggers.
- **Tests:** `node:test` + `node:assert/strict`. No test framework.
- **Agent side:** `@modelcontextprotocol/sdk` (MCP server), `zod` (tool input
  schemas), `viem` (EIP-712 signing for x402 `exact`). These three are the
  only runtime dependencies in the repo and none is loaded by the kernel or
  the gateway.
- **Package manager:** pnpm workspace; `pnpm install --frozen-lockfile` in CI.

## Alternatives considered

- **Vitest** (ADR template default) — deferred; the native runner covers
  the need with zero install. Revisit if coverage reports are required.
- **Durable Object for append serialisation** — deferred; D1's PRIMARY KEY on
  `seq` plus retry gives the same no-fork guarantee with less machinery
  (ADR-0005). Adopt a DO if append contention is ever measured.
- **Workspace package imports (`@truth/kernel`)** — rejected for now; Node
  refuses to type-strip files resolved through `node_modules`, so packages use
  relative `.ts` imports. Package names are declared for future publication.

## Consequences

- Any contributor needs Node 24+. Enforced by `engines`.
- No enums, parameter properties or namespaces anywhere (`erasableSyntaxOnly`).
- The worker tsconfig excludes Node-only files (file ledger, git adapter).
