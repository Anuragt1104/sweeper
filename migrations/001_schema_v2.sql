CREATE TABLE IF NOT EXISTS sweeper_sessions (
  session_id text PRIMARY KEY,
  schema_version integer NOT NULL CHECK (schema_version = 2),
  fixture_id text NOT NULL,
  competition_id text,
  provenance text NOT NULL,
  execution_mode text NOT NULL,
  configuration jsonb NOT NULL,
  artifact_hash text NOT NULL,
  status text NOT NULL,
  started_at_ms bigint NOT NULL,
  completed_at_ms bigint,
  latest_state jsonb,
  ledger_root text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sweeper_ingested_ticks (
  id bigserial PRIMARY KEY,
  session_id text NOT NULL REFERENCES sweeper_sessions(session_id) ON DELETE CASCADE,
  fixture_id text NOT NULL,
  schema_version integer NOT NULL CHECK (schema_version = 2),
  idempotency_hash text NOT NULL,
  tick jsonb NOT NULL,
  upstream_score_seq bigint,
  score_event_id text,
  odds_event_id text,
  processed_at_ms bigint NOT NULL,
  processing_status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE (session_id, idempotency_hash)
);

CREATE INDEX IF NOT EXISTS sweeper_ticks_session_id_idx
  ON sweeper_ingested_ticks(session_id, id);

CREATE TABLE IF NOT EXISTS sweeper_stream_cursors (
  fixture_id text NOT NULL,
  stream_kind text NOT NULL CHECK (stream_kind IN ('score', 'odds')),
  last_event_id text NOT NULL,
  reconnect_count integer NOT NULL DEFAULT 0,
  updated_at_ms bigint NOT NULL,
  PRIMARY KEY (fixture_id, stream_kind)
);

CREATE TABLE IF NOT EXISTS sweeper_proof_receipts (
  id bigserial PRIMARY KEY,
  session_id text NOT NULL REFERENCES sweeper_sessions(session_id) ON DELETE CASCADE,
  fixture_id text NOT NULL,
  final_sequence bigint NOT NULL,
  stat_keys integer[] NOT NULL,
  response_hash text NOT NULL,
  root_pda text NOT NULL,
  verified boolean NOT NULL,
  failure_code text,
  receipt jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sweeper_ledger_anchors (
  id bigserial PRIMARY KEY,
  session_id text NOT NULL REFERENCES sweeper_sessions(session_id) ON DELETE CASCADE,
  local_root text NOT NULL,
  network text NOT NULL,
  signature text NOT NULL,
  explorer_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sweeper_schema_migrations (
  name text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
