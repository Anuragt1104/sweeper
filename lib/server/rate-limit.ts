const WINDOW_MS = 60_000;
const LIMIT = 10;

interface Bucket {
  startedAtMs: number;
  count: number;
}

const globalBuckets = globalThis as unknown as { __sweeperMutationBuckets?: Map<string, Bucket> };

export function mutationRateLimit(request: Request, nowMs = Date.now()): Response | null {
  const buckets = globalBuckets.__sweeperMutationBuckets ??= new Map();
  const key = forwardedClientIp(request);
  const existing = buckets.get(key);
  const bucket = !existing || nowMs - existing.startedAtMs >= WINDOW_MS
    ? { startedAtMs: nowMs, count: 0 }
    : existing;
  bucket.count += 1;
  buckets.set(key, bucket);
  if (bucket.count <= LIMIT) return null;
  const retryAfter = Math.max(1, Math.ceil((bucket.startedAtMs + WINDOW_MS - nowMs) / 1000));
  return Response.json(
    { error: { code: "RATE_LIMITED", message: "Mutation limit is 10 requests per minute per client IP" } },
    { status: 429, headers: { "Retry-After": String(retryAfter), "Cache-Control": "no-store" } },
  );
}

function forwardedClientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")?.trim()
    || "unknown";
}

export { LIMIT as MUTATION_RATE_LIMIT, WINDOW_MS as MUTATION_RATE_WINDOW_MS };
