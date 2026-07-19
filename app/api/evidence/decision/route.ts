import { getAct2Engine } from "@/lib/demo/act2-runtime";
import { manager } from "@/lib/engine/manager";
import { DecisionEvidence } from "@/lib/evidence/decision-evidence";
import type { OddsViewId } from "@/lib/tempo/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONTRACTS = new Set<OddsViewId>(["match_1x2", "ou_25", "next_score", "corners_ou", "swing"]);

export async function GET(req: Request) {
  const url = new URL(req.url);
  const source = url.searchParams.get("source") === "demo" ? "demo" : "live";
  const sessionId = url.searchParams.get("sessionId") ?? "";
  const strategyId = url.searchParams.get("strategy") ?? "";
  const contract = url.searchParams.get("contract") as OddsViewId | null;
  const selector = url.searchParams.get("selector") === "latest_decision" ? "latest_decision" : "latest_fill";
  if (!sessionId || !strategyId || !contract || !CONTRACTS.has(contract)) {
    return Response.json(
      { error: { code: "INVALID_EVIDENCE_QUERY", message: "sessionId, strategy, and a supported contract are required" } },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  const engine = source === "demo" ? getAct2Engine(sessionId) : manager().getEngine();
  if (!engine) {
    return Response.json(
      { error: { code: "EVIDENCE_SOURCE_UNAVAILABLE", message: `No ${source} evidence session is available` } },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (engine.sessionId !== sessionId) {
    return Response.json(
      { error: { code: "SESSION_SOURCE_MISMATCH", message: "Session does not belong to the requested evidence source" } },
      { status: 409, headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    const receipt = await DecisionEvidence.build(engine, { sessionId, strategyId, contract, selector });
    return Response.json(receipt, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { error: { code: "EVIDENCE_NOT_FOUND", message: error instanceof Error ? error.message : "Decision evidence not found" } },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }
}
