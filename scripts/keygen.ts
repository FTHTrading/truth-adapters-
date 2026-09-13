/**
 * Generates a witness key pair. Writes the private JWK to keys/witness.jwk.json
 * (gitignored) and prints ONLY the public key and the wrangler command.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { exportKeysJwk, generateKeys } from "../packages/kernel/src/index.ts";

const out = process.argv[2] ?? "keys/witness.jwk.json";
if (existsSync(out)) {
  console.error(`${out} already exists; refusing to overwrite a witness key. Pass a different path.`);
  process.exit(1);
}
const keys = await generateKeys();
const jwk = await exportKeysJwk(keys);
mkdirSync("keys", { recursive: true });
writeFileSync(out, JSON.stringify(jwk), { mode: 0o600 });
console.log(`witness public key: ${keys.publicKeyHex}`);
console.log(`private JWK written to ${out} (never commit, never paste into chat)`);
console.log(`gateway secret:     wrangler secret put WITNESS_PRIVATE_KEY_JWK -c packages/gateway/wrangler.jsonc < ${out}`);
