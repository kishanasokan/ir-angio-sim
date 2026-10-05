/**
 * FNV-1a over raw bytes (spec 01 §4.6): golden tests compare SimEngine.hash() values, and input logs record a hash of
 * /data. 32-bit, written to be identical in every JavaScript engine.
 */

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

export interface Hasher {
  state: number;
  /** Scratch view for hashing single numbers without allocating. */
  readonly number: Float64Array;
  readonly numberBytes: Uint8Array;
}

export function createHasher(): Hasher {
  const number = new Float64Array(1);
  return { state: FNV_OFFSET_BASIS, number, numberBytes: new Uint8Array(number.buffer) };
}

export function hashBytes(hasher: Hasher, bytes: Uint8Array): void {
  let state = hasher.state;
  for (let i = 0; i < bytes.length; i += 1) {
    state ^= bytes[i] ?? 0;
    state = Math.imul(state, FNV_PRIME) >>> 0;
  }
  hasher.state = state;
}

/** Hashes the raw bytes of a typed array, for example a rod's positions. */
export function hashTypedArray(
  hasher: Hasher,
  array: Float64Array | Float32Array | Int32Array | Uint8Array,
): void {
  hashBytes(hasher, new Uint8Array(array.buffer, array.byteOffset, array.byteLength));
}

export function hashNumber(hasher: Hasher, value: number): void {
  hasher.number[0] = value;
  hashBytes(hasher, hasher.numberBytes);
}

/** UTF-16 code units, two bytes each, so ids and other strings feed the same hash. */
export function hashString(hasher: Hasher, text: string): void {
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    hasher.state = Math.imul(hasher.state ^ (code & 0xff), FNV_PRIME) >>> 0;
    hasher.state = Math.imul(hasher.state ^ (code >>> 8), FNV_PRIME) >>> 0;
  }
}

/** The hash as eight hex digits. */
export function hashHex(hasher: Hasher): string {
  return hasher.state.toString(16).padStart(8, '0');
}

/** One-shot FNV-1a of a string, as eight hex digits. */
export function fnv1aString(text: string): string {
  const hasher = createHasher();
  hashString(hasher, text);
  return hashHex(hasher);
}
