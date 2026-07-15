import { SettlementCard } from 'sweeper';

/** A verified settlement: proof-backed, markets resolved. */
export function Settled() {
  return (
    <SettlementCard
      settlement={{
        match: 'Argentina vs France',
        status: 'ok',
        finalScore: { home: 3, away: 3 },
        resolved: [
          { marketType: 'match_result', resolvedKey: 'draw', detail: '3–3 after 90′' },
          { marketType: 'total_goals', resolvedKey: 'over', detail: '6 goals > 2.5' },
        ],
        proof: {
          source: 'TxLINE stat feed',
          verified: true,
          endpoint: 'https://api.txline.io/v1/fixtures/arg-fra/result',
          statKeys: ['ft_score', 'goals_home', 'goals_away'],
          root: 'a1b2c3d4e5f6a7b8c9d0e1f2',
        },
      }}
    />
  );
}

/** A held settlement: result can't be verified from a signed proof yet. */
export function Held() {
  return (
    <SettlementCard
      settlement={{
        match: 'Brazil vs Germany',
        status: 'hold',
        reason: 'Result not yet verifiable from a signed proof — settlement on hold.',
        finalScore: { home: 1, away: 1 },
        resolved: [],
        proof: {
          source: 'TxLINE stat feed',
          verified: false,
          statKeys: ['ft_score'],
          root: '0000000000000000',
        },
      }}
    />
  );
}
