# Selling witnessed observations over x402

Every sentence here is drawn from ADR-0002's approved list or states a fact
the ledger can show. Nothing below may be published while genesis402.com is in
`test` mode without the line "test network only; nothing here carries value".

## The product in one sentence

A signed, hash-chained, append-only record that a named witness observed a
specific thing at a specific time and that a specific payer paid for that
record, verifiable by anyone without trusting UnyKorn LLC.

## Who buys it and why

| buyer | what they witness | why they pay |
|---|---|---|
| agents and agent frameworks that speak x402 | anything they later need to show they saw: a page, a receipt, a transaction | a URL and a price, no account, no invoice, no human in the loop |
| teams that deploy software | `http-served` on their production URL after each release | "verify served, not repo" as a third-party record |
| chains, issuers, treasuries | `evm-tx`, `xrpl-tx` | a receipt existed at a time, from a witness that is not the issuer's own explorer |
| AI products | `ai-output` prompt and output digests | a third-party record that a pair existed at a time, without disclosing either |
| anyone with a document | `document` digest | the submission is the fact; the content stays theirs |
| any issuer of receipts (Genesis402's own task server included) | `correction`, `document` | an independent second witness of their own records |

## Price

Read from the live manifest at post time, never quoted from memory. Today,
`TEST_PRICING`: submitted adapters 0.001 USDC, direct adapters 0.005 USDC
per observation. Prices change only by founder flag F-2 and a successor ADR.

## The only pitch: a demonstration

1. Pick something public the audience cares about: their production URL, a
   transaction they announced, a commit they tagged.
2. Witness it (`truth_witness_paid`). Check it (`truth_verify`) and require
   `event_verdict.ok === true` before saying anything.
3. Post the three facts the entry holds and the verify URL. Nothing else.

> Observed {what} at {iso time}. Entry `{hash}`. Anyone can verify it:
> {verify_url}. It records what happened, who paid, and when. It does not
> judge, interpret, or explain. {price} per observation, paid over x402, no
> account. Test network only; nothing here carries value. (drop the last
> sentence only when `labels.mode == "live"`)

## Channels

Wherever agents already discover x402 endpoints: `/.well-known/x402`,
`/.well-known/agent.json`, `/openapi.json` on genesis402.com, x402 directory
listings, MCP registries (the `truth` MCP server is in `packages/mcp`).
Moltbook is founder flag F-4 and stays a template until decided.

## Objections, answered with facts only

- "Is this proof my content is real?" No. It is a record that you submitted
  this digest at this time and paid for the record.
- "Can you delete an entry?" No. There is no code path for it; the storage
  layer aborts updates and deletes.
- "Who holds the money?" Nobody in this system. The facilitator settles to
  UnyKorn LLC; the gateway never holds funds.
- "How do I know you didn't fake it?" Verify the entry: signature, chain
  links, inclusion proof against the anchor. You do not have to know us.
- "Is it anchored to Bitcoin?" Not yet. The label says `UNANCHORED` and it
  will say `ANCHORED` only when an external proof is persisted and checked.
- "Is this compliant with X?" That is outside what this system records.

## What is never said

verified true · proves · authenticated · compliant · audit-grade ·
tamper-proof · notarized · legally binding · insured · guaranteed · licensed ·
custody · zero-knowledge · any revenue or valuation figure without a source ·
any headcount of agents · the word empire.
