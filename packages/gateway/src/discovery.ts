/**
 * Discovery documents. Each one discloses the same labels as the manifest;
 * none may imply LIVE while the gateway is in test or dry-run mode.
 */
import type { AdapterSpec } from "../../adapters/src/types.ts";
import { formatAtomic, labelsOf, LIMITATIONS, type GatewayConfig } from "./config.ts";

export function statusJson(cfg: GatewayConfig, head: { seq: number; hash: string } | null, kernelVersion: string): unknown {
  const labels = labelsOf(cfg);
  return {
    schema: "truth-status-v1",
    labels,
    paid_routes: cfg.disabledReason ? { enabled: false, reason: cfg.disabledReason } : { enabled: true },
    rails: [...(cfg.x402 ? [`x402:exact:${cfg.x402.network.network}`] : []), ...(cfg.apostle ? ["apostle:atp"] : [])],
    ledger_head: head,
    kernel: kernelVersion,
    limitations: LIMITATIONS,
    generated_at: Date.now(),
  };
}

export function pricingJson(cfg: GatewayConfig, adapters: Readonly<Record<string, AdapterSpec>>): unknown {
  return {
    schema: "truth-pricing-v1",
    label: labelsOf(cfg).mode === "live" ? "EARLY_ACCESS_PRICING" : "TEST_PRICING",
    note: "Prices are per observation, charged only on settlement. Test-mode prices settle on a testnet and carry no value.",
    asset: cfg.x402 ? { contract: cfg.x402.network.asset, network: cfg.x402.network.network, decimals: cfg.x402.network.decimals } : null,
    items: Object.values(adapters).map((a) => ({
      adapter: a.name,
      observation: a.observation,
      atomic: a.price.atomic,
      display: cfg.x402 ? formatAtomic(a.price.atomic, cfg.x402.network.decimals) : null,
    })),
    apostle: cfg.apostle ? { asset: "ATP", amount_raw: cfg.apostle.priceAtpRaw, decimals: 18 } : null,
  };
}

export function wellKnownX402(cfg: GatewayConfig, origin: string, adapters: Readonly<Record<string, AdapterSpec>>): unknown {
  const labels = labelsOf(cfg);
  return {
    x402Version: 1,
    mode: labels.mode === "live" ? "LIVE" : "DRY_RUN",
    disclosure:
      labels.mode === "live"
        ? "Payments settle on mainnet to the pay-to address below."
        : "Payments settle on a test network only. Nothing here carries value. Do not treat a test-mode receipt as a paid record.",
    accepts: cfg.x402
      ? [{ scheme: "exact", network: cfg.x402.network.network, asset: cfg.x402.network.asset, payTo: cfg.x402.payTo, facilitator: cfg.x402.facilitatorUrl }]
      : [],
    resources: Object.values(adapters).map((a) => ({ resource: `${origin}/witness/${a.name}`, maxAmountRequired: a.price.atomic, description: a.description })),
    limitations: LIMITATIONS,
  };
}

export function openapiJson(origin: string, adapters: Readonly<Record<string, AdapterSpec>>, labels: unknown): unknown {
  const witnessPaths: Record<string, unknown> = {};
  for (const a of Object.values(adapters)) {
    witnessPaths[`/witness/${a.name}`] = {
      post: {
        summary: a.description,
        description: `observation=${a.observation}. ${LIMITATIONS}`,
        requestBody: { required: true, content: { "application/json": { example: a.inputExample } } },
        responses: {
          "200": { description: "truth-attestation-v1 (see docs/schema)" },
          "402": { description: "x402 payment required: { x402Version, accepts[], alt_rails[] }" },
          "400": { description: "body not observable before payment; nothing written" },
          "503": { description: "paid routes disabled (PENDING_CONFIGURATION)" },
        },
      },
    };
  }
  return {
    openapi: "3.1.0",
    info: { title: "truth gateway", version: "0.1.0", description: `Labels: ${JSON.stringify(labels)}. ${LIMITATIONS}` },
    servers: [{ url: origin }],
    paths: {
      "/.well-known/truth.json": { get: { summary: "Manifest" } },
      "/status.json": { get: { summary: "Labels and rails" } },
      "/pricing.json": { get: { summary: "Per-observation prices with TEST/EARLY_ACCESS label" } },
      "/health": { get: { summary: "Head of ledger" } },
      "/anchor": { get: { summary: "Latest internal merkle anchor (UNANCHORED externally)" } },
      "/entries": { get: { summary: "Chain segment", parameters: [{ name: "from", in: "query" }, { name: "limit", in: "query" }] } },
      "/entries/{seq}": { get: { summary: "One entry" } },
      "/verify/{hash}": { get: { summary: "Entry, structural verdict, signature verdict, chain links, inclusion proof, referenced_by" } },
      ...witnessPaths,
    },
  };
}

export function llmsTxt(origin: string, adapters: Readonly<Record<string, AdapterSpec>>, labels: { mode: string; status: string; anchoring: string; review: string }): string {
  return [
    "# truth gateway",
    "",
    `> Records what happened, who paid, and when. Signed, hash-chained, append-only, tamper-evident. Labels: mode=${labels.mode} status=${labels.status} anchoring=${labels.anchoring} review=${labels.review}.`,
    "",
    "It does not judge intent, interpret meaning, decide fairness, resolve disputes, explain outcomes, grant exceptions, edit or delete history, or hold funds.",
    "",
    "## How to use",
    `- Read ${origin}/.well-known/truth.json for adapters, prices, rails and the witness public key.`,
    `- POST JSON to ${origin}/witness/{adapter}. Expect 402 with x402 requirements; pay; retry with X-PAYMENT.`,
    `- Verify any entry at ${origin}/verify/{entry_hash}. No trust in the operator is required.`,
    "",
    "## Adapters",
    ...Object.values(adapters).map((a) => `- ${a.name} (${a.observation}): ${a.description}`),
    "",
    "## Limitations",
    LIMITATIONS,
    "",
    `Schemas: ${origin}/openapi.json · status: ${origin}/status.json · pricing: ${origin}/pricing.json`,
  ].join("\n");
}

export function securityTxt(contact: string, origin: string): string {
  const expires = new Date(Date.now() + 180 * 24 * 3600 * 1000).toISOString();
  return [`Contact: ${contact}`, `Expires: ${expires}`, `Canonical: ${origin}/.well-known/security.txt`, "Preferred-Languages: en", "Policy: https://github.com/FTHTrading/truth-adapters/blob/main/SECURITY.md"].join("\n") + "\n";
}
