# Gateway: a "trusted" facilitator kind — a bearer-authenticated facilitator we operate (the task rail's
# /facilitator/*), allowed for Base mainnet. CDP credentials never need to be on this Worker.
# Idempotent (marker: "trusted").
import io, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
G = os.path.join(HERE, '..')

def patch(path, edits, marker):
    s = io.open(path, encoding='utf-8').read()
    if marker in s:
        print(os.path.basename(path), 'already patched'); return
    for old, new, label in edits:
        assert s.count(old) == 1, os.path.basename(path) + ' anchor: ' + label + ' (count=%d)' % s.count(old)
        s = s.replace(old, new, 1)
    io.open(path, 'w', encoding='utf-8', newline='\n').write(s)
    print(os.path.basename(path), 'patched')

patch(os.path.join(G, 'src', 'config.ts'), [
    ('  facilitatorKind: "cdp" | "public";', '  facilitatorKind: "cdp" | "public" | "trusted";', 'type'),
    ("""  X402_FACILITATOR_URL?: string;""", """  X402_FACILITATOR_URL?: string;
  /** Secret. Bearer for a facilitator we operate (the task rail's /facilitator/*). Makes it kind "trusted". */
  X402_FACILITATOR_BEARER?: string;""", 'env'),
    ("""  const facilitatorKind: X402Config["facilitatorKind"] = facilitatorUrl.startsWith("https://api.cdp.coinbase.com") ? "cdp" : "public";
  if (facilitatorKind === "cdp" && !hasCdp) problems.push("CDP facilitator requires CDP_API_KEY_ID and CDP_API_KEY_SECRET secrets");
  // Fail-safe: mainnet settles only through an authenticated facilitator. The public testnet facilitator never settles mainnet.
  if (net?.network === "base" && facilitatorKind !== "cdp") problems.push("X402_NETWORK=base requires the CDP facilitator (set CDP_API_KEY_ID / CDP_API_KEY_SECRET)");""",
     """  const hasBearer = !!(env.X402_FACILITATOR_BEARER && env.X402_FACILITATOR_BEARER.length >= 16);
  const facilitatorKind: X402Config["facilitatorKind"] = facilitatorUrl.startsWith("https://api.cdp.coinbase.com") ? "cdp" : (hasBearer && !facilitatorUrl.startsWith("https://x402.org") ? "trusted" : "public");
  if (facilitatorKind === "cdp" && !hasCdp) problems.push("CDP facilitator requires CDP_API_KEY_ID and CDP_API_KEY_SECRET secrets");
  // Fail-safe: mainnet settles only through an authenticated facilitator (CDP directly, or a facilitator we operate
  // behind a bearer). The public testnet facilitator never settles mainnet.
  if (net?.network === "base" && facilitatorKind === "public") problems.push("X402_NETWORK=base requires an authenticated facilitator (CDP secrets, or X402_FACILITATOR_URL + X402_FACILITATOR_BEARER)");""", 'kind'),
], '"trusted"')

patch(os.path.join(G, 'src', 'index.ts'), [
    ("""function facilitatorHeadersFrom(env: Env) {
  if (!env.CDP_API_KEY_ID || !env.CDP_API_KEY_SECRET) return undefined;""", """function facilitatorHeadersFrom(env: Env) {
  if (env.X402_FACILITATOR_BEARER && !(env.X402_FACILITATOR_URL ?? "").startsWith("https://api.cdp.coinbase.com")) {
    const h = { Authorization: `Bearer ${env.X402_FACILITATOR_BEARER}` };
    return async () => ({ verify: { ...h }, settle: { ...h } });
  }
  if (!env.CDP_API_KEY_ID || !env.CDP_API_KEY_SECRET) return undefined;""", 'headers'),
], 'X402_FACILITATOR_BEARER')

patch(os.path.join(G, 'src', 'app.ts'), [
    ("""    if (!deps.cfg.x402 || deps.cfg.x402.facilitatorKind !== "cdp" || !deps.facilitatorHeaders) return json(503, { refused: "proxy fronts the CDP facilitator only; this gateway is not configured for it" });""",
     """    if (!deps.cfg.x402 || deps.cfg.x402.facilitatorKind === "public" || !deps.facilitatorHeaders) return json(503, { refused: "proxy fronts an authenticated facilitator only; this gateway is not configured for it" });""", 'proxy gate'),
], 'authenticated facilitator only')

# live config points at the rail
lp = os.path.join(G, 'wrangler.live.jsonc'); s = io.open(lp, encoding='utf-8').read()
if 'twin.unykorn.org/facilitator' not in s:
    s = s.replace('    // Base mainnet. With no X402_FACILITATOR_URL the gateway selects the CDP facilitator when the two secrets exist.\n    "X402_NETWORK": "base",',
                  '    // Base mainnet through the task rail\'s facilitator (bearer secret X402_FACILITATOR_BEARER). The CDP credential stays on the rail.\n    "X402_NETWORK": "base",\n    "X402_FACILITATOR_URL": "https://twin.unykorn.org/facilitator",', 1)
    s = s.replace('//   npx wrangler secret put CDP_API_KEY_ID     --name genesis402-apex\n//   npx wrangler secret put CDP_API_KEY_SECRET --name genesis402-apex', '//   npx wrangler secret put X402_FACILITATOR_BEARER --name genesis402-apex   (the shared facilitator bearer)\n//   npx wrangler secret put FACILITATOR_PROXY_KEY   --name genesis402-apex   (bearer other Workers present to THIS gateway\'s /facilitator/*)', 1)
    io.open(lp, 'w', encoding='utf-8', newline='\n').write(s); print('wrangler.live.jsonc -> rail facilitator')

# tests
tp = os.path.join(G, 'test', 'app.test.ts'); t = io.open(tp, encoding='utf-8').read()
if 'trusted facilitator' not in t:
    t = t.rstrip('\n') + '''

test("trusted facilitator: bearer + non-CDP URL is allowed on base mainnet; public testnet facilitator is not", async () => {
  const { configFromEnv } = await import("../src/config.ts");
  const ok = configFromEnv({ SERVICE_NAME: "t", X402_NETWORK: "base", X402_FACILITATOR_URL: "https://twin.unykorn.org/facilitator", X402_FACILITATOR_BEARER: "fpk_0123456789abcdef", X402_PAY_TO: PAY_TO });
  assert.ok(ok.x402, "trusted facilitator config must load: " + JSON.stringify(ok.disabledReason ?? null));
  assert.equal(ok.x402!.facilitatorKind, "trusted");
  const bad = configFromEnv({ SERVICE_NAME: "t", X402_NETWORK: "base", X402_FACILITATOR_URL: "https://x402.org/facilitator", X402_FACILITATOR_BEARER: "fpk_0123456789abcdef", X402_PAY_TO: PAY_TO });
  assert.equal(bad.x402, null);
  const short = configFromEnv({ SERVICE_NAME: "t", X402_NETWORK: "base", X402_FACILITATOR_URL: "https://twin.unykorn.org/facilitator", X402_FACILITATOR_BEARER: "short", X402_PAY_TO: PAY_TO });
  assert.equal(short.x402, null, "a bearer under 16 chars does not make a facilitator trusted");
});
'''
    io.open(tp, 'w', encoding='utf-8', newline='\n').write(t); print('app.test.ts: trusted facilitator test added')
