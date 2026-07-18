/**
 * Optional API-Football tempo enrichment.
 *
 * Polls fixture statistics for Total Shots / Shots on Goal. Never used for
 * Horizon settlement. Requires API_FOOTBALL_KEY (or APISPORTS_KEY).
 *
 * Free tier is ~100 req/day — poll only the active fixture at a slow cadence.
 */
import type { Fixture } from "@/lib/txline/types";
import type { TempoSnapshot } from "@/lib/tempo/types";

const BASE = process.env.API_FOOTBALL_BASE_URL ?? "https://v3.football.api-sports.io";

export function apiFootballConfigured(): boolean {
  return Boolean(process.env.API_FOOTBALL_KEY || process.env.APISPORTS_KEY);
}

function apiKey(): string {
  return process.env.API_FOOTBALL_KEY || process.env.APISPORTS_KEY || "";
}

interface ApiFixtureRow {
  fixture: { id: number; date: string; status: { short: string; elapsed: number | null } };
  teams: { home: { id: number; name: string }; away: { id: number; name: string } };
}

interface ApiStatRow {
  team: { id: number; name: string };
  statistics: { type: string; value: number | string | null }[];
}

export async function resolveApiFootballFixtureId(fixture: Fixture): Promise<number | null> {
  const key = apiKey();
  if (!key) return null;

  const kickoff = new Date(fixture.kickoff);
  const date = Number.isNaN(kickoff.getTime())
    ? new Date().toISOString().slice(0, 10)
    : kickoff.toISOString().slice(0, 10);

  const url = new URL(`${BASE}/fixtures`);
  url.searchParams.set("date", date);

  const rows = await fetchJson<{ response: ApiFixtureRow[] }>(url.toString(), key);
  const candidates = rows.response ?? [];
  if (candidates.length === 0) return null;

  const scored = candidates
    .map((row) => ({
      id: row.fixture.id,
      score:
        nameScore(fixture.home.name, row.teams.home.name) +
        nameScore(fixture.away.name, row.teams.away.name),
      elapsed: row.fixture.status.elapsed,
    }))
    .filter((row) => row.score >= 1.2)
    .sort((a, b) => b.score - a.score);

  return scored[0]?.id ?? null;
}

export async function fetchTempoSnapshot(
  fixture: Fixture,
  apiFixtureId: number,
  minuteHint?: number,
): Promise<TempoSnapshot | null> {
  const key = apiKey();
  if (!key) return null;

  const url = `${BASE}/fixtures/statistics?fixture=${apiFixtureId}`;
  const rows = await fetchJson<{ response: ApiStatRow[] }>(url, key);
  const response = rows.response ?? [];
  if (response.length < 2) return null;

  const homeRow =
    response.find((r) => nameScore(fixture.home.name, r.team.name) >= nameScore(fixture.away.name, r.team.name)) ??
    response[0];
  const awayRow = response.find((r) => r.team.id !== homeRow.team.id) ?? response[1];

  const shotsHome = readStat(homeRow, ["Total Shots", "Shots Total", "shots"]);
  const shotsAway = readStat(awayRow, ["Total Shots", "Shots Total", "shots"]);
  const sotHome = readStat(homeRow, ["Shots on Goal", "Shots on Target", "shots on target"]);
  const sotAway = readStat(awayRow, ["Shots on Goal", "Shots on Target", "shots on target"]);

  return {
    fixtureId: fixture.id,
    minute: minuteHint ?? 0,
    tsMs: Date.now(),
    counts: {
      shots: { home: shotsHome, away: shotsAway },
      sot: { home: sotHome, away: sotAway },
    },
    source: "api-football",
  };
}

async function fetchJson<T>(url: string, key: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      "x-apisports-key": key,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`API-Football ${res.status}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

function readStat(row: ApiStatRow, names: string[]): number {
  const lowered = names.map((n) => n.toLowerCase());
  for (const stat of row.statistics ?? []) {
    if (lowered.includes(stat.type.toLowerCase())) {
      const v = stat.value;
      if (v == null) return 0;
      if (typeof v === "number") return v;
      const n = Number(String(v).replace("%", ""));
      return Number.isFinite(n) ? n : 0;
    }
  }
  return 0;
}

/** Soft team-name similarity in [0, 1]. */
export function nameScore(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.85;
  const ta = new Set(na.split(" "));
  const tb = new Set(nb.split(" "));
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = ta.size + tb.size - inter || 1;
  return inter / union;
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\b(fc|cf|sc|ac|afc|club|de|the)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
