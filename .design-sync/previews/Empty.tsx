import { Empty } from 'sweeper';

/** The placeholder shown in a panel that has no data yet. */
export function AwaitingFeed() {
  return <Empty label="Awaiting feed…" />;
}

/** A different empty message. */
export function NoSignals() {
  return <Empty label="No signals yet" />;
}
