import { QualityGauge } from 'sweeper';

/** Healthy market — score in the green band. */
export function Healthy() {
  return <QualityGauge value={82} />;
}

/** Degraded — amber band, e.g. during a stale-line stretch. */
export function Degraded() {
  return <QualityGauge value={58} />;
}

/** Critical — red band, market under suspension/outlier stress. */
export function Critical() {
  return <QualityGauge value={31} />;
}
