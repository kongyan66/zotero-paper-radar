const FNV_OFFSET_BASIS_64 = 0xcbf29ce484222325n;
const FNV_PRIME_64 = 0x100000001b3n;
const UINT64_MASK = 0xffffffffffffffffn;

export function stableHash(value: string): string {
  let hash = FNV_OFFSET_BASIS_64;
  const bytes = new TextEncoder().encode(value);
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = (hash * FNV_PRIME_64) & UINT64_MASK;
  }
  return hash.toString(16).padStart(16, "0");
}

export function stableJsonHash(value: unknown): string {
  return stableHash(JSON.stringify(value));
}
