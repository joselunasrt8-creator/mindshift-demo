CREATE TABLE IF NOT EXISTS authorities (
  decision_id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  intent TEXT NOT NULL,
  scope TEXT NOT NULL,
  constraints TEXT NOT NULL,
  expiry TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS compile_registry (
  compile_id TEXT PRIMARY KEY,
  decision_id TEXT NOT NULL,
  aeo TEXT NOT NULL,
  object_hash TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_compile_registry_decision_id
  ON compile_registry (decision_id);

CREATE TABLE IF NOT EXISTS validation_registry (
  validation_id TEXT PRIMARY KEY,
  decision_id TEXT NOT NULL,
  validator_result TEXT NOT NULL,
  validated_object_hash TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_validation_registry_decision_id
  ON validation_registry (decision_id);

CREATE TABLE IF NOT EXISTS execution_registry (
  execution_id TEXT PRIMARY KEY,
  decision_id TEXT NOT NULL,
  system TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  validated_object_hash TEXT NOT NULL,
  executed_object_hash TEXT NOT NULL,
  github_run_id TEXT,
  commit_sha TEXT,
  workflow_name TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_execution_registry_decision_id
  ON execution_registry (decision_id);

CREATE TABLE IF NOT EXISTS proof_registry (
  proof_id TEXT PRIMARY KEY,
  execution_id TEXT NOT NULL,
  decision_id TEXT NOT NULL,
  github_run_id TEXT,
  commit_sha TEXT NOT NULL,
  workflow_name TEXT NOT NULL,
  proof_timestamp TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_proof_registry_decision_id
  ON proof_registry (decision_id);
