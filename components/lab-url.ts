const LAB_QUERY_KEYS = ["lab", "demo", "contract", "advanced", "rail"] as const;

export function ensureLabSurface(url: URL): void {
  if (!LAB_QUERY_KEYS.some((key) => url.searchParams.has(key))) url.searchParams.set("lab", "live");
}
