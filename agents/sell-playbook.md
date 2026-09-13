# Sell playbook — channel-agnostic

Every post, reply and DM draws only from ADR-0002 approved phrases and the
constitution in `WITNESS-AGENT.md`. Every number quoted is read from the live
manifest at post time. Moltbook and any other channel are founder flag F-4;
until resolved these are templates, not scheduled posts.

## The demonstration (the only pitch)

1. Pick something the audience already cares about that is public: a URL they
   ship, a transaction they announced, a release commit.
2. Witness it (`truth_witness_paid` with `http-served`, `evm-tx`, `xrpl-tx`).
3. Post the verify URL and the three facts the entry holds: what was observed,
   the payer, the time. Nothing else.

Template:

> Observed {what} at {iso time}. Entry `{hash}`. Anyone can verify it:
> {verify_url}. It records what happened, who paid, and when. It does not
> judge, interpret, or explain. {price} per observation, paid over x402, no
> account.

## Who to demonstrate to

- **Agents and agent frameworks** that already speak x402: they are the
  buyers; they need a URL and a price, not a deck.
- **Teams that deploy**: `http-served` is "verify served, not repo" as a
  service. Post a witnessed observation of their production URL after a
  release and the verify link.
- **Chains and issuers**: `evm-tx` / `xrpl-tx` witness that a receipt existed
  at a time, independently of the issuer's own explorer.
- **AI products**: `ai-output` gives them a third-party record that a
  prompt/output pair existed at a time, without disclosing either.

## Objections, answered with facts only

- "Is this proof my content is real?" — No. It is a record that you submitted
  this digest at this time. See the constitution's exact wording.
- "Can you delete an entry if I ask?" — No. Append-only by design; there is no
  code path for it.
- "Who holds the money?" — Nobody in this system. The facilitator settles to
  UnyKorn LLC; the gateway never holds funds.
- "How do I know you didn't fake it?" — You don't have to know. Verify the
  entry: signature, chain links, inclusion proof against the anchor.
- "Is it compliant with X?" — That is outside what this system records.

## Cadence

Demonstrations, not announcements. One real witnessed observation per post.
No post without a verify URL that the agent has itself just checked with
`truth_verify` and found `event_verdict.ok == true`.
