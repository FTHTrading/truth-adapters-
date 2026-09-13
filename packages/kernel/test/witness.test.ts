import { test } from "node:test";
import assert from "node:assert/strict";
import { createWitness, exportKeysJwk, generateKeys, importKeysJwk, signHex, verifyEvent } from "../src/index.ts";

const clock = () => 1_700_000_000_000;

test("a signed observation verifies", async () => {
  const keys = await generateKeys();
  const w = createWitness("T", keys, (i) => i, { clock });
  const e = await w.observe({ hello: "world" });
  assert.ok(e);
  assert.equal(e.witness, "T");
  assert.equal(e.pub, keys.publicKeyHex);
  assert.deepEqual(await verifyEvent(e), { ok: true });
});

test("altering the payload after signing is detected", async () => {
  const keys = await generateKeys();
  const w = createWitness("T", keys, (i) => i, { clock });
  const e = (await w.observe({ n: 1 }))!;
  const tampered = { ...e, payload: { n: 2 } };
  assert.equal((await verifyEvent(tampered)).reason, "id does not match content");
});

test("a signature from another key is rejected", async () => {
  const keys = await generateKeys();
  const other = await generateKeys();
  const w = createWitness("T", keys, (i) => i, { clock });
  const e = (await w.observe({ n: 1 }))!;
  const forged = { ...e, sig: await signHex(other.privateKey, e.id) };
  assert.equal((await verifyEvent(forged)).reason, "signature invalid");
});

test("a claimed public key without a signature is incomplete", async () => {
  const keys = await generateKeys();
  const w = createWitness("T", keys, (i) => i, { clock });
  const e = (await w.observe({ n: 1 }))!;
  const stripped = { ...e };
  delete stripped.sig;
  assert.equal((await verifyEvent(stripped)).reason, "signature incomplete");
});

test("witness returns null when the translator has nothing to observe", async () => {
  const keys = await generateKeys();
  const w = createWitness("T", keys, () => null, { clock });
  assert.equal(await w.observe({ anything: true }), null);
});

test("a throwing translator yields a signed FAILED event, not a crash", async () => {
  const keys = await generateKeys();
  const w = createWitness("T", keys, () => {
    throw new Error("upstream unreachable");
  }, { clock });
  const e = await w.observe({});
  assert.ok(e);
  assert.equal(e.type, "FAILED");
  assert.deepEqual(e.payload, { error: "upstream unreachable" });
  assert.deepEqual(await verifyEvent(e), { ok: true });
});

test("keys round-trip through JWK and keep the same public key, even with runtime-specific alg/key_ops/ext members", async () => {
  const keys = await generateKeys();
  const jwk = await exportKeysJwk(keys);
  const back = await importKeysJwk({ ...jwk, alg: "Ed25519", key_ops: ["sign"], ext: true });
  assert.equal(back.publicKeyHex, keys.publicKeyHex);
  const w = createWitness("T", back, (i) => i, { clock });
  const e = (await w.observe({ x: 1 }))!;
  assert.deepEqual(await verifyEvent(e), { ok: true });
});
