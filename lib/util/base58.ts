/** Minimal Base58 (Bitcoin alphabet) encode/decode — for Solana keys/sigs. */

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BASE = ALPHABET.length;
const INDEX: Record<string, number> = {};
for (let i = 0; i < ALPHABET.length; i++) INDEX[ALPHABET[i]] = i;

export function base58Encode(bytes: Uint8Array): string {
  if (bytes.length === 0) return "";
  const digits: number[] = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % BASE;
      carry = (carry / BASE) | 0;
    }
    while (carry > 0) {
      digits.push(carry % BASE);
      carry = (carry / BASE) | 0;
    }
  }
  let out = "";
  for (let k = 0; bytes[k] === 0 && k < bytes.length - 1; k++) out += "1";
  for (let q = digits.length - 1; q >= 0; q--) out += ALPHABET[digits[q]];
  return out;
}

export function base58Decode(str: string): Uint8Array {
  if (str.length === 0) return new Uint8Array(0);
  const bytes: number[] = [0];
  for (const ch of str) {
    const value = INDEX[ch];
    if (value === undefined) throw new Error(`Invalid base58 char: ${ch}`);
    let carry = value;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * BASE;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (let k = 0; str[k] === "1" && k < str.length - 1; k++) bytes.push(0);
  return new Uint8Array(bytes.reverse());
}
