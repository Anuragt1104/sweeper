import { Controls } from 'sweeper';

const fixtures = [
  { id: 'arg-fra', home: 'Argentina', away: 'France', homeCode: 'ARG', awayCode: 'FRA', stage: 'Final', status: 'live' },
  { id: 'bra-ger', home: 'Brazil', away: 'Germany', homeCode: 'BRA', awayCode: 'GER', stage: 'Semi-final', status: 'scheduled' },
  { id: 'esp-ned', home: 'Spain', away: 'Netherlands', homeCode: 'ESP', awayCode: 'NED', stage: 'Quarter-final', status: 'scheduled' },
];

/** Idle — ready to start a session; anchoring not yet configured. */
export function Idle() {
  return <Controls fixtures={fixtures} status="idle" anchorReady={false} />;
}

/** Running — Stop enabled, anchoring available. */
export function Running() {
  return <Controls fixtures={fixtures} status="running" anchorReady={true} />;
}
