import { isObject, normHash, optionalString, type AdapterSpec } from "./types.ts";

/**
 * Direct, read-only observation of an EVM transaction receipt via JSON-RPC.
 * Fields are recorded as the node returned them (status stays "0x1"/"0x0";
 * the adapter does not translate it into "success"). chain=READ only.
 */
export const DEFAULT_RPC: Record<number, string> = {
  1: "https://cloudflare-eth.com",
  137: "https://polygon-rpc.com",
  8453: "https://mainnet.base.org",
  84532: "https://sepolia.base.org",
};

interface Receipt {
  transactionHash: string;
  blockNumber: string;
  blockHash: string;
  from: string;
  to: string | null;
  status?: string;
  gasUsed: string;
  contractAddress?: string | null;
  logs: unknown[];
  transactionIndex: string;
}

async function sha256Text(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}

export const evmTx: AdapterSpec = {
  name: "evm-tx",
  version: "1.0.0",
  observation: "direct",
  runtime: "any",
  description: "Reads a transaction receipt from an EVM JSON-RPC node and records it as returned (block, from, to, raw status, gas, logs digest).",
  price: { atomic: "5000" },
  inputExample: { chain_id: 8453, tx_hash: "0x" + "0".repeat(64) },
  async translate(input, ctx) {
    if (!isObject(input)) return null;
    const chain_id = typeof input.chain_id === "number" && Number.isInteger(input.chain_id) ? input.chain_id : undefined;
    const hash = normHash(input.tx_hash);
    if (!chain_id || !hash) return null;
    const rpc = optionalString(input.rpc_url, 512) ?? DEFAULT_RPC[chain_id];
    if (!rpc || !/^https:\/\//.test(rpc)) return null;

    const observed_at = ctx.clock();
    const res = await ctx.fetch(rpc, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getTransactionReceipt", params: ["0x" + hash] }),
    });
    if (!res.ok) throw new Error(`rpc ${res.status}`);
    const json = (await res.json()) as { result?: Receipt | null; error?: { message?: string } };
    if (json.error) throw new Error(`rpc error: ${json.error.message ?? "unknown"}`);
    const r = json.result;
    if (!r) return null;
    return {
      kind: "evm_tx",
      chain_id,
      tx_hash: "0x" + hash,
      block_number: BigInt(r.blockNumber).toString(),
      block_hash: r.blockHash,
      transaction_index: BigInt(r.transactionIndex).toString(),
      from: r.from,
      to: r.to ?? null,
      contract_address: r.contractAddress ?? null,
      status_raw: r.status ?? null,
      gas_used: BigInt(r.gasUsed).toString(),
      logs_count: Array.isArray(r.logs) ? r.logs.length : 0,
      logs_sha256: await sha256Text(JSON.stringify(r.logs ?? [])),
      rpc_host: new URL(rpc).host,
      observed_at,
    };
  },
};
