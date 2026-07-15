import { ReplayLab } from 'sweeper';

const fixtures = [
  { id: 'arg-fra', home: 'Argentina', away: 'France', homeCode: 'ARG', awayCode: 'FRA', stage: 'Final', status: 'scheduled' },
  { id: 'bra-ger', home: 'Brazil', away: 'Germany', homeCode: 'BRA', awayCode: 'GER', stage: 'Semi-final', status: 'scheduled' },
  { id: 'esp-ned', home: 'Spain', away: 'Netherlands', homeCode: 'ESP', awayCode: 'NED', stage: 'Quarter-final', status: 'scheduled' },
];

/** The deterministic replay lab: fixture/seed pickers, anomaly toggles, and the run control. */
export function Default() {
  return (
    <div style={{ width: 760 }}>
      <ReplayLab fixtures={fixtures} />
    </div>
  );
}
