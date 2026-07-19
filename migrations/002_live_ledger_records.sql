CREATE TABLE IF NOT EXISTS sweeper_ledger_records (
  session_id text NOT NULL REFERENCES sweeper_sessions(session_id) ON DELETE CASCADE,
  seq bigint NOT NULL,
  tick_seq bigint NOT NULL,
  ts_ms bigint NOT NULL,
  kind text NOT NULL,
  summary text NOT NULL,
  payload jsonb NOT NULL,
  reacted_to_hash text,
  record_hash text NOT NULL,
  canonical_leaf text NOT NULL,
  leaf_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, seq)
);

CREATE INDEX IF NOT EXISTS sweeper_ledger_records_hash_idx
  ON sweeper_ledger_records(record_hash);

CREATE INDEX IF NOT EXISTS sweeper_ledger_records_reacted_to_hash_idx
  ON sweeper_ledger_records(reacted_to_hash)
  WHERE reacted_to_hash IS NOT NULL;
