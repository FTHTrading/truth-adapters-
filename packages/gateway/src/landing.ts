/**
 * The genesis402.com landing page, served by the gateway at `/` for browsers.
 * Copy is drawn from ADR-0002 approved phrases only and is scanned by the
 * claims gate on every test run and on every verify-served pass.
 */
import type { AdapterSpec } from "../../adapters/src/types.ts";
import { formatAtomic, LIMITATIONS, type GatewayConfig, type Labels } from "./config.ts";

const PERIMETER =
  "UnyKorn LLC is a technology and administration service provider. It is not a bank, broker-dealer, exchange, custodian, trustee, transfer agent, appraiser, auditor, investment adviser, money transmitter, or issuer.";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function landingHtml(origin: string, cfg: GatewayConfig, labels: Labels, adapters: Readonly<Record<string, AdapterSpec>>, publicKeyHex: string, head: { seq: number; hash: string } | null): string {
  const decimals = cfg.x402?.network.decimals ?? 6;
  const rows = Object.values(adapters)
    .map(
      (a) => `<tr><td><code>${esc(a.name)}</code></td><td>${esc(a.observation)}</td><td>${esc(a.description)}</td><td class="num">${esc(formatAtomic(a.price.atomic, decimals))}</td></tr>`,
    )
    .join("\n");
  const rail = cfg.x402 ? `${esc(cfg.x402.network.network)} · USDC · pay-to <code>${esc(cfg.x402.payTo)}</code>` : "no rail configured";
  const modeLine =
    labels.mode === "live"
      ? "Payments settle on Base mainnet."
      : "Payments settle on Base Sepolia, a test network. Test-mode records carry no value. Mainnet is not enabled yet and this page will say so when it is.";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Genesis402 — the truth gateway</title>
<meta name="description" content="A cryptographically witnessed, append-only ledger that records what happened, who paid, and when. Pay per observation over x402. Verify anything without trusting the operator.">
<style>
:root{color-scheme:light dark;--fg:#111;--bg:#fbfbf8;--mut:#5a5f6a;--line:#d8dad3;--acc:#0b5d4b;--code:#eef0ea}
@media(prefers-color-scheme:dark){:root{--fg:#e9e9e4;--bg:#0f1110;--mut:#a3a8ad;--line:#2a2f2c;--acc:#7fd6bd;--code:#181c1a}}
*{box-sizing:border-box}body{margin:0;font:16px/1.55 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:var(--fg);background:var(--bg)}
main{max-width:56rem;margin:0 auto;padding:2.5rem 1.25rem 4rem}h1{font-size:2rem;line-height:1.15;margin:0 0 .5rem}h2{font-size:1.2rem;margin:2.2rem 0 .6rem}
p{margin:.5rem 0}code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.92em;background:var(--code);padding:.05em .3em;border-radius:3px}
pre{background:var(--code);padding:.8rem 1rem;overflow-x:auto;border-radius:6px;font-size:.88em}
table{border-collapse:collapse;width:100%;font-size:.95em}th,td{text-align:left;padding:.45rem .5rem;border-bottom:1px solid var(--line);vertical-align:top}th{font-weight:600}.num{text-align:right;white-space:nowrap}
.labels{display:flex;flex-wrap:wrap;gap:.4rem;margin:.8rem 0}.labels span{border:1px solid var(--line);border-radius:999px;padding:.15rem .6rem;font-size:.82em;color:var(--mut)}
.mut{color:var(--mut)}ul{padding-left:1.2rem}a{color:var(--acc)}footer{margin-top:3rem;border-top:1px solid var(--line);padding-top:1rem;font-size:.88em;color:var(--mut)}
.wrap{overflow-x:auto}
</style>
</head>
<body>
<main>
<p class="mut">Genesis402 · operated by UnyKorn LLC (Wyoming)</p>
<h1>A ledger that records what happened, who paid, and when.</h1>
<p>Cryptographically witnessed. Signed and hash-chained. Append-only and tamper-evident. Independently verifiable by anyone, without trusting the operator. No account, no API key: pay per observation over x402.</p>
<div class="labels">
<span>mode: ${esc(labels.mode)}</span><span>status: ${esc(labels.status)}</span><span>anchoring: ${esc(labels.anchoring)}</span><span>review: ${esc(labels.review)}</span>
</div>
<p class="mut">${esc(modeLine)}</p>

<h2>What it does not do</h2>
<p>It does not judge intent, interpret meaning, decide fairness, resolve disputes, explain outcomes, grant exceptions, edit or delete history, or hold or move client funds. Every adapter is translation-only: it maps a domain to an observation and adds no rules. A payload containing an opinion is refused, even when paid for.</p>

<h2>What you can have witnessed</h2>
<div class="wrap"><table>
<thead><tr><th>adapter</th><th>observation</th><th>what is recorded</th><th class="num">price (USDC)</th></tr></thead>
<tbody>
${rows}
</tbody></table></div>
<p class="mut"><em>direct</em> means the gateway fetched or read the thing itself. <em>submitted</em> means the submission is the fact and its content is the submitter's claim.</p>

<h2>How an agent uses it</h2>
<pre>GET  ${esc(origin)}/.well-known/truth.json        # adapters, prices, rail, witness public key
POST ${esc(origin)}/witness/document                # → 402 with x402 requirements
POST ${esc(origin)}/witness/document  X-PAYMENT: …  # → signed attestation + entry hash
GET  ${esc(origin)}/verify/&lt;entry_hash&gt;             # chain links, signature, inclusion proof</pre>
<p>Rail: ${rail}. Payments settle through a third-party facilitator to UnyKorn LLC; the gateway never holds funds.</p>

<h2>Verify it yourself</h2>
<ul>
<li>Witness public key (Ed25519): <code>${esc(publicKeyHex)}</code></li>
<li>Ledger head: ${head ? `seq ${head.seq}, <code>${esc(head.hash)}</code>` : "empty"}</li>
<li>Records: <a href="${esc(origin)}/entries?from=0&amp;limit=50">${esc(origin)}/entries</a> · Anchor: <a href="${esc(origin)}/anchor">${esc(origin)}/anchor</a></li>
<li>Schemas: <a href="${esc(origin)}/schema/truth-record-v1.schema.json">truth-record-v1</a> · <a href="${esc(origin)}/schema/truth-attestation-v1.schema.json">truth-attestation-v1</a></li>
<li>Machine discovery: <a href="${esc(origin)}/.well-known/x402">/.well-known/x402</a> · <a href="${esc(origin)}/.well-known/agent.json">/.well-known/agent.json</a> · <a href="${esc(origin)}/openapi.json">/openapi.json</a> · <a href="${esc(origin)}/status.json">/status.json</a> · <a href="${esc(origin)}/pricing.json">/pricing.json</a></li>
<li>Source: <a href="https://github.com/FTHTrading/truth-adapters-">github.com/FTHTrading/truth-adapters-</a>, built on the truth substrate at <a href="https://github.com/kevanbtc/truth">github.com/kevanbtc/truth</a>.</li>
</ul>

<h2>Limitations</h2>
<p>${esc(LIMITATIONS)}</p>
<p>${esc(PERIMETER)}</p>

<footer>
<p>Labels on this page are literal. <code>test</code> never means live. <code>UNANCHORED</code> never means immutable. <code>LOCAL_VERIFIED</code> means our own tests, not an independent review.</p>
</footer>
</main>
</body>
</html>
`;
}

export function agentCard(origin: string, cfg: GatewayConfig, labels: Labels, adapters: Readonly<Record<string, AdapterSpec>>, publicKeyHex: string): unknown {
  const decimals = cfg.x402?.network.decimals ?? 6;
  return {
    schemaVersion: "truth-agent-card-1",
    name: "Genesis402 truth gateway",
    operator: "UnyKorn LLC (Wyoming)",
    description: "A cryptographically witnessed, append-only ledger that records what happened, who paid, and when. Pay per observation over x402. Independently verifiable by anyone, without trusting the operator.",
    url: origin,
    labels,
    paymentProtocols: ["x402"],
    discovery: {
      manifest: `${origin}/.well-known/truth.json`,
      x402: `${origin}/.well-known/x402`,
      openapi: `${origin}/openapi.json`,
      status: `${origin}/status.json`,
      pricing: `${origin}/pricing.json`,
      security: `${origin}/.well-known/security.txt`,
      schemas: [`${origin}/schema/truth-record-v1.schema.json`, `${origin}/schema/truth-attestation-v1.schema.json`],
      source: "https://github.com/FTHTrading/truth-adapters-",
    },
    witness_public_key: publicKeyHex,
    tools: Object.values(adapters).map((a) => ({
      id: a.name,
      kind: "x402-paid-http",
      method: "POST",
      url: `${origin}/witness/${a.name}`,
      observation: a.observation,
      price: cfg.x402 ? { atomic: a.price.atomic, display: formatAtomic(a.price.atomic, decimals), asset: cfg.x402.network.asset, network: cfg.x402.network.network } : { atomic: a.price.atomic },
      input_example: a.inputExample,
      output: "truth-attestation-v1: outcome, signed event, entry hash, finalization, cost, verify URL",
    })),
    verify: `${origin}/verify/{entry_hash}`,
    does_not: ["judge intent", "interpret meaning", "decide fairness", "resolve disputes", "explain outcomes", "grant exceptions", "edit or delete history", "hold or move client funds"],
    limitations: [LIMITATIONS, PERIMETER],
  };
}

export { PERIMETER };
