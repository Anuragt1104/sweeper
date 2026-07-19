/**
 * Per-agent portfolio + PnL accounting.
 *
 * Standard signed-position bookkeeping over probability contracts:
 *  - increasing a position updates the volume-weighted average entry price,
 *  - reducing/closing realizes PnL against that average,
 *  - settlement closes everything at the contract's payout (1 for the winning
 *    selection, 0 otherwise).
 *
 * Mark-to-market uses the model *fair* probability (the honest reference), so
 * the live equity curve reflects edge, not the noise/anomalies on the wire.
 */
import type { Fill, PortfolioView, Side } from "@/lib/agents/types";

export interface Position {
  selId: string;
  marketType: string;
  selectionKey: string;
  net: number; // signed contracts
  avg: number; // VWAP entry (prob)
  realized: number;
  mark: number; // last fair prob
}

export interface PortfolioMetrics {
  agentId: string;
  equity: number;
  pnl: number;
  roi: number; // pnl / bankroll
  realized: number;
  unrealized: number;
  trades: number;
  turnover: number; // Σ price*size
  hitRate: number; // winning closes / total closes
  maxDrawdown: number;
  exposure: number; // Σ |net|*mark
}

/** Per underlying market (match_result / total_goals / …) attribution. */
export interface MarketPnLSlice {
  marketType: string;
  realized: number;
  unrealized: number;
  pnl: number;
  trades: number;
  exposure: number;
}

export interface EquityPoint {
  seq: number;
  tsMs: number;
  minute: number;
  equity: number;
}

/** Fill / decision marker aligned to an equity-curve index. */
export interface PortfolioMarker {
  index: number;
  seq: number;
  minute: number;
  side: Side;
  marketType: string;
  selectionKey: string;
  size: number;
  rationale: string;
}

export class Portfolio implements PortfolioView {
  readonly agentId: string;
  readonly bankroll: number;
  private pos = new Map<string, Position>();
  private trades = 0;
  private turnover = 0;
  private winningCloses = 0;
  private totalCloses = 0;
  private peakEquity: number;
  private maxDD = 0;
  private tradesByMarket = new Map<string, number>();
  readonly curve: EquityPoint[] = [];
  readonly markers: PortfolioMarker[] = [];

  constructor(agentId: string, bankroll: number) {
    this.agentId = agentId;
    this.bankroll = bankroll;
    this.peakEquity = bankroll;
  }

  private slot(selId: string, marketType: string, selectionKey: string): Position {
    let p = this.pos.get(selId);
    if (!p) {
      p = { selId, marketType, selectionKey, net: 0, avg: 0, realized: 0, mark: 0 };
      this.pos.set(selId, p);
    }
    return p;
  }

  applyFill(fill: Fill) {
    const p = this.slot(fill.selId, fill.marketType, fill.selectionKey);
    const signed = fill.side === "buy" ? fill.size : -fill.size;
    this.trades += 1;
    this.tradesByMarket.set(fill.marketType, (this.tradesByMarket.get(fill.marketType) ?? 0) + 1);
    this.turnover += fill.price * fill.size;

    if (p.net === 0 || sign(p.net) === sign(signed)) {
      const newAbs = Math.abs(p.net) + Math.abs(signed);
      p.avg = (p.avg * Math.abs(p.net) + fill.price * Math.abs(signed)) / (newAbs || 1);
      p.net += signed;
      return;
    }

    const closeQty = Math.min(Math.abs(signed), Math.abs(p.net));
    const pnl = p.net > 0 ? closeQty * (fill.price - p.avg) : closeQty * (p.avg - fill.price);
    p.realized += pnl;
    this.totalCloses += 1;
    if (pnl > 0) this.winningCloses += 1;

    const remaining = Math.abs(signed) - closeQty;
    p.net += signed;
    if (remaining > 0) {
      p.avg = fill.price;
    }
    if (p.net === 0) p.avg = 0;
  }

  /**
   * Record a fill marker after the equity snapshot for this tick so `index`
   * aligns with `curve[index]`.
   */
  recordMarker(opts: {
    seq: number;
    minute: number;
    side: Side;
    marketType: string;
    selectionKey: string;
    size: number;
    rationale: string;
  }) {
    const index = Math.max(0, this.curve.length - 1);
    this.markers.push({
      index,
      seq: opts.seq,
      minute: opts.minute,
      side: opts.side,
      marketType: opts.marketType,
      selectionKey: opts.selectionKey,
      size: opts.size,
      rationale: opts.rationale.slice(0, 120),
    });
    if (this.markers.length > 80) this.markers.splice(0, this.markers.length - 80);
  }

  mark(selId: string, prob: number) {
    const p = this.pos.get(selId);
    if (p) p.mark = prob;
  }

  net(selId: string): number {
    return this.pos.get(selId)?.net ?? 0;
  }
  avgPrice(selId: string): number {
    return this.pos.get(selId)?.avg ?? 0;
  }

  private unrealized(): number {
    let u = 0;
    for (const p of this.pos.values()) u += p.net * (p.mark - p.avg);
    return u;
  }
  private realizedTotal(): number {
    let r = 0;
    for (const p of this.pos.values()) r += p.realized;
    return r;
  }

  equity(): number {
    return this.bankroll + this.realizedTotal() + this.unrealized();
  }

  snapshot(seq: number, tsMs: number, minute: number) {
    const eq = this.equity();
    this.peakEquity = Math.max(this.peakEquity, eq);
    this.maxDD = Math.max(this.maxDD, this.peakEquity - eq);
    this.curve.push({ seq, tsMs, minute, equity: round2(eq) });
  }

  settle(outcomes: Map<string, 0 | 1>) {
    for (const p of this.pos.values()) {
      if (p.net === 0) continue;
      const payout = outcomes.get(p.selId) ?? 0;
      const pnl = p.net * (payout - p.avg);
      p.realized += pnl;
      this.totalCloses += 1;
      if (pnl > 0) this.winningCloses += 1;
      p.mark = payout;
      p.net = 0;
      p.avg = 0;
    }
  }

  positions(): Position[] {
    return [...this.pos.values()].filter((p) => p.net !== 0 || p.realized !== 0);
  }

  marketSlice(marketType: string): MarketPnLSlice {
    let realized = 0;
    let unrealized = 0;
    let exposure = 0;
    for (const p of this.pos.values()) {
      if (p.marketType !== marketType) continue;
      realized += p.realized;
      unrealized += p.net * (p.mark - p.avg);
      exposure += Math.abs(p.net) * p.mark;
    }
    return {
      marketType,
      realized: round2(realized),
      unrealized: round2(unrealized),
      pnl: round2(realized + unrealized),
      trades: this.tradesByMarket.get(marketType) ?? 0,
      exposure: round2(exposure),
    };
  }

  marketSlices(): MarketPnLSlice[] {
    const types = new Set<string>();
    for (const p of this.pos.values()) types.add(p.marketType);
    for (const t of this.tradesByMarket.keys()) types.add(t);
    return [...types].map((t) => this.marketSlice(t));
  }

  metrics(): PortfolioMetrics {
    const realized = round2(this.realizedTotal());
    const unrealized = round2(this.unrealized());
    const equity = round2(this.bankroll + realized + unrealized);
    let exposure = 0;
    for (const p of this.pos.values()) exposure += Math.abs(p.net) * p.mark;
    return {
      agentId: this.agentId,
      equity,
      pnl: round2(equity - this.bankroll),
      roi: round4((equity - this.bankroll) / this.bankroll),
      realized,
      unrealized,
      trades: this.trades,
      turnover: round2(this.turnover),
      hitRate: this.totalCloses ? round4(this.winningCloses / this.totalCloses) : 0,
      maxDrawdown: round2(this.maxDD),
      exposure: round2(exposure),
    };
  }
}

function sign(x: number): number {
  return x > 0 ? 1 : x < 0 ? -1 : 0;
}
function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
function round4(x: number): number {
  return Math.round(x * 10000) / 10000;
}
