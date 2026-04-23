-- Cloudflare D1 schema for mindshift-demo
-- JSON-style fields (scope, constraints) are stored as TEXT.

CREATE TABLE IF NOT EXISTS authorities (
  decision_id TEXT PRIMARY KEY,
  owner TEXT,
  intent TEXT,
  scope TEXT,
  constraints TEXT,
  status TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS executions (
  execution_id TEXT PRIMARY KEY,
  decision_id TEXT,
  intent TEXT,
  webhook_url TEXT,
  upstream_status INTEGER,
  status TEXT,
  timestamp TEXT
);

CREATE TABLE IF NOT EXISTS proofs (
  proof_id TEXT PRIMARY KEY,
  execution_id TEXT,
  decision_id TEXT,
  surface TEXT,
  proof_reference TEXT,
  status TEXT,
  timestamp TEXT
);
