import type { Clock } from "./clock.ts";
import { systemClock } from "./clock.ts";
import type { Ledger } from "./ledger.ts";

/** SPECIFICATION.md § State / § State Transition Rules — table ported verbatim. */
export type State = "INIT" | "OBSERVED" | "CLAIMED" | "VALIDATED" | "FINALIZED" | "REJECTED";

export interface Transition {
  from: State;
  to: State;
  witness_required: boolean;
  min_stake: bigint;
}

export const VALID_TRANSITIONS: readonly Transition[] = [
  { from: "INIT", to: "OBSERVED", witness_required: true, min_stake: 0n },
  { from: "OBSERVED", to: "CLAIMED", witness_required: false, min_stake: 1n },
  { from: "CLAIMED", to: "VALIDATED", witness_required: true, min_stake: 1n },
  { from: "VALIDATED", to: "FINALIZED", witness_required: false, min_stake: 1n },
];

export function canTransition(from: State, to: State, hasWitness: boolean, stake: bigint): boolean {
  const t = VALID_TRANSITIONS.find((x) => x.from === from && x.to === to);
  if (!t) return false;
  if (t.witness_required && !hasWitness) return false;
  if (stake < t.min_stake) return false;
  return true;
}

interface MachineRecord {
  id: string;
  state: State;
  previous_state?: State;
  transition_time: number;
  witness_id?: string;
  stake: bigint;
}

/** Machines write every init/transition/rejection to the ledger, as the frozen substrate does. */
export class StateMachines {
  private machines = new Map<string, MachineRecord>();
  private ledger: Ledger;
  private clock: Clock;

  constructor(ledger: Ledger, clock: Clock = systemClock) {
    this.ledger = ledger;
    this.clock = clock;
  }

  async init(id: string): Promise<void> {
    this.machines.set(id, { id, state: "INIT", transition_time: this.clock(), stake: 0n });
    await this.ledger.append({ kind: "MACHINE", machine_id: id, state: "INIT", action: "INITIALIZED", ts: this.clock() });
  }

  async transition(id: string, to: State, witnessId?: string, stake: bigint = 0n): Promise<boolean> {
    const m = this.machines.get(id);
    if (!m) {
      await this.ledger.append({ kind: "MACHINE", machine_id: id, result: "TRANSITION_REJECTED", reason: "Machine not found", ts: this.clock() });
      return false;
    }
    const hasWitness = !!witnessId;
    if (!canTransition(m.state, to, hasWitness, stake)) {
      await this.ledger.append({
        kind: "MACHINE",
        machine_id: id,
        from_state: m.state,
        to_state: to,
        witness_id: witnessId ?? null,
        stake: stake.toString(),
        result: "TRANSITION_REJECTED",
        reason: "Invalid transition or insufficient requirements",
        ts: this.clock(),
      });
      return false;
    }
    const previous = m.state;
    m.previous_state = previous;
    m.state = to;
    m.transition_time = this.clock();
    m.witness_id = witnessId;
    m.stake = stake;
    await this.ledger.append({
      kind: "MACHINE",
      machine_id: id,
      from_state: previous,
      to_state: to,
      witness_id: witnessId ?? null,
      stake: stake.toString(),
      result: "TRANSITION_ACCEPTED",
      ts: m.transition_time,
    });
    return true;
  }

  state(id: string): State | null {
    return this.machines.get(id)?.state ?? null;
  }
}
