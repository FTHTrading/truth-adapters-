import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalize, hashCanonical, sha256Hex } from "../src/index.ts";

test("key order does not change the canonical form", () => {
  const a = canonicalize({ b: 1, a: { d: [1, 2], c: "x" } });
  const b = canonicalize({ a: { c: "x", d: [1, 2] }, b: 1 });
  assert.equal(a, b);
  assert.equal(a, '{"a":{"c":"x","d":[1,2]},"b":1}');
});

test("undefined members are dropped, undefined array items become null", () => {
  assert.equal(canonicalize({ a: undefined, b: 2 }), '{"b":2}');
  assert.equal(canonicalize([1, undefined, 3]), "[1,null,3]");
});

test("non-finite numbers and bigints are refused", () => {
  assert.throws(() => canonicalize({ n: NaN }), TypeError);
  assert.throws(() => canonicalize({ n: Infinity }), TypeError);
  assert.throws(() => canonicalize({ n: 1n }), TypeError);
});

test("same content hashes identically regardless of serialisation order", async () => {
  const h1 = await hashCanonical({ x: 1, y: [{ q: true, p: null }] });
  const h2 = await hashCanonical({ y: [{ p: null, q: true }], x: 1 });
  assert.equal(h1, h2);
  assert.match(h1, /^[0-9a-f]{64}$/);
});

test("sha256 matches a known vector", async () => {
  assert.equal(await sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});
