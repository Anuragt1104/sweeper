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
import type { Fill, PortfolioView } from "@/lib/agents/types";

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

export interface EquityPoint {
  seq: number;
  tsMs: number;
  equity: number;
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
  readonly curve: EquityPoint[] = [];

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
    this.turnover += fill.price * fill.size;

    if (p.net === 0 || sign(p.net) === sign(signed)) {
      // opening or increasing in the same direction → update VWAP
      const newAbs = Math.abs(p.net) + Math.abs(signed);
      p.avg = (p.avg * Math.abs(p.net) + fill.price * Math.abs(signed)) / (newAbs || 1);
      p.net += signed;
      return;
    }

    // reducing / closing / flipping
    const closeQty = Math.min(Math.abs(signed), Math.abs(p.net));
    const pnl = p.net > 0 ? closeQty * (fill.price - p.avg) : closeQty * (p.avg - fill.price);
    p.realized += pnl;
    this.totalCloses += 1;
    if (pnl > 0) this.winningCloses += 1;

    const remaining = Math.abs(signed) - closeQty;
    p.net += signed;
    if (remaining > 0) {
      // flipped through zero → new position at the fill price
      p.avg = fill.price;
    }
    if (p.net === 0) p.avg = 0;
  }

  /** Update the mark for one selection (fair prob). */
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

  /** Record an equity-curve point and update drawdown. */
  snapshot(seq: number, tsMs: number) {
    const eq = this.equity();
    this.peakEquity = Math.max(this.peakEquity, eq);
    this.maxDD = Math.max(this.maxDD, this.peakEquity - eq);
    this.curve.push({ seq, tsMs, equity: round2(eq) });
  }

  /** Settle every open position at its payout (1 winner / 0 loser). */
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
