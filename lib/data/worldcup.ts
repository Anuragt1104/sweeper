/**
 * World Cup tournament dataset for the demo.
 *
 * 32 nations across 8 groups, with the full group stage generated as fixtures
 * plus knockout placeholders. In live mode this is replaced by TxLINE's
 * GET /api/fixtures/snapshot; in simulation mode it seeds the lobby and the
 * deterministic match engine. Kickoff times are anchored relative to "now" so
 * the Home screen always shows a realistic mix of finished / live / upcoming.
 */
import type { Fixture, Team } from "@/lib/txline/types";

interface RawTeam {
  name: string;
  code: string;
  flag: string;
  rating: number;
}

const GROUPS: Record<string, RawTeam[]> = {
  A: [
    { name: "Argentina", code: "ARG", flag: "🇦🇷", rating: 92 },
    { name: "Mexico", code: "MEX", flag: "🇲🇽", rating: 78 },
    { name: "Poland", code: "POL", flag: "🇵🇱", rating: 74 },
    { name: "Saudi Arabia", code: "KSA", flag: "🇸🇦", rating: 66 },
  ],
  B: [
    { name: "France", code: "FRA", flag: "🇫🇷", rating: 91 },
    { name: "Denmark", code: "DEN", flag: "🇩🇰", rating: 79 },
    { name: "Australia", code: "AUS", flag: "🇦🇺", rating: 70 },
    { name: "Tunisia", code: "TUN", flag: "🇹🇳", rating: 67 },
  ],
  C: [
    { name: "Spain", code: "ESP", flag: "🇪🇸", rating: 90 },
    { name: "Germany", code: "GER", flag: "🇩🇪", rating: 87 },
    { name: "Japan", code: "JPN", flag: "🇯🇵", rating: 77 },
    { name: "Costa Rica", code: "CRC", flag: "🇨🇷", rating: 64 },
  ],
  D: [
    { name: "Brazil", code: "BRA", flag: "🇧🇷", rating: 93 },
    { name: "Switzerland", code: "SUI", flag: "🇨🇭", rating: 78 },
    { name: "Serbia", code: "SRB", flag: "🇷🇸", rating: 75 },
    { name: "Cameroon", code: "CMR", flag: "🇨🇲", rating: 68 },
  ],
  E: [
    { name: "England", code: "ENG", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", rating: 89 },
    { name: "USA", code: "USA", flag: "🇺🇸", rating: 76 },
    { name: "Senegal", code: "SEN", flag: "🇸🇳", rating: 75 },
    { name: "Iran", code: "IRN", flag: "🇮🇷", rating: 66 },
  ],
  F: [
    { name: "Portugal", code: "POR", flag: "🇵🇹", rating: 90 },
    { name: "Uruguay", code: "URU", flag: "🇺🇾", rating: 80 },
    { name: "South Korea", code: "KOR", flag: "🇰🇷", rating: 74 },
    { name: "Ghana", code: "GHA", flag: "🇬🇭", rating: 69 },
  ],
  G: [
    { name: "Netherlands", code: "NED", flag: "🇳🇱", rating: 88 },
    { name: "Croatia", code: "CRO", flag: "🇭🇷", rating: 81 },
    { name: "Morocco", code: "MAR", flag: "🇲🇦", rating: 79 },
    { name: "Canada", code: "CAN", flag: "🇨🇦", rating: 71 },
  ],
  H: [
    { name: "Belgium", code: "BEL", flag: "🇧🇪", rating: 84 },
    { name: "Colombia", code: "COL", flag: "🇨🇴", rating: 80 },
    { name: "Nigeria", code: "NGA", flag: "🇳🇬", rating: 73 },
    { name: "Ecuador", code: "ECU", flag: "🇪🇨", rating: 72 },
  ],
};

const VENUES = [
  "MetLife Stadium, New Jersey",
  "SoFi Stadium, Los Angeles",
  "AT&T Stadium, Dallas",
  "Mercedes-Benz Stadium, Atlanta",
  "Hard Rock Stadium, Miami",
  "Lincoln Financial Field, Philadelphia",
  "Estadio Azteca, Mexico City",
  "BC Place, Vancouver",
  "Levi's Stadium, San Francisco Bay",
  "Arrowhead Stadium, Kansas City",
];

function teamFrom(raw: RawTeam, groupId: string): Team {
  return {
    id: raw.code.toLowerCase(),
    name: raw.name,
    code: raw.code,
    flag: raw.flag,
    rating: raw.rating,
    groupId,
  };
}

export function allTeams(): Team[] {
  const out: Team[] = [];
  for (const [g, teams] of Object.entries(GROUPS)) {
    for (const t of teams) out.push(teamFrom(t, g));
  }
  return out;
}

export function teamById(id: string): Team | undefined {
  return allTeams().find((t) => t.id === id);
}

// Round-robin pairings within a group of 4 (6 matches), ordered by matchday.
const ROUND_ROBIN: [number, number][][] = [
  [
    [0, 1],
    [2, 3],
  ],
  [
    [0, 2],
    [1, 3],
  ],
  [
    [0, 3],
    [1, 2],
  ],
];

let cachedFixtures: Fixture[] | null = null;

/**
 * Generate the full group stage. Kickoffs are anchored so that:
 *  - matchday 1 is "yesterday/earlier today" (mostly finished),
 *  - matchday 2 brackets "now" (a couple live, a couple upcoming today),
 *  - matchday 3 is in the coming days.
 * Status is derived from kickoff vs. now (the room engine overrides this live).
 */
export function getFixtures(now: Date = new Date()): Fixture[] {
  if (cachedFixtures) return cachedFixtures;

  const base = now.getTime();
  const HOUR = 3600_000;
  const fixtures: Fixture[] = [];
  let venueIdx = 0;

  const groupKeys = Object.keys(GROUPS);

  // matchday offsets (hours from now) for the first fixture of each matchday
  const matchdayBaseHours = [-26, -2, 46];

  for (let md = 0; md < ROUND_ROBIN.length; md++) {
    const pairings = ROUND_ROBIN[md];
    let withinMatchday = 0;
    for (let gi = 0; gi < groupKeys.length; gi++) {
      const g = groupKeys[gi];
      const teams = GROUPS[g].map((t) => teamFrom(t, g));
      for (const [hi, ai] of pairings) {
        // stagger fixtures across a matchday so a few bracket "now"
        const koHours = matchdayBaseHours[md] + withinMatchday * 1.5;
        withinMatchday++;
        const kickoff = new Date(base + koHours * HOUR);
        const status: Fixture["status"] =
          kickoff.getTime() < base - 2 * HOUR
            ? "finished"
            : kickoff.getTime() <= base + 0.25 * HOUR
              ? "live"
              : "scheduled";
        fixtures.push({
          id: `wc26-${g}-md${md + 1}-${teams[hi].code}-${teams[ai].code}`.toLowerCase(),
          competition: "FIFA World Cup 2026",
          stage: `Group ${g} · Matchday ${md + 1}`,
          groupId: g,
          home: teams[hi],
          away: teams[ai],
          kickoff: kickoff.toISOString(),
          venue: VENUES[venueIdx++ % VENUES.length],
          status,
        });
      }
    }
  }

  // sort by kickoff for a clean lobby
  fixtures.sort((a, b) => +new Date(a.kickoff) - +new Date(b.kickoff));
  cachedFixtures = fixtures;
  return fixtures;
}

export function fixtureById(id: string, now?: Date): Fixture | undefined {
  return getFixtures(now).find((f) => f.id === id);
}

/** A curated "featured" fixture that is in the live window right now. */
export function featuredFixtureId(now?: Date): string {
  const fx = getFixtures(now);
  const live = fx.find((f) => f.status === "live");
  return (live ?? fx[0]).id;
}
