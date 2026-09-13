import { isObject, optionalString, type AdapterSpec } from "./types.ts";

/**
 * Direct observation of what a URL served at a moment in time: final URL,
 * status, selected response headers and the SHA-256 of the body. This is the
 * "verify served, not repo" rule as a product: repo-green is not live-green.
 *
 * Bodies above MAX_BODY_BYTES are not hashed; the payload says so instead of
 * hashing a truncated body and calling it the body.
 */
export const MAX_BODY_BYTES = 8 * 1024 * 1024;

const BLOCKED_HOSTS = /^(localhost|.*\.localhost|.*\.local|.*\.internal|0\.0\.0\.0|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+|\[::1\]|\[fc.*|\[fd.*|\[fe80.*)$/i;

export function isObservableUrl(raw: string): URL | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (u.username || u.password) return null;
  if (BLOCKED_HOSTS.test(u.hostname)) return null;
  return u;
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const d = await crypto.subtle.digest("SHA-256", copy.buffer);
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}

export const httpServed: AdapterSpec = {
  name: "http-served",
  version: "1.0.0",
  observation: "direct",
  runtime: "any",
  description: "Fetches a public URL and records status, selected headers and the SHA-256 of the served body.",
  price: { atomic: "5000" },
  inputExample: { url: "https://example.com/" },
  async translate(input, ctx) {
    if (!isObject(input)) return null;
    const raw = optionalString(input.url, 2048);
    if (!raw) return null;
    const url = isObservableUrl(raw);
    if (!url) return null;

    const started = ctx.clock();
    const res = await ctx.fetch(url.toString(), {
      method: "GET",
      redirect: "follow",
      headers: { "user-agent": "truth-witness/1.0 (+https://github.com/kevanbtc/truth)", accept: "*/*" },
    });
    const declaredLength = res.headers.get("content-length");
    let body_sha256: string | null = null;
    let body_bytes: number | null = null;
    let body_hashed = false;
    if (declaredLength === null || Number(declaredLength) <= MAX_BODY_BYTES) {
      const buf = new Uint8Array(await res.arrayBuffer());
      body_bytes = buf.byteLength;
      if (buf.byteLength <= MAX_BODY_BYTES) {
        body_sha256 = await sha256(buf);
        body_hashed = true;
      }
    } else {
      body_bytes = Number(declaredLength);
      await res.body?.cancel();
    }
    const pick = (h: string) => res.headers.get(h) ?? null;
    return {
      kind: "http_served",
      url: url.toString(),
      final_url: res.url || url.toString(),
      status: res.status,
      content_type: pick("content-type"),
      etag: pick("etag"),
      last_modified: pick("last-modified"),
      cache_control: pick("cache-control"),
      server: pick("server"),
      body_bytes,
      body_sha256,
      body_hashed,
      fetched_at: started,
      duration_ms: ctx.clock() - started,
    };
  },
};
