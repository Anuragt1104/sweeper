import { SentinelFeed } from 'sweeper';

const signals = [
  {
    id: 'outlier_print:142:mr_home',
    kind: 'outlier_print' as const,
    severity: 'critical' as const,
    confidence: 0.94,
    action: 'HOLD',
    message: 'Match-result Home printed 1.62 vs robust reference 2.10 — single-book outlier, 5.1σ.',
  },
  {
    id: 'sharp_move:138:over25',
    kind: 'sharp_move' as const,
    severity: 'warning' as const,
    confidence: 0.88,
    action: 'WIDEN_SPREAD',
    message: 'Over 2.5 repriced 3.3σ in 6s, corroborated across 4 books after the 67′ goal.',
  },
  {
    id: 'suspended:131:mr',
    kind: 'suspended' as const,
    severity: 'warning' as const,
    confidence: 0.99,
    action: 'SUSPEND_QUOTING',
    message: 'Match-result market withdrawn — book stopped pricing during the VAR check.',
  },
  {
    id: 'stale_line:119:btts',
    kind: 'stale_line' as const,
    severity: 'info' as const,
    confidence: 0.72,
    action: 'ALERT',
    message: 'BTTS line unchanged for 4m12s while the match produced two clear chances.',
  },
  {
    id: 'reopened:134:mr',
    kind: 'reopened' as const,
    severity: 'info' as const,
    confidence: 0.96,
    action: 'RESUME_QUOTING',
    message: 'Match-result reopened 0.9% wider after the goal was confirmed.',
  },
];

const counts = { sharp_move: 5, stale_line: 3, outlier_print: 1, suspended: 2, reopened: 2, settlement_hold: 0 };

/** A live sentinel stream — counts up top, severity-ranked signal cards below. */
export function LiveFeed() {
  return (
    <div style={{ width: 380 }}>
      <SentinelFeed signals={signals} counts={counts} />
    </div>
  );
}

/** The empty state, before any anomaly has fired. */
export function Quiet() {
  return (
    <div style={{ width: 380 }}>
      <SentinelFeed
        signals={[]}
        counts={{ sharp_move: 0, stale_line: 0, outlier_print: 0, suspended: 0, reopened: 0, settlement_hold: 0 }}
      />
    </div>
  );
}
