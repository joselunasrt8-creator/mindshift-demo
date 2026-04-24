CREATE TABLE IF NOT EXISTS authorities (
  decision_id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  intent TEXT NOT NULL,
  scope TEXT NOT NULL,
  constraints TEXT NOT NULL,
  expiry TEXT,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS compile_registry (
  decision_id TEXT NOT NULL,
  aeo_hash TEXT NOT NULL,
  compiled_object_json TEXT NOT NULL,
  timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS validation_registry (
  validation_id TEXT PRIMARY KEY,
  decision_id TEXT NOT NULL,
  aeo_hash TEXT NOT NULL,
  result TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  validated_object_hash TEXT
);

CREATE TABLE IF NOT EXISTS execution_registry (
  execution_id TEXT PRIMARY KEY,
  decision_id TEXT NOT NULL,
  aeo_hash TEXT NOT NULL,
  status TEXT NOT NULL,
  github_run_id TEXT,
  commit_sha TEXT,
  workflow_name TEXT,
  timestamp TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS proof_registry (
  proof_id TEXT PRIMARY KEY,
  execution_id TEXT NOT NULL,
  decision_id TEXT NOT NULL,
  proof_reference TEXT NOT NULL,
  timestamp TEXT NOT NULL
);
