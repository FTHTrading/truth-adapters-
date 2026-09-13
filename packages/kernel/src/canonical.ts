/**
 * Canonical JSON + SHA-256.
 *
 * Deterministic hashing is Implementation Requirement 2 of SPECIFICATION.md.
 * The frozen substrate hashes `JSON.stringify(data)`, which depends on key
 * insertion order. This module sorts keys recursively (JCS-style) so the same
 * observation always produces the same hash regardless of who serialised it.
 */

const enc = new TextEncoder();

export function canonicalize(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isFinite(value)) throw new TypeError("non-finite number cannot be canonicalized");
      return JSON.stringify(value);
    case "string":
      return JSON.stringify(value);
    case "undefined":
      throw new TypeError("undefined cannot be canonicalized");
    case "bigint":
    case "function":
    case "symbol":
      throw new TypeError(`${typeof value} cannot be canonicalized`);
  }
  if (Array.isArray(value)) {
    return "[" + value.map((v) => canonicalize(v === undefined ? null : v)).join(",") + "]";
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalize(obj[k])).join(",") + "}";
}

export function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) throw new TypeError("invalid hex");
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === "string" ? enc.encode(data) : data;
  const digest = await crypto.subtle.digest("SHA-256", toArrayBuffer(bytes));
  return bytesToHex(new Uint8Array(digest));
}

export async function hashCanonical(value: unknown): Promise<string> {
  return sha256Hex(canonicalize(value));
}

export const HEX64 = /^[0-9a-f]{64}$/;
