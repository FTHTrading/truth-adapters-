/**
 * verify-served <origin>
 *
 * FORGE Phase 6: confirm the change against the served response, not the
 * repo. Fetches every public route, checks status, content type, labels,
 * limitations, and runs the claims gate on the served bytes. Exit 1 on any
 * failure. Never trusts a cache: sends cache-busting headers.
 */
import { scanClaims } from "../packages/gateway/src/claims.ts";

const origin = (process.argv[2] ?? "").replace(/\/$/, "");
if (!/^https?:\/\//.test(origin)) {
  console.error("usage: node scripts/verify-served.ts https://host");
  process.exit(2);
}

interface Check {
  path: string;
  accept?: string;
  type: "json" | "html" | "text";
  expectStatus?: number;
  needs?: string[];
  json?: (v: any) => string | null;
}

const checks: Check[] = [
  { path: "/", accept: "text/html", type: "html", needs: ["records what happened, who paid, and when", "mode:", "UNANCHORED"] },
  { path: "/", accept: "application/json", type: "json", json: (v) => (v.schema === "truth-manifest-v1" ? null : "manifest schema missing") },
  { path: "/.well-known/truth.json", type: "json", json: (v) => (v.labels && v.limitations && v.witness_public_key ? null : "labels/limitations/key missing") },
  { path: "/.well-known/x402", type: "json", json: (v) => (v.mode === "DRY_RUN" || v.mode === "LIVE" ? null : "mode missing") },
  { path: "/.well-known/agent.json", type: "json", json: (v) => (v.schemaVersion === "truth-agent-card-1" && v.labels ? null : "agent card malformed") },
  { path: "/status.json", type: "json", json: (v) => (v.labels?.status ? null : "labels.status missing") },
  { path: "/pricing.json", type: "json", json: (v) => (v.label && Array.isArray(v.items) ? null : "pricing malformed") },
  { path: "/openapi.json", type: "json", json: (v) => (v.openapi === "3.1.0" ? null : "openapi version") },
  { path: "/health", type: "json", json: (v) => (v.ok === true ? null : "health not ok") },
  { path: "/entries?from=0&limit=5", type: "json", json: (v) => (Array.isArray(v.entries) ? null : "entries malformed") },
  { path: "/schema/truth-record-v1.schema.json", type: "json", json: (v) => (v.title === "truth-record-v1" ? null : "schema title") },
  { path: "/schema/truth-attestation-v1.schema.json", type: "json", json: (v) => (v.title === "truth-attestation-v1" ? null : "schema title") },
  { path: "/.well-known/security.txt", type: "text", needs: ["Contact:"] },
  { path: "/witness/document", type: "json", expectStatus: 402, json: (v) => (v.x402Version === 1 && Array.isArray(v.accepts) ? null : "402 body malformed") },
];

let failures = 0;
const rows: string[] = [];
for (const c of checks) {
  const url = origin + c.path;
  const init: RequestInit = { headers: { accept: c.accept ?? (c.type === "json" ? "application/json" : "*/*"), "cache-control": "no-cache", pragma: "no-cache" } };
  if (c.path.startsWith("/witness/")) Object.assign(init, { method: "POST", headers: { ...init.headers, "content-type": "application/json" }, body: JSON.stringify({ sha256: "a".repeat(64) }) });
  let status = 0;
  let ctype = "";
  let text = "";
  try {
    const res = await fetch(url, init);
    status = res.status;
    ctype = res.headers.get("content-type") ?? "";
    text = await res.text();
  } catch (err) {
    rows.push(`FAIL ${c.path}  fetch error: ${err instanceof Error ? err.message : String(err)}`);
    failures++;
    continue;
  }
  const problems: string[] = [];
  if (status !== (c.expectStatus ?? 200)) problems.push(`status ${status}`);
  if (c.type === "json" && !ctype.includes("json")) problems.push(`content-type ${ctype}`);
  if (c.type === "html" && !ctype.includes("html")) problems.push(`content-type ${ctype}`);
  if (c.type === "json") {
    try {
      const v = JSON.parse(text);
      const p = c.json?.(v);
      if (p) problems.push(p);
    } catch {
      problems.push("not JSON");
    }
  }
  for (const n of c.needs ?? []) if (!text.includes(n)) problems.push(`missing "${n}"`);
  const claims = scanClaims(text);
  if (!claims.ok) problems.push(`claims: ${claims.hits.map((h) => h.phrase).join(", ")}`);
  if (problems.length) failures++;
  rows.push(`${problems.length ? "FAIL" : "ok  "} ${status} ${c.path}${c.accept ? ` (${c.accept})` : ""}${problems.length ? "  → " + problems.join("; ") : ""}`);
}
console.log(rows.join("\n"));
console.log(failures === 0 ? `\nVERIFY-SERVED: PASS (${checks.length} routes on ${origin})` : `\nVERIFY-SERVED: FAIL (${failures}/${checks.length})`);
process.exit(failures === 0 ? 0 : 1);
