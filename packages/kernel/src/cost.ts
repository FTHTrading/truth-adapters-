import { HEX64 } from "./canonical.ts";

/**
 * SPECIFICATION.md Invariant 2: no commitment without cost.
 *
 * The frozen substrate accepts any `stake > 0` number. Here the stake is a
 * settled payment: an amount in atomic units (string, never float — ANVIL
 * Part III "no float on money"), a settlement reference, and the id of the
 * ledger EVENT that witnessed the settlement. A claim is only as real as the
 * cost that was actually observed. See ADR-0004.
 */
export interface CostProof {
  rail: string; // e.g. "x402:exact:base-sepolia", "apostle:atp"
  asset: string; // e.g. USDC contract address, "ATP"
  amount: string; // integer string in atomic units
  payer: string;
  reference: string; // tx hash / settlement id
  witnessed_event_id: string; // EVENT id in this ledger that recorded the settlement
}

export interface CostVerdict {
  ok: boolean;
  reason?: string;
}

export function requireCost(proof: CostProof | undefined | null): CostVerdict {
  if (!proof) return { ok: false, reason: "no cost proof" };
  if (typeof proof.amount !== "string" || !/^-?\d+$/.test(proof.amount)) return { ok: false, reason: "amount must be an integer string" };
  const amount = BigInt(proof.amount);
  if (amount <= 0n) return { ok: false, reason: "stake must be > 0" };
  if (typeof proof.reference !== "string" || proof.reference.length === 0) return { ok: false, reason: "missing settlement reference" };
  if (typeof proof.witnessed_event_id !== "string" || !HEX64.test(proof.witnessed_event_id)) return { ok: false, reason: "cost not witnessed" };
  if (typeof proof.payer !== "string" || proof.payer.length === 0) return { ok: false, reason: "missing payer" };
  return { ok: true };
}
