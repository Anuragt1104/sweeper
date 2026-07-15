/** Short, URL-safe, human-shareable ids for rooms and members. */

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no ambiguous chars

export function shareCode(len = 6): string {
  let out = "";
  for (let i = 0; i < len; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

export function uid(prefix = ""): string {
  const rand = Math.random().toString(36).slice(2, 10);
  const t = Date.now().toString(36).slice(-4);
  return `${prefix}${prefix ? "_" : ""}${t}${rand}`;
}
