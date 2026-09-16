# Facilitator proxy: /facilitator/supported|verify|settle on the gateway, bearer-keyed, forwarding to the CDP facilitator
# with the gateway's per-request JWT. Lets every UnyKorn Worker (blockchainfraud.org, nil33.com) settle on Base mainnet
# through ONE CDP credential without holding it. Idempotent (marker: /facilitator/).
import io, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
G = os.path.join(HERE, '..')

def patch(path, edits, marker):
    s = io.open(path, encoding='utf-8').read()
    if marker in s:
        print(os.path.basename(path), 'already patched'); return
    for old, new, label in edits:
        assert s.count(old) == 1, os.path.basename(path) + ' anchor: ' + label
        s = s.replace(old, new, 1)
    io.open(path, 'w', encoding='utf-8', newline='\n').write(s)
    print(os.path.basename(path), 'patched')

patch(os.path.join(G, 'src', 'app.ts'), [
    ("""  /** Free-route rate limiter: returns false when the key has exceeded its budget. Absent = unlimited. */
  rateLimit?: (key: string) => Promise<boolean>;
}""", """  /** Free-route rate limiter: returns false when the key has exceeded its budget. Absent = unlimited. */
  rateLimit?: (key: string) => Promise<boolean>;
  /** Bearer that other UnyKorn Workers present to use this gateway as their facilitator (CDP fronting). Absent = proxy off. */
  facilitatorProxyKey?: string;
}""", 'deps'),
    ("""  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
""", """  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  // ---- facilitator proxy: bearer-keyed, CDP only, no free path ------------------------------------------
  if (path === "/facilitator/supported" || path === "/facilitator/verify" || path === "/facilitator/settle") {
    if (!deps.facilitatorProxyKey) return json(503, { refused: "facilitator proxy not configured (FACILITATOR_PROXY_KEY)" });
    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${deps.facilitatorProxyKey}`) return json(401, { refused: "bearer required" });
    if (!deps.cfg.x402 || deps.cfg.x402.facilitatorKind !== "cdp" || !deps.facilitatorHeaders) return json(503, { refused: "proxy fronts the CDP facilitator only; this gateway is not configured for it" });
    const base = deps.cfg.x402.facilitatorUrl;
    const hdrs = await deps.facilitatorHeaders();
    if (path === "/facilitator/supported") {
      if (req.method !== "GET") return json(405, { refused: "GET" });
      const up = await deps.fetch(`${base}/supported`, { headers: { accept: "application/json", ...hdrs.verify } });
      return new Response(await up.text(), { status: up.status, headers: { "content-type": "application/json; charset=utf-8", ...CORS } });
    }
    if (req.method !== "POST") return json(405, { refused: "POST" });
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) return json(413, { refused: "body too large" });
    let body: unknown;
    try { body = JSON.parse(raw); } catch { return json(400, { refused: "invalid JSON" }); }
    const b = body as { paymentPayload?: unknown; paymentRequirements?: unknown };
    if (!b || typeof b !== "object" || !b.paymentPayload || !b.paymentRequirements) return json(400, { refused: "paymentPayload and paymentRequirements required" });
    const which = path.endsWith("/verify") ? "verify" : "settle";
    const up = await deps.fetch(`${base}/${which}`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json", ...hdrs[which] }, body: raw });
    return new Response(await up.text(), { status: up.status, headers: { "content-type": "application/json; charset=utf-8", ...CORS } });
  }
""", 'routes'),
], '/facilitator/')

patch(os.path.join(G, 'src', 'index.ts'), [
    ("""    facilitatorHeaders: facilitatorHeadersFrom(env),""", """    facilitatorHeaders: facilitatorHeadersFrom(env),
    facilitatorProxyKey: env.FACILITATOR_PROXY_KEY || undefined,""", 'deps'),
    ("""  CDP_API_KEY_SECRET?: string;""", """  CDP_API_KEY_SECRET?: string;
  /** Secret. Other UnyKorn Workers present this bearer to use /facilitator/* (CDP fronting). */
  FACILITATOR_PROXY_KEY?: string;""", 'env'),
], 'FACILITATOR_PROXY_KEY')

# tests
tp = os.path.join(G, 'test', 'app.test.ts')
s = io.open(tp, encoding='utf-8').read()
if 'facilitator proxy' not in s:
    s = s.rstrip('\n') + '''

test("facilitator proxy: off without key, 401 without bearer, 503 unless CDP, forwards verify/settle with the gateway JWT", async () => {
  const fac = goodFacilitator();
  const deps = await makeDeps(fac, WORKER_ADAPTERS, { X402_FACILITATOR_URL: "https://api.cdp.coinbase.com/platform/v2/x402", CDP_API_KEY_ID: "id", CDP_API_KEY_SECRET: "sec" });
  const seen: Array<{ url: string; auth: string | undefined }> = [];
  deps.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input); seen.push({ url, auth: (init?.headers as Record<string, string> | undefined)?.Authorization });
    if (url.endsWith("/supported")) return Response.json({ kinds: [{ scheme: "exact", network: "eip155:8453" }] });
    if (url.endsWith("/verify")) return Response.json(fac.verify(JSON.parse(String(init?.body))));
    if (url.endsWith("/settle")) return Response.json(fac.settle(JSON.parse(String(init?.body))));
    throw new Error("unexpected " + url);
  }) as typeof fetch;
  deps.facilitatorHeaders = async () => ({ verify: { Authorization: "Bearer v-jwt" }, settle: { Authorization: "Bearer s-jwt" } });
  const body = JSON.stringify({ x402Version: 2, paymentPayload: { a: 1 }, paymentRequirements: { b: 2 } });
  // off
  let r = await handle(new Request("https://gw.test/facilitator/verify", { method: "POST", body }), deps);
  assert.equal(r.status, 503);
  deps.facilitatorProxyKey = "proxy-key";
  // no bearer / wrong bearer
  r = await handle(new Request("https://gw.test/facilitator/verify", { method: "POST", body }), deps); assert.equal(r.status, 401);
  r = await handle(new Request("https://gw.test/facilitator/verify", { method: "POST", body, headers: { authorization: "Bearer nope" } }), deps); assert.equal(r.status, 401);
  const H = { authorization: "Bearer proxy-key", "content-type": "application/json" };
  // bad body
  r = await handle(new Request("https://gw.test/facilitator/verify", { method: "POST", body: "{}", headers: H }), deps); assert.equal(r.status, 400);
  // supported / verify / settle forward with the right JWT each
  r = await handle(new Request("https://gw.test/facilitator/supported", { headers: H }), deps); assert.equal(r.status, 200);
  r = await handle(new Request("https://gw.test/facilitator/verify", { method: "POST", body, headers: H }), deps); assert.equal(r.status, 200);
  r = await handle(new Request("https://gw.test/facilitator/settle", { method: "POST", body, headers: H }), deps); assert.equal(r.status, 200);
  assert.deepEqual(seen.map((x) => [x.url.split("/x402/")[1], x.auth]), [["supported", "Bearer v-jwt"], ["verify", "Bearer v-jwt"], ["settle", "Bearer s-jwt"]]);
  // not CDP -> 503 even with key
  const pub = await makeDeps(goodFacilitator());
  pub.facilitatorProxyKey = "proxy-key";
  r = await handle(new Request("https://gw.test/facilitator/verify", { method: "POST", body, headers: H }), pub); assert.equal(r.status, 503);
});
'''
    io.open(tp, 'w', encoding='utf-8', newline='\n').write(s); print('app.test.ts patched')
else:
    print('app.test.ts already patched')
