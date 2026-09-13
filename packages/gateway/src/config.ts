/**
 * Gateway configuration. Every value comes from the environment (Twelve-Factor).
 * Nothing here is a secret; the witness private key is read separately by
 * index.ts from the WITNESS_PRIVATE_KEY_JWK secret.
 *
 * Fail-safe default: if the pay-to address is missing or the zero address the
 * gateway refuses to serve paid routes rather than collect payments into
 * nowhere (founder flag F-3 in .forge/founder-flags.md).
 */
export interface X402Network {
  network: string; // x402 network id
  chainId: number;
  asset: string; // USDC contract
  assetName: string; // EIP-712 domain name (UNVERIFIED against live contracts until Phase 6; see ADR-0004)
  assetVersion: string; // EIP-712 domain version
  decimals: number;
}

export const X402_NETWORKS: Readonly<Record<string, X402Network>> = Object.freeze({
  "base-sepolia": {
    network: "base-sepolia",
    chainId: 84532,
    asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    assetName: "USDC",
    assetVersion: "2",
    decimals: 6,
  },
  base: {
    network: "base",
    chainId: 8453,
    asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    assetName: "USD Coin",
    assetVersion: "2",
    decimals: 6,
  },
});

export interface X402Config {
  network: X402Network;
  facilitatorUrl: string;
  payTo: string;
  maxTimeoutSeconds: number;
}

export interface ApostleConfig {
  facilitatorUrl: string;
  priceAtpRaw: string; // str_u128, 18 decimals
}

export interface GatewayConfig {
  serviceName: string;
  entity: string;
  x402: X402Config | null;
  apostle: ApostleConfig | null;
  /** Human-readable reason paid routes are disabled, when they are. */
  disabledReason: string | null;
  securityContact: string | null;
}

export interface EnvLike {
  SERVICE_NAME?: string;
  X402_NETWORK?: string;
  X402_FACILITATOR_URL?: string;
  X402_PAY_TO?: string;
  X402_MAX_TIMEOUT_SECONDS?: string;
  APOSTLE_FACILITATOR_URL?: string;
  APOSTLE_PRICE_ATP_RAW?: string;
  /** mailto: or https: contact for /.well-known/security.txt; route is 404 when unset. */
  SECURITY_CONTACT?: string;
}

const ZERO = "0x0000000000000000000000000000000000000000";

export function configFromEnv(env: EnvLike): GatewayConfig {
  const problems: string[] = [];
  let x402: X402Config | null = null;
  const net = X402_NETWORKS[env.X402_NETWORK ?? ""];
  if (!net) problems.push(`X402_NETWORK must be one of ${Object.keys(X402_NETWORKS).join(", ")}`);
  const payTo = (env.X402_PAY_TO ?? "").trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(payTo) || payTo.toLowerCase() === ZERO) problems.push("X402_PAY_TO must be a real EVM address");
  const facilitatorUrl = (env.X402_FACILITATOR_URL ?? "").replace(/\/$/, "");
  if (!/^https:\/\//.test(facilitatorUrl)) problems.push("X402_FACILITATOR_URL must be https");
  if (net && problems.length === 0) {
    x402 = { network: net, facilitatorUrl, payTo, maxTimeoutSeconds: Number(env.X402_MAX_TIMEOUT_SECONDS ?? "60") || 60 };
  }

  let apostle: ApostleConfig | null = null;
  if (env.APOSTLE_FACILITATOR_URL && env.APOSTLE_PRICE_ATP_RAW && /^\d+$/.test(env.APOSTLE_PRICE_ATP_RAW) && BigInt(env.APOSTLE_PRICE_ATP_RAW) > 0n) {
    apostle = { facilitatorUrl: env.APOSTLE_FACILITATOR_URL.replace(/\/$/, ""), priceAtpRaw: env.APOSTLE_PRICE_ATP_RAW };
  }

  return {
    serviceName: env.SERVICE_NAME ?? "truth-gateway",
    entity: "UnyKorn LLC",
    x402,
    apostle,
    disabledReason: x402 || apostle ? null : `paid routes disabled: ${problems.join("; ") || "no payment rail configured"}`,
    securityContact: env.SECURITY_CONTACT && /^(mailto:|https:\/\/)/.test(env.SECURITY_CONTACT) ? env.SECURITY_CONTACT : null,
  };
}

/**
 * Standing limitation statement. Appears in the manifest, every witness
 * response, and every MCP tool description (ADR-0002, STATUS.md).
 */
export const LIMITATIONS =
  "A record from this system states that a named witness observed the specified input at the stated time and, when FINALIZED, that a stated payer paid a stated amount for that record. " +
  "It does not establish that the observed content is true, authentic, lawful, compliant, owned by anyone, fair, or correct outside its stated scope. " +
  "FINALIZED, OBSERVED, REFUSED and REJECTED describe the substrate's own gate outcomes, not moral, legal or factual judgments.";

export type Mode = "local" | "test" | "live";

/** `live` only on a mainnet rail; everything else is `test`. File ledgers are `local`. */
export function modeOf(cfg: GatewayConfig): Mode {
  if (cfg.x402 && cfg.x402.network.network === "base") return "live";
  return "test";
}

export const ANCHORING_STATUS = "UNANCHORED: merkle anchors are internal ledger records signed by the gateway key; no external timestamp (OTS/TSA/chain) is persisted yet";

/** Mandatory on every attestation and on the manifest (truth-attestation-v1 § labels, STATUS.md). */
export interface Labels {
  mode: Mode;
  status: "DRY_RUN" | "LIVE_LIMITED" | "PENDING_CONFIGURATION" | "NOT_OFFERED";
  anchoring: "UNANCHORED" | "ANCHORED";
  review: "LOCAL_VERIFIED" | "EXTERNALLY_REVIEWED";
}

export function labelsOf(cfg: GatewayConfig): Labels {
  const mode = modeOf(cfg);
  return {
    mode,
    status: cfg.disabledReason ? "PENDING_CONFIGURATION" : mode === "live" ? "LIVE_LIMITED" : "DRY_RUN",
    anchoring: "UNANCHORED",
    review: "LOCAL_VERIFIED",
  };
}

/** "1000" atomic with 6 decimals → "0.001000". Display only; never used for arithmetic. */
export function formatAtomic(atomic: string, decimals: number): string {
  const s = atomic.padStart(decimals + 1, "0");
  return `${s.slice(0, s.length - decimals)}.${s.slice(s.length - decimals)}`;
}
