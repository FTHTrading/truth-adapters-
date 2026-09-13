import { isObject, normHash, type AdapterSpec } from "./types.ts";

/**
 * Direct, read-only observation of an XRPL transaction via the public JSON-RPC
 * `tx` method. The engine result code is recorded raw (e.g. "tesSUCCESS");
 * the adapter does not decide what it means.
 */
export const XRPL_RPC: Record<string, string> = {
  mainnet: "https://xrplcluster.com/",
  testnet: "https://s.altnet.rippletest.net:51234/",
};

async function sha256Text(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}

interface TxResult {
  status?: string;
  error?: string;
  hash?: string;
  ledger_index?: number;
  validated?: boolean;
  TransactionType?: string;
  Account?: string;
  Destination?: string;
  Fee?: string;
  Sequence?: number;
  meta?: { TransactionResult?: string; delivered_amount?: unknown };
}

export const xrplTx: AdapterSpec = {
  name: "xrpl-tx",
  version: "1.0.0",
  observation: "direct",
  runtime: "any",
  description: "Reads a validated XRPL transaction by hash and records ledger index, type, accounts, fee and the raw engine result.",
  price: { atomic: "5000" },
  inputExample: { tx_hash: "0".repeat(64), network: "mainnet" },
  async translate(input, ctx) {
    if (!isObject(input)) return null;
    const hash = normHash(input.tx_hash);
    if (!hash) return null;
    const network = input.network === "testnet" ? "testnet" : "mainnet";
    const rpc = XRPL_RPC[network]!;
    const observed_at = ctx.clock();
    const res = await ctx.fetch(rpc, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ method: "tx", params: [{ transaction: hash.toUpperCase(), binary: false }] }),
    });
    if (!res.ok) throw new Error(`rpc ${res.status}`);
    const json = (await res.json()) as { result?: TxResult };
    const r = json.result;
    if (!r || r.status === "error" || r.error) return null;
    return {
      kind: "xrpl_tx",
      network,
      hash: (r.hash ?? hash).toUpperCase(),
      ledger_index: r.ledger_index ?? null,
      validated: r.validated ?? null,
      transaction_type: r.TransactionType ?? null,
      account: r.Account ?? null,
      destination: r.Destination ?? null,
      fee_drops: r.Fee ?? null,
      sequence: r.Sequence ?? null,
      engine_result_raw: r.meta?.TransactionResult ?? null,
      delivered_amount_raw: r.meta?.delivered_amount ?? null,
      meta_sha256: await sha256Text(JSON.stringify(r.meta ?? null)),
      rpc_host: new URL(rpc).host,
      observed_at,
    };
  },
};
