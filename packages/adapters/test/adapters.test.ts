import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findForbiddenKeys, isObservableUrl, WORKER_ADAPTERS, type AdapterContext } from "../src/index.ts";
import { NODE_ADAPTERS } from "../src/registry-node.ts";
import { gitCommit } from "../src/git-commit.ts";

const clock = () => 1_700_000_000_000;

function mockFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => handler(String(input), init)) as typeof fetch;
}

const HELLO_SHA = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"; // sha256("hello")

const validInputs: Record<string, unknown> = {
  document: { sha256: HELLO_SHA, bytes: 5, media_type: "text/plain", name: "hello.txt", submitted_by: "0xabc" },
  "ai-output": { provider: "anthropic", model: "claude-fable-5-1", prompt_sha256: HELLO_SHA, output_sha256: HELLO_SHA, request_id: "r1", tokens_in: 1, tokens_out: 2 },
  "http-served": { url: "https://example.com/page" },
  "evm-tx": { chain_id: 8453, tx_hash: "0x" + "ab".repeat(32) },
  "xrpl-tx": { tx_hash: "AB".repeat(32), network: "mainnet" },
  correction: { references: HELLO_SHA, replacement_sha256: "0x" + "AB".repeat(32) },
  "g402-receipt": {
    receiptVersion: "genesis402-receipt-v1",
    receiptId: "g402_rcpt_46e945cf29cd",
    kind: "payment.dry_run",
    mode: "DRY_RUN",
    truthLabels: ["VERIFIED", "PROJECTION"],
    decision: { outcome: "AUTHORIZED_NOT_SUBMITTED", reasonCodes: ["POLICY.OK"] },
    claim: { statement: "Policy evaluation returned OK", limitations: ["…"] },
    issuer: { id: "unykorn-control", keyId: "g402-key-25a7b4924d932aa9", alg: "ed25519", signature: "ab".repeat(64) },
    lifecycle: { issuedAt: "2026-09-13T11:59:13.828Z", statusAtIssuance: "ACTIVE" },
    integrity: { canonicalBodyHash: "sha256:" + "13".repeat(32), leafHash: "50".repeat(32), segmentRoot: "6c".repeat(32) },
  },
};

const ctx: AdapterContext = {
  clock,
  fetch: mockFetch((url, init) => {
    if (url.startsWith("https://example.com/")) {
      return new Response("hello", { status: 200, headers: { "content-type": "text/plain", etag: '"x"', "content-length": "5" } });
    }
    if (url === "https://mainnet.base.org") {
      return Response.json({
        jsonrpc: "2.0",
        id: 1,
        result: {
          transactionHash: "0x" + "ab".repeat(32), blockNumber: "0x10", blockHash: "0x" + "cd".repeat(32), from: "0xf", to: "0xt",
          status: "0x1", gasUsed: "0x5208", transactionIndex: "0x2", logs: [{ a: 1 }],
        },
      });
    }
    if (url === "https://xrplcluster.com/") {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.method, "tx");
      return Response.json({ result: { status: "success", hash: "AB".repeat(32), ledger_index: 123, validated: true, TransactionType: "Payment", Account: "rA", Destination: "rB", Fee: "12", Sequence: 7, meta: { TransactionResult: "tesSUCCESS", delivered_amount: "1000" } } });
    }
    return new Response("not found", { status: 404 });
  }),
};

for (const [name, spec] of Object.entries(WORKER_ADAPTERS)) {
  test(`${name}: valid input translates to a payload with no interpretation keys`, async () => {
    const payload = await spec.translate(validInputs[name], ctx);
    assert.ok(payload, "expected a payload");
    assert.deepEqual(findForbiddenKeys(payload), []);
    assert.deepEqual(findForbiddenKeys(spec.inputExample), []);
  });

  test(`${name}: non-object and empty inputs are not observable`, async () => {
    assert.equal(await spec.translate(null, ctx), null);
    assert.equal(await spec.translate("string", ctx), null);
    assert.equal(await spec.translate({}, ctx), null);
  });

  test(`${name}: price is a positive integer string`, () => {
    assert.match(spec.price.atomic, /^[1-9]\d*$/);
  });
}

test("document: unknown keys are dropped, bad digests refused", async () => {
  const p = (await WORKER_ADAPTERS.document!.translate({ sha256: HELLO_SHA, verdict: "good", extra: 1 }, ctx)) as Record<string, unknown>;
  assert.equal("verdict" in p, false);
  assert.equal("extra" in p, false);
  assert.equal(await WORKER_ADAPTERS.document!.translate({ sha256: "zz" }, ctx), null);
});

test("http-served: records what was served, hashes the body, keeps raw status", async () => {
  const p = (await WORKER_ADAPTERS["http-served"]!.translate({ url: "https://example.com/page" }, ctx)) as Record<string, unknown>;
  assert.equal(p.status, 200);
  assert.equal(p.body_sha256, HELLO_SHA);
  assert.equal(p.body_hashed, true);
  assert.equal(p.etag, '"x"');
});

test("http-served: private and local targets are not observable", () => {
  for (const bad of ["http://localhost/x", "http://127.0.0.1/", "http://10.0.0.1/", "http://192.168.1.1/", "http://169.254.169.254/", "ftp://example.com/", "http://user:pw@example.com/"]) {
    assert.equal(isObservableUrl(bad), null, bad);
  }
  assert.ok(isObservableUrl("https://unykorn.ai/"));
});

test("evm-tx: status stays raw and logs are digested, missing receipt is null", async () => {
  const p = (await WORKER_ADAPTERS["evm-tx"]!.translate(validInputs["evm-tx"], ctx)) as Record<string, unknown>;
  assert.equal(p.status_raw, "0x1");
  assert.equal(p.block_number, "16");
  assert.equal(p.logs_count, 1);
  const nullCtx: AdapterContext = { clock, fetch: mockFetch(() => Response.json({ jsonrpc: "2.0", id: 1, result: null })) };
  assert.equal(await WORKER_ADAPTERS["evm-tx"]!.translate(validInputs["evm-tx"], nullCtx), null);
});

test("evm-tx: rpc failure throws (becomes a FAILED event), never a fabricated receipt", async () => {
  const failCtx: AdapterContext = { clock, fetch: mockFetch(() => new Response("bad", { status: 502 })) };
  await assert.rejects(WORKER_ADAPTERS["evm-tx"]!.translate(validInputs["evm-tx"], failCtx), /rpc 502/);
});

test("xrpl-tx: engine result recorded raw; error responses are null", async () => {
  const p = (await WORKER_ADAPTERS["xrpl-tx"]!.translate(validInputs["xrpl-tx"], ctx)) as Record<string, unknown>;
  assert.equal(p.engine_result_raw, "tesSUCCESS");
  assert.equal(p.ledger_index, 123);
  const errCtx: AdapterContext = { clock, fetch: mockFetch(() => Response.json({ result: { status: "error", error: "txnNotFound" } })) };
  assert.equal(await WORKER_ADAPTERS["xrpl-tx"]!.translate(validInputs["xrpl-tx"], errCtx), null);
});

test("git-commit: observes a real commit in a temp repository", async () => {
  const dir = mkdtempSync(join(tmpdir(), "truth-git-"));
  const git = (...args: string[]) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } });
  git("init", "-q");
  writeFileSync(join(dir, "a.txt"), "a");
  git("add", "a.txt");
  git("commit", "-q", "-m", "first");
  const sha = git("rev-parse", "HEAD").trim();
  const p = (await gitCommit.translate({ repo: dir, sha: "HEAD" }, ctx)) as Record<string, unknown>;
  assert.equal(p.sha, sha);
  assert.deepEqual(p.parents, []);
  assert.match(String(p.tree), /^[0-9a-f]{40}$/);
  assert.deepEqual(findForbiddenKeys(p), []);
  assert.equal(await gitCommit.translate({ repo: dir, sha: "deadbeef" }, ctx), null);
  assert.equal(NODE_ADAPTERS["git-commit"], gitCommit);
});

test("correction: records the reference, normalises digests, refuses without a reference", async () => {
  const p = (await WORKER_ADAPTERS.correction!.translate(validInputs.correction, ctx)) as Record<string, unknown>;
  assert.equal(p.references, HELLO_SHA);
  assert.equal(p.replacement_sha256, "ab".repeat(32));
  assert.equal(p.note_sha256, null);
  assert.equal(await WORKER_ADAPTERS.correction!.translate({ replacement_sha256: HELLO_SHA }, ctx), null);
});

test("g402-receipt: records identity and integrity commitments only; never the decision, labels or claim", async () => {
  const p = (await WORKER_ADAPTERS["g402-receipt"]!.translate(validInputs["g402-receipt"], ctx)) as Record<string, unknown>;
  assert.equal(p.receipt_id, "g402_rcpt_46e945cf29cd");
  assert.equal(p.receipt_kind, "payment.dry_run");
  assert.equal(p.canonical_body_hash, "13".repeat(32));
  assert.equal(p.segment_root, "6c".repeat(32));
  for (const k of ["decision", "truthLabels", "truth_labels", "claim", "policy", "body", "signature", "outcome"]) assert.equal(k in p, false, k);
  assert.equal(await WORKER_ADAPTERS["g402-receipt"]!.translate({ ...validInputs["g402-receipt"] as object, receiptVersion: "genesis402-receipt-v2" }, ctx), null, "unknown version is not observable");
  assert.equal(await WORKER_ADAPTERS["g402-receipt"]!.translate({ ...validInputs["g402-receipt"] as object, integrity: { leafHash: "zz" } }, ctx), null, "missing commitments are not observable");
});

test("forbidden-key scanner catches nested and disguised keys", () => {
  assert.deepEqual(findForbiddenKeys({ ok: 1, "Verdict ": "x" }), ["$.Verdict "]);
  const found = findForbiddenKeys({ a: { Risk_Score: 1, risk: 2 }, b: [{ verdict: "x" }], c: { name: "risk-report.pdf" } });
  assert.ok(found.includes("$.a.risk"));
  assert.ok(found.includes("$.b[0].verdict"));
  assert.equal(found.some((p) => p.startsWith("$.c")), false, "values are not scanned");
});
