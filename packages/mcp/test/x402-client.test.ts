import { test } from "node:test";
import assert from "node:assert/strict";
import { payAndPost, signPayment, type Requirements } from "../src/x402-client.ts";

// No test in this file may touch a real network. Opt in explicitly with TRUTH_TEST_ALLOW_NETWORK=1.
if (process.env.TRUTH_TEST_ALLOW_NETWORK !== "1") {
  globalThis.fetch = (async () => {
    throw new Error("real network access is disabled in tests (set TRUTH_TEST_ALLOW_NETWORK=1 to opt in)");
  }) as typeof fetch;
}

// Hardhat/Anvil account #0. Publicly documented test key; holds nothing anywhere real.
const TEST_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;
const TEST_ADDR = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

const reqs: Requirements = {
  scheme: "exact",
  network: "base-sepolia",
  maxAmountRequired: "1000",
  resource: "https://gw.test/witness/document",
  description: "test",
  payTo: "0x1111111111111111111111111111111111111111",
  maxTimeoutSeconds: 60,
  asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  extra: { name: "USDC", version: "2" },
};

test("signPayment produces an x402 v1 exact payload with an EIP-3009 authorization", async () => {
  const header = await signPayment(reqs, { privateKey: TEST_KEY, maxAtomic: 100_000n, now: () => 1_700_000_000_000 });
  const payload = JSON.parse(Buffer.from(header, "base64").toString("utf8"));
  assert.equal(payload.x402Version, 1);
  assert.equal(payload.scheme, "exact");
  assert.equal(payload.network, "base-sepolia");
  assert.match(payload.payload.signature, /^0x[0-9a-f]{130}$/);
  const a = payload.payload.authorization;
  assert.equal(a.from, TEST_ADDR);
  assert.equal(a.to, reqs.payTo);
  assert.equal(a.value, "1000");
  assert.equal(a.validAfter, "0");
  assert.equal(a.validBefore, String(1_700_000_000 + 60));
  assert.match(a.nonce, /^0x[0-9a-f]{64}$/);
});

test("the spend cap is enforced before anything is signed", async () => {
  await assert.rejects(signPayment({ ...reqs, maxAmountRequired: "100001" }, { privateKey: TEST_KEY, maxAtomic: 100_000n }), /exceeds X402_MAX_ATOMIC/);
  await assert.rejects(signPayment({ ...reqs, network: "mainnet-of-nowhere" }, { privateKey: TEST_KEY, maxAtomic: 100_000n }), /unsupported network/);
});

test("payAndPost: 402 → sign → retry with X-PAYMENT; without a key it stops at 402 and says why", async () => {
  const seen: Array<{ hasPayment: boolean }> = [];
  const fetchFn = (async (_url: RequestInfo | URL, init?: RequestInit) => {
    const hasPayment = !!(init?.headers as Record<string, string>)["x-payment"];
    seen.push({ hasPayment });
    if (!hasPayment) return Response.json({ x402Version: 1, accepts: [reqs] }, { status: 402 });
    return Response.json({ outcome: "FINALIZED" }, { status: 200, headers: { "x-payment-response": "e30=" } });
  }) as typeof fetch;

  const paid = await payAndPost("https://gw.test/witness/document", { sha256: "a".repeat(64) }, { privateKey: TEST_KEY, maxAtomic: 100_000n, fetchFn });
  assert.equal(paid.paid, true);
  assert.equal(paid.status, 200);
  assert.equal(paid.paymentResponse, "e30=");
  assert.deepEqual(seen, [{ hasPayment: false }, { hasPayment: true }]);

  const unpaid = await payAndPost("https://gw.test/witness/document", { sha256: "a".repeat(64) }, null, fetchFn);
  assert.equal(unpaid.paid, false);
  assert.equal(unpaid.status, 402);
  assert.match(unpaid.refused ?? "", /no payer key/);
  assert.equal(unpaid.requirements?.maxAmountRequired, "1000");
});
