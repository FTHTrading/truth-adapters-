/**
 * Every committed vector must (1) produce the expected verifier verdict,
 * (2) agree between the JSON Schema (ajv, tests only) and the verifier's
 * dependency-free structural checks, and (3) reproduce byte-for-byte.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv2020Module from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
// ajv ships CommonJS with both `module.exports = X` and `exports.default = X`; unwrap either shape.
type Ctor<T> = T extends { default: infer D } ? D : T;
const Ajv2020 = ((Ajv2020Module as unknown as { default?: unknown }).default ?? Ajv2020Module) as Ctor<typeof Ajv2020Module>;
const addFormats = ((addFormatsModule as unknown as { default?: unknown }).default ?? addFormatsModule) as Ctor<typeof addFormatsModule>;
import { validateEntryShape } from "../../kernel/src/index.ts";
import { generate } from "../../../scripts/vectors.ts";
import { verifyEntries } from "../src/cli.ts";

const ROOT = "vectors";
const files = readdirSync(ROOT).filter((f) => f.endsWith(".json")).sort();
const schema = JSON.parse(readFileSync("docs/schema/truth-record-v1.schema.json", "utf8"));
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
const validate = ajv.compile(schema);

assert.ok(files.length >= 7, "vectors are committed");

for (const f of files) {
  const v = JSON.parse(readFileSync(join(ROOT, f), "utf8"));
  test(`${f}: verifier verdict matches expected`, async () => {
    const r = await verifyEntries(v.entries);
    assert.equal(r.ok, v.expected.ok, JSON.stringify(r));
    if (v.expected.chain_at !== undefined) assert.equal(r.chain.at, v.expected.chain_at);
    if (v.expected.events_bad !== undefined) assert.equal(r.events.bad.length, v.expected.events_bad);
    if (v.expected.anchors_bad !== undefined) assert.equal(r.anchors.bad.length, v.expected.anchors_bad);
    if (v.expected.structure_bad !== undefined) assert.equal(r.structure.bad.length, v.expected.structure_bad);
  });

  test(`${f}: JSON Schema and built-in structural validation agree on every entry`, () => {
    for (const e of v.entries) {
      const bySchema = validate(e) as boolean;
      const byCode = validateEntryShape(e).ok;
      assert.equal(bySchema, byCode, `seq ${e.seq}: schema=${bySchema} code=${byCode} ${JSON.stringify(validate.errors)}`);
    }
  });
}

test("vectors reproduce byte-for-byte from the committed key and fixed clock", async () => {
  const regenerated = await generate();
  for (const v of regenerated) {
    const onDisk = readFileSync(join(ROOT, `${v.name}.json`), "utf8");
    const fresh = JSON.stringify({ name: v.name, description: v.description, expected: v.expected, entries: v.entries }, null, 2) + "\n";
    assert.equal(fresh, onDisk, `${v.name} drifted`);
  }
});
