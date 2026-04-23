CREATE TABLE IF NOT EXISTS authorities (
  decision_id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  intent TEXT NOT NULL,
  scope TEXT NOT NULL,
  constraints TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS executions (
  execution_id TEXT PRIMARY KEY,
  decision_id TEXT NOT NULL,
  intent TEXT NOT NULL,
  webhook_url TEXT NOT NULL,
  upstream_status INTEGER,
  status TEXT NOT NULL,
  timestamp TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS proofs (
  proof_id TEXT PRIMARY KEY,
  execution_id TEXT NOT NULL,
  decision_id TEXT NOT NULL,
  surface TEXT NOT NULL,
  proof_reference TEXT NOT NULL,
  status TEXT NOT NULL,
  timestamp TEXT NOT NULL
);
