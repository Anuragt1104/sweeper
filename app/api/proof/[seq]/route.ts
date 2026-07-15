import { manager } from "@/lib/engine/manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Inclusion proof for a single ledger record of the live session. */
export async function GET(_req: Request, ctx: { params: Promise<{ seq: string }> }) {
  const { seq } = await ctx.params;
  const engine = manager().getEngine();
  if (!engine) return Response.json({ error: "no active session" }, { status: 404 });
  const bundle = engine.proof(Number(seq));
  if (!bundle) return Response.json({ error: "record not found" }, { status: 404 });
  return Response.json(bundle);
}
