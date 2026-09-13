import type { Clock } from "./clock.ts";
import { systemClock } from "./clock.ts";
import type { CostProof } from "./cost.ts";
import { requireCost } from "./cost.ts";
import type { Event } from "./event.ts";
import type { Entry, Ledger } from "./ledger.ts";
import type { Witness } from "./witness.ts";

/**
 * The submission flow of the frozen substrate (src/api/submit.ts), bound to a
 * chained ledger and a witnessed cost proof. Same four outcomes:
 *
 *   REFUSED    witness returned null            → recorded
 *   OBSERVED   event recorded, no commitment    → recorded
 *   REJECTED   commitment without valid cost    → event + rejection recorded
 *   FINALIZED  event + cost                     → event + finalization recorded
 */
export type Outcome = "REFUSED" | "OBSERVED" | "REJECTED" | "FINALIZED";

export interface Attestation {
  outcome: Outcome;
  witness: string;
  event?: Event;
  entry?: Entry;
  finalization?: Entry;
  rejection?: Entry;
  refusal?: Entry;
  reason?: string;
}

export interface SubmitOptions {
  clock?: Clock;
}

export async function submit(
  ledger: Ledger,
  witness: Witness,
  input: unknown,
  cost?: CostProof,
  opts: SubmitOptions = {},
): Promise<Attestation> {
  const clock = opts.clock ?? systemClock;
  const event = await witness.observe(input);

  if (!event) {
    const refusal = await ledger.append({ kind: "REFUSED", ts: clock(), witness: witness.id, reason: "No observable event" });
    return { outcome: "REFUSED", witness: witness.id, refusal, reason: "No observable event" };
  }

  const entry = await ledger.append({ kind: "EVENT", event });

  if (cost === undefined) return { outcome: "OBSERVED", witness: witness.id, event, entry };

  const verdict = requireCost(cost);
  if (!verdict.ok) {
    const rejection = await ledger.append({ kind: "REJECTED", ts: clock(), reference: event.id, reason: `Insufficient cost: ${verdict.reason}` });
    return { outcome: "REJECTED", witness: witness.id, event, entry, rejection, reason: verdict.reason };
  }
  if (!(await ledger.hasEvent(cost.witnessed_event_id))) {
    const rejection = await ledger.append({ kind: "REJECTED", ts: clock(), reference: event.id, reason: "Insufficient cost: cost event not in this ledger" });
    return { outcome: "REJECTED", witness: witness.id, event, entry, rejection, reason: "cost event not in this ledger" };
  }
  if (event.type === "FAILED") {
    const rejection = await ledger.append({ kind: "REJECTED", ts: clock(), reference: event.id, reason: "Observation failed; nothing to finalize" });
    return { outcome: "REJECTED", witness: witness.id, event, entry, rejection, reason: "observation failed" };
  }

  const finalization = await ledger.append({ kind: "FINALIZED", ts: clock(), claimant: cost.payer, reference: event.id, cost });
  return { outcome: "FINALIZED", witness: witness.id, event, entry, finalization };
}
