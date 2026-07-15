/**
 * TxLINE auth/token manager (live mode only).
 *
 * Implements the documented Solana-wallet -> guest JWT -> signed activation ->
 * API token flow. Every data call needs BOTH the session JWT (Authorization:
 * Bearer) and the long-lived API token (X-Api-Token).
 *
 * Two ways to provide the API token:
 *  1. Paste a pre-minted token in TXLINE_API_TOKEN (simplest).
 *  2. Provide TXLINE_HOST_SECRET_KEY + TXLINE_TX_SIG (the confirmed signature of
 *     an on-chain `subscribe` tx) and we run /api/token/activate for you.
 *
 * This module only runs server-side. Secret keys never reach the client.
 */
import nacl from "tweetnacl";
import { base58Decode } from "@/lib/util/base58";

export function txlineBase(): string {
  return process.env.TXLINE_BASE_URL?.replace(/\/$/, "") ?? "https://txline.txodds.com";
}

let guestJwt: string | null = null;
let apiToken: string | null = null;

async function fetchText(url: string, init: RequestInit): Promise<string> {
  const res = await fetch(url, init);
  const body = await res.text();
  if (!res.ok) {
    throw new Error(`TxLINE ${init.method ?? "GET"} ${url} -> ${res.status}: ${body.slice(0, 300)}`);
  }
  return body;
}

export async function getGuestJwt(force = false): Promise<string> {
  if (guestJwt && !force) return guestJwt;
  const body = await fetchText(`${txlineBase()}/auth/guest/start`, { method: "POST" });
  const parsed = JSON.parse(body) as { token: string };
  guestJwt = parsed.token;
  return guestJwt;
}

function parseSecretKey(raw: string): Uint8Array {
  const t = raw.trim();
  if (t.startsWith("[")) return Uint8Array.from(JSON.parse(t) as number[]);
  return base58Decode(t);
}

async function activate(): Promise<string> {
  const secretRaw = process.env.TXLINE_HOST_SECRET_KEY;
  const txSig = process.env.TXLINE_TX_SIG;
  if (!secretRaw || !txSig) {
    throw new Error(
      "Live mode needs either TXLINE_API_TOKEN, or TXLINE_HOST_SECRET_KEY + TXLINE_TX_SIG to run activation.",
    );
  }
  const secretKey = parseSecretKey(secretRaw);
  const leagues = (process.env.TXLINE_LEAGUES ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const jwt = await getGuestJwt();
  // Documented binding: `${txSig}:${leagues.join(',')}:${jwt}`
  const message = `${txSig}:${leagues.join(",")}:${jwt}`;
  const signature = nacl.sign.detached(new TextEncoder().encode(message), secretKey);
  const walletSignature = Buffer.from(signature).toString("base64");

  const token = await fetchText(`${txlineBase()}/api/token/activate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      txSig,
      walletSignature,
      leagues: leagues.map((l) => Number(l)).filter((n) => Number.isFinite(n)),
    }),
  });
  // activation returns raw text/plain token
  return token.trim();
}

export async function getApiToken(): Promise<string> {
  if (apiToken) return apiToken;
  const provided = process.env.TXLINE_API_TOKEN?.trim();
  apiToken = provided && provided.length > 0 ? provided : await activate();
  return apiToken;
}

/** Both auth headers for any /api/* call. Refreshes JWT once on 401-ish errors. */
export async function txlineHeaders(extra: Record<string, string> = {}): Promise<Record<string, string>> {
  const [jwt, token] = await Promise.all([getGuestJwt(), getApiToken()]);
  return {
    Authorization: `Bearer ${jwt}`,
    "X-Api-Token": token,
    Accept: "application/json",
    ...extra,
  };
}

/** Force a fresh guest JWT (call after a 401). */
export async function refreshJwt(): Promise<void> {
  await getGuestJwt(true);
}
