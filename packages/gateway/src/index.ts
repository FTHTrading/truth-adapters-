/**
 * Cloudflare Worker entry. Binds app.ts to D1 and the environment.
 *
 * Secrets (wrangler secret put):
 *   WITNESS_PRIVATE_KEY_JWK   Ed25519 private JWK produced by `pnpm keygen`
 * Vars: see wrangler.jsonc.
 */
import { WORKER_ADAPTERS } from "../../adapters/src/registry.ts";
import { importKeysJwk, monotonic, type WitnessKeys } from "../../kernel/src/index.ts";
import { handle, runAnchor, type Deps } from "./app.ts";
import { configFromEnv, type EnvLike } from "./config.ts";
import { D1Ledger } from "./ledger-d1.ts";
import { createCdpAuthHeaders } from "@coinbase/x402";
import recordSchema from "../../../docs/schema/truth-record-v1.schema.json";
import attestationSchema from "../../../docs/schema/truth-attestation-v1.schema.json";

const SCHEMAS: Readonly<Record<string, unknown>> = Object.freeze({
  "truth-record-v1.schema.json": recordSchema,
  "truth-attestation-v1.schema.json": attestationSchema,
});

export interface Env extends EnvLike {
  LEDGER: D1Database;
  WITNESS_PRIVATE_KEY_JWK?: string;
  /** Workers Rate Limiting binding (wrangler.jsonc `ratelimits`). Optional: absent means unlimited free reads. */
  FREE_READS?: { limit(opts: { key: string }): Promise<{ success: boolean }> };
  /** Secret. Other UnyKorn Workers present this bearer to use /facilitator/* (CDP fronting). */
  FACILITATOR_PROXY_KEY?: string;
}

/**
 * CDP facilitator auth: a bearer JWT minted per request from the CDP key secrets.
 * Only constructed when both secrets exist; the secrets are read here and nowhere else.
 */
function facilitatorHeadersFrom(env: Env) {
  if (env.X402_FACILITATOR_BEARER && !(env.X402_FACILITATOR_URL ?? "").startsWith("https://api.cdp.coinbase.com")) {
    const h = { Authorization: `Bearer ${env.X402_FACILITATOR_BEARER}` };
    return async () => ({ verify: { ...h }, settle: { ...h } });
  }
  if (!env.CDP_API_KEY_ID || !env.CDP_API_KEY_SECRET) return undefined;
  const make = createCdpAuthHeaders(env.CDP_API_KEY_ID, env.CDP_API_KEY_SECRET);
  if (!make) return undefined;
  return async () => {
    const h = await make();
    return { verify: h.verify as Record<string, string>, settle: h.settle as Record<string, string> };
  };
}

const KERNEL_VERSION = "0.1.0";
const clock = monotonic();
let cachedKeys: Promise<WitnessKeys> | null = null;

function keysFrom(env: Env): Promise<WitnessKeys> {
  if (!cachedKeys) {
    cachedKeys = (async () => {
      if (!env.WITNESS_PRIVATE_KEY_JWK) throw new Error("WITNESS_PRIVATE_KEY_JWK secret is not set");
      return importKeysJwk(JSON.parse(env.WITNESS_PRIVATE_KEY_JWK) as JsonWebKey);
    })();
    cachedKeys.catch(() => {
      cachedKeys = null;
    });
  }
  return cachedKeys;
}

async function deps(env: Env): Promise<Deps> {
  return {
    ledger: new D1Ledger(env.LEDGER, clock),
    keys: await keysFrom(env),
    cfg: configFromEnv(env),
    adapters: WORKER_ADAPTERS,
    fetch: globalThis.fetch.bind(globalThis),
    clock,
    kernelVersion: KERNEL_VERSION,
    schemas: SCHEMAS,
    facilitatorHeaders: facilitatorHeadersFrom(env),
    facilitatorProxyKey: env.FACILITATOR_PROXY_KEY || undefined,
    rateLimit: env.FREE_READS ? async (key) => (await env.FREE_READS!.limit({ key })).success : undefined,
  };
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    try {
      return await handle(req, await deps(env));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return new Response(JSON.stringify({ refused: message }), { status: 500, headers: { "content-type": "application/json" } });
    }
  },
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(deps(env).then(runAnchor));
  },
};
