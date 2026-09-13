/**
 * Ed25519 witness keys over WebCrypto only, so the same code runs in Node 24
 * and Cloudflare Workers. Private keys never leave CryptoKey objects except via
 * the explicit exportKeysJwk() call used by the keygen script.
 */
import { bytesToHex, hexToBytes, toArrayBuffer } from "./canonical.ts";

const ALG = { name: "Ed25519" };

export interface WitnessKeys {
  publicKeyHex: string;
  publicKey: CryptoKey;
  privateKey: CryptoKey;
}

async function exportRaw(key: CryptoKey): Promise<Uint8Array> {
  // workers-types widens exportKey's return to ArrayBuffer | JsonWebKey; "raw" always yields bytes.
  return new Uint8Array((await crypto.subtle.exportKey("raw", key)) as ArrayBuffer);
}

export async function generateKeys(): Promise<WitnessKeys> {
  const kp = (await crypto.subtle.generateKey(ALG, true, ["sign", "verify"])) as CryptoKeyPair;
  const raw = await exportRaw(kp.publicKey);
  return { publicKeyHex: bytesToHex(raw), publicKey: kp.publicKey, privateKey: kp.privateKey };
}

export async function exportKeysJwk(keys: WitnessKeys): Promise<JsonWebKey> {
  return (await crypto.subtle.exportKey("jwk", keys.privateKey)) as JsonWebKey;
}

export async function importKeysJwk(jwk: JsonWebKey): Promise<WitnessKeys> {
  if (jwk.kty !== "OKP" || jwk.crv !== "Ed25519" || !jwk.x || !jwk.d) {
    throw new TypeError("expected an Ed25519 OKP private JWK");
  }
  // Node 24 exports `alg: "Ed25519"`; Cloudflare Workers rejects that value on import
  // ("does not match requested Ed25519 curve"). Only kty/crv/x/d carry the key.
  const privJwk: JsonWebKey = { kty: "OKP", crv: "Ed25519", x: jwk.x, d: jwk.d };
  const privateKey = await crypto.subtle.importKey("jwk", privJwk, ALG, true, ["sign"]);
  const pubJwk: JsonWebKey = { kty: "OKP", crv: "Ed25519", x: jwk.x };
  const publicKey = await crypto.subtle.importKey("jwk", pubJwk, ALG, true, ["verify"]);
  const raw = await exportRaw(publicKey);
  return { publicKeyHex: bytesToHex(raw), publicKey, privateKey };
}

export async function signHex(privateKey: CryptoKey, messageHex: string): Promise<string> {
  const sig = await crypto.subtle.sign(ALG, privateKey, toArrayBuffer(hexToBytes(messageHex)));
  return bytesToHex(new Uint8Array(sig));
}

export async function verifyHex(publicKeyHex: string, messageHex: string, signatureHex: string): Promise<boolean> {
  try {
    const pub = await crypto.subtle.importKey("raw", toArrayBuffer(hexToBytes(publicKeyHex)), ALG, true, ["verify"]);
    return await crypto.subtle.verify(
      ALG,
      pub,
      toArrayBuffer(hexToBytes(signatureHex)),
      toArrayBuffer(hexToBytes(messageHex)),
    );
  } catch {
    return false;
  }
}
