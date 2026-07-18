/**
 * Odds multi-view extraction from TxLINE odds only (never invents prices).
 */
import type { OddsMarket, OddsSnapshot } from "@/lib/txline/types";
import type { OddsViewId, OddsViewPoint, OddsViewSeries } from "@/lib/tempo/types";
import { ODDS_VIEW_LABELS, ODDS_VIEW_ORDER, emptyOddsViews } from "@/lib/tempo/types";
import { HYBRID_BLEND } from "@/lib/tempo/hybrid";

export interface ShortTermFavorite {
  source: "next_score" | "match_1x2" | null;
  key: string | null;
  prob: number;
}

export function extractOddsViews(
  odds: OddsSnapshot,
  minute: number,
  previousFavorite: ShortTermFavorite | null,
  favoriteHistory: { minute: number; prob: number }[],
): { views: Record<OddsViewId, OddsViewSeries>; available: OddsViewId[]; favorite: ShortTermFavorite } {
  const views = emptyOddsViews();
  const available: OddsViewId[] = [];

  const nextScore = findMarket(odds, "next_team_to_score");
  if (nextScore) {
    available.push("next_score");
    views.next_score = {
      id: "next_score",
      label: ODDS_VIEW_LABELS.next_score,
      available: true,
      points: [pointFromMarket(minute, nextScore)],
    };
  }

  const ou = findMarket(odds, "total_goals", 2.5);
  if (ou) {
    available.push("ou_25");
    views.ou_25 = {
      id: "ou_25",
      label: ODDS_VIEW_LABELS.ou_25,
      available: true,
      points: [pointFromMarket(minute, ou)],
    };
  }

  const oneXTwo = findMarket(odds, "match_result");
  if (oneXTwo) {
    available.push("match_1x2");
    views.match_1x2 = {
      id: "match_1x2",
      label: ODDS_VIEW_LABELS.match_1x2,
      available: true,
      points: [pointFromMarket(minute, oneXTwo)],
    };
  }

  const corners = findMarket(odds, "total_corners");
  if (corners) {
    available.push("corners_ou");
    views.corners_ou = {
      id: "corners_ou",
      label: ODDS_VIEW_LABELS.corners_ou,
      available: true,
      points: [pointFromMarket(minute, corners)],
    };
  }

  const favorite = shortTermFavorite(odds);
  const delta = favoriteDelta(favorite, favoriteHistory);
  available.push("swing");
  views.swing = {
    id: "swing",
    label: ODDS_VIEW_LABELS.swing,
    available: favorite.source != null,
    points:
      favorite.source != null
        ? [
            {
              minute,
              selections: [],
              favorite: favorite.key === "home" || favorite.key === "away" ? favorite.key : "none",
              favoriteProb: favorite.prob,
              delta,
            },
          ]
        : [],
  };

  void previousFavorite;
  void ODDS_VIEW_ORDER;
  return { views, available: available.filter((id) => views[id].available), favorite };
}

export function shortTermFavorite(odds: OddsSnapshot): ShortTermFavorite {
  const next = findMarket(odds, "next_team_to_score");
  if (next) {
    const best = maxSelection(next);
    return { source: "next_score", key: best?.key ?? null, prob: best?.impliedProb ?? 0 };
  }
  const oneXTwo = findMarket(odds, "match_result");
  if (oneXTwo) {
    const homeAway = oneXTwo.selections.filter((s) => s.key === "home" || s.key === "away");
    const best = homeAway.sort((a, b) => b.impliedProb - a.impliedProb)[0];
    return { source: "match_1x2", key: best?.key ?? null, prob: best?.impliedProb ?? 0 };
  }
  return { source: null, key: null, prob: 0 };
}

function favoriteDelta(
  favorite: ShortTermFavorite,
  history: { minute: number; prob: number }[],
): number {
  if (!favorite.source) return 0;
  const windowStart = (history[history.length - 1]?.minute ?? 0) - HYBRID_BLEND.oddsWindowMinutes;
  const prior = [...history].reverse().find((p) => p.minute <= windowStart);
  if (!prior) return 0;
  return favorite.prob - prior.prob;
}

function findMarket(odds: OddsSnapshot, type: OddsMarket["type"], line?: number): OddsMarket | undefined {
  return odds.markets.find((m) => {
    if (m.type !== type) return false;
    if (line == null) return true;
    return m.line == null || Math.abs(m.line - line) < 0.01;
  });
}

function pointFromMarket(minute: number, market: OddsMarket): OddsViewPoint {
  return {
    minute,
    selections: market.selections.map((s) => ({
      key: s.key,
      label: s.label,
      prob: s.impliedProb,
    })),
  };
}

function maxSelection(market: OddsMarket) {
  return [...market.selections].sort((a, b) => b.impliedProb - a.impliedProb)[0];
}

export function mergeViewPoint(
  series: OddsViewSeries,
  point: OddsViewPoint,
  maxPoints = 200,
): OddsViewSeries {
  const points = [...series.points];
  const last = points[points.length - 1];
  if (last && last.minute === point.minute) {
    points[points.length - 1] = point;
  } else {
    points.push(point);
  }
  if (points.length > maxPoints) points.splice(0, points.length - maxPoints);
  return { ...series, available: true, points };
}
