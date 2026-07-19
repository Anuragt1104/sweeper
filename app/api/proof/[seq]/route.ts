import { manager } from "@/lib/engine/manager";
import { getAct2Engine } from "@/lib/demo/act2-runtime";
import { eventStore } from "@/lib/persistence/runtime-store";
import { buildProofBundle } from "@/lib/proof/ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Inclusion proof for a single ledger record of the live session. */
export async function GET(req: Request, ctx: { params: Promise<{ seq: string }> }) {
  const { seq } = await ctx.params;
  const parsedSeq = Number(seq);
  if (!Number.isSafeInteger(parsedSeq) || parsedSeq < 0) {
    return Response.json({ error: { code: "INVALID_SEQUENCE", message: "Sequence must be a non-negative integer" } }, { status: 400 });
  }
  const url = new URL(req.url);
  const source = url.searchParams.get("source") === "demo" ? "demo" : "live";
  const requestedSession = url.searchParams.get("sessionId") ?? undefined;
  const engine = source === "demo" ? getAct2Engine(requestedSession) : manager().getEngine();
  if (engine && requestedSession && engine.sessionId !== requestedSession) {
    return Response.json({ error: { code: "SESSION_SOURCE_MISMATCH", message: "Session does not belong to the requested proof source" } }, { status: 409 });
  }
  if (engine) {
    const bundle = engine.proof(parsedSeq);
    if (bundle) return Response.json(bundle, { headers: { "Cache-Control": "no-store" } });
  }
  if (source === "demo") {
    return Response.json({ error: { code: "PROOF_NOT_FOUND", message: "Demo proof record not found" } }, { status: 404 });
  }
  const sessionId = requestedSession ?? engine?.sessionId;
  if (!sessionId) return Response.json({ error: { code: "NO_ACTIVE_SESSION", message: "No active live session" } }, { status: 404 });
  const store = eventStore();
  const [entry, hashes] = await Promise.all([
    store.loadLedgerRecord(sessionId, parsedSeq),
    store.listLedgerLeafHashes(sessionId),
  ]);
  if (!entry) return Response.json({ error: { code: "PROOF_NOT_FOUND", message: "Ledger record not found" } }, { status: 404 });
  try {
    return Response.json(buildProofBundle(entry, hashes), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: { code: "PROOF_INVALID", message: error instanceof Error ? error.message : "Historical proof could not be reconstructed" } }, { status: 409 });
  }
}
