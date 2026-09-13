/**
 * truth MCP server (stdio). Five tools, nothing else. An agent wired to this
 * server can buy witnessed observations, verify them, and observe locally.
 * It cannot edit history, cannot bypass payment, and cannot make the
 * substrate say anything is "true", "valid" or "compliant".
 *
 * Env: TRUTH_GATEWAY_URL, X402_PAYER_PRIVATE_KEY, X402_MAX_ATOMIC, TRUTH_WITNESS_JWK
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { NODE_ADAPTERS } from "../../adapters/src/registry-node.ts";
import { findForbiddenKeys } from "../../adapters/src/forbidden.ts";
import { createWitness, generateKeys, importKeysJwk, submit, type WitnessKeys } from "../../kernel/src/index.ts";
import { FileLedger } from "../../kernel/src/ledger-file.ts";
import { verifyEntries } from "../../verify/src/cli.ts";
import { LIMITATIONS } from "../../gateway/src/config.ts";
import { payAndPost, type PayOptions } from "./x402-client.ts";

const DEFAULT_GATEWAY = process.env.TRUTH_GATEWAY_URL ?? "http://127.0.0.1:8787";
const LIMITS = " LIMITATIONS: " + LIMITATIONS;

function payOptions(): PayOptions | null {
  const pk = process.env.X402_PAYER_PRIVATE_KEY;
  if (!pk || !/^0x[0-9a-fA-F]{64}$/.test(pk)) return null;
  const max = process.env.X402_MAX_ATOMIC && /^\d+$/.test(process.env.X402_MAX_ATOMIC) ? BigInt(process.env.X402_MAX_ATOMIC) : 100_000n;
  return { privateKey: pk as `0x${string}`, maxAtomic: max };
}

let localKeys: Promise<{ keys: WitnessKeys; ephemeral: boolean }> | null = null;
function getLocalKeys() {
  if (!localKeys) {
    localKeys = (async () => {
      const jwk = process.env.TRUTH_WITNESS_JWK;
      if (jwk) return { keys: await importKeysJwk(JSON.parse(jwk) as JsonWebKey), ephemeral: false };
      return { keys: await generateKeys(), ephemeral: true };
    })();
  }
  return localKeys;
}

const text = (v: unknown) => ({ content: [{ type: "text" as const, text: typeof v === "string" ? v : JSON.stringify(v, null, 2) }] });

const server = new McpServer({ name: "truth", version: "0.1.0" });

server.registerTool(
  "truth_manifest",
  {
    description: "Read a truth gateway's manifest: adapters, prices, payment rails, witness public key, and the list of things the system does not do." + LIMITS,
    inputSchema: { gateway_url: z.string().url().optional() },
  },
  async ({ gateway_url }) => {
    const res = await fetch(`${(gateway_url ?? DEFAULT_GATEWAY).replace(/\/$/, "")}/.well-known/truth.json`);
    return text(await res.json());
  },
);

server.registerTool(
  "truth_witness_paid",
  {
    description:
      "Submit input to a gateway adapter and pay for the observation over x402 (USDC). Returns the signed attestation and its verify URL. Refuses if no payer key is configured or the price exceeds X402_MAX_ATOMIC. The result records what happened; it never says whether it was good, valid or compliant." + LIMITS,
    inputSchema: { adapter: z.string().regex(/^[a-z0-9-]+$/), input: z.record(z.unknown()), gateway_url: z.string().url().optional() },
  },
  async ({ adapter, input, gateway_url }) => {
    const url = `${(gateway_url ?? DEFAULT_GATEWAY).replace(/\/$/, "")}/witness/${adapter}`;
    const result = await payAndPost(url, input, payOptions());
    return text(result);
  },
);

server.registerTool(
  "truth_verify",
  {
    description: "Verify a ledger entry on a gateway by its hash: chain links, event signature, and the merkle inclusion proof against the latest anchor." + LIMITS,
    inputSchema: { entry_hash: z.string().regex(/^[0-9a-f]{64}$/), gateway_url: z.string().url().optional() },
  },
  async ({ entry_hash, gateway_url }) => {
    const res = await fetch(`${(gateway_url ?? DEFAULT_GATEWAY).replace(/\/$/, "")}/verify/${entry_hash}`);
    return text(await res.json());
  },
);

server.registerTool(
  "truth_witness_local",
  {
    description:
      "Observe with a local adapter into a local JSONL ledger. No payment is possible locally, so the outcome is OBSERVED or REFUSED, never FINALIZED. Adapters: " + Object.keys(NODE_ADAPTERS).join(", ") + LIMITS,
    inputSchema: { adapter: z.enum(Object.keys(NODE_ADAPTERS) as [string, ...string[]]), input: z.record(z.unknown()), ledger_path: z.string().default("data/ledger.jsonl") },
  },
  async ({ adapter, input, ledger_path }) => {
    const spec = NODE_ADAPTERS[adapter]!;
    const { keys, ephemeral } = await getLocalKeys();
    const ledger = await FileLedger.open(ledger_path);
    const clock = () => Date.now();
    const witness = createWitness(`ADAPTER:${spec.name}@${spec.version}`, keys, async (i) => {
      const p = await spec.translate(i, { fetch, clock });
      return p == null || findForbiddenKeys(p).length > 0 ? null : p;
    });
    const att = await submit(ledger, witness, input);
    return text({ ...att, mode: "local", limitations: LIMITATIONS, ledger_path: ledger.filePath, witness_public_key: keys.publicKeyHex, ephemeral_key: ephemeral });
  },
);

server.registerTool(
  "truth_verify_ledger_file",
  {
    description: "Verify a local JSONL ledger: chain from genesis, every event signature, every anchor. Read-only." + LIMITS,
    inputSchema: { ledger_path: z.string() },
  },
  async ({ ledger_path }) => {
    const ledger = await FileLedger.open(ledger_path);
    return text(await verifyEntries(ledger.snapshot()));
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
