import { timingSafeEqual } from "node:crypto";

export type ControlAuthorization =
  | { ok: true }
  | { ok: false; status: 401 | 403 | 503; code: string; message: string };

export function authorizeControl(request: Request): ControlAuthorization {
  const configured = process.env.SWEEPER_CONTROL_KEY?.trim();
  if (!configured) {
    return {
      ok: false,
      status: 503,
      code: "CONTROL_NOT_CONFIGURED",
      message: "Server control key is not configured; this deployment is spectator-only.",
    };
  }
  const supplied = request.headers.get("X-Control-Key")?.trim();
  if (!supplied) {
    return {
      ok: false,
      status: 401,
      code: "CONTROL_KEY_REQUIRED",
      message: "X-Control-Key is required for session and replay mutations.",
    };
  }
  const expectedBytes = Buffer.from(configured);
  const suppliedBytes = Buffer.from(supplied);
  if (expectedBytes.length !== suppliedBytes.length || !timingSafeEqual(expectedBytes, suppliedBytes)) {
    return { ok: false, status: 403, code: "CONTROL_KEY_INVALID", message: "The supplied control key is invalid." };
  }
  return { ok: true };
}

export function controlError(auth: Exclude<ControlAuthorization, { ok: true }>): Response {
  return Response.json(
    { error: { code: auth.code, message: auth.message } },
    { status: auth.status, headers: { "Cache-Control": "no-store" } },
  );
}

export function controlConfigured(): boolean {
  return Boolean(process.env.SWEEPER_CONTROL_KEY?.trim());
}
