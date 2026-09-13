# Threat model (STRIDE, per ANVIL Part II)

Trust boundaries: (A) agent ↔ gateway over HTTPS; (B) gateway ↔ facilitator;
(C) gateway ↔ upstream observed systems (URLs, RPC nodes); (D) gateway ↔ D1;
(E) operator console ↔ D1 and secrets; (F) verifier ↔ published ledger.

| Threat | Boundary | Mitigation | State |
|---|---|---|---|
| **Spoofing** a witness (forged `witness`/`pub`) | F | Ed25519 signature over the event id; verifier recomputes id and checks signature; manifest publishes the key | tested |
| Spoofing a payment (`X-PAYMENT` for someone else's address) | A | pay-to, amount, network checked before facilitator; facilitator verifies the EIP-3009 signature | local checks tested; facilitator live-untested |
| **Tampering** with history (edit/delete/reorder) | D, E, F | prev-hash chain; D1 triggers abort updates/deletes; verifier stops at first defect | chain tested; triggers not applied yet |
| Tampering by transplanting a valid entry from another ledger | F | entry hash commits to seq+prev; mismatch detected | tested |
| **Repudiation** of a payment | A, B | cost event records facilitator settle response, reference, payer, time; finalization references it | tested with mock |
| **Information disclosure** of prompts/documents | A | submitted adapters accept digests only; direct adapters record what a public URL served | by construction |
| Disclosure of the witness key | E | secret store only; keygen refuses to overwrite; never logged | tested (keygen), review needed |
| SSRF via `http-served` / custom `rpc_url` | C | host blocklist; https-only RPC; Workers cannot reach private ranges | tested |
| **Denial of service**: free writes | A | unpaid paths never write; 64 KiB body cap | tested |
| DoS: free reads | A | none yet; Cloudflare rate limiting before PUBLIC | open |
| DoS: large upstream bodies | C | 8 MiB cap; declares `body_hashed:false` above it | tested |
| **Elevation of privilege**: "admin override", rollback, retroactive edit | all | no such code path exists; USAGE.md forbids adding one; adapter opinion keys refused | by construction, tested |
| Fork of the chain by concurrent writers (HEARTH L-05) | D | in-process append queue; D1 `seq` primary key + retry | queue tested; D1 path typechecked only |
| Operator deletes the whole ledger | D, E | detectable only if an external anchor exists | open (`UNANCHORED`) |

Residual risk accepted for `LOCAL_VERIFIED`: everything marked open or
live-untested. None of it is acceptable for `LIVE_LIMITED`.
