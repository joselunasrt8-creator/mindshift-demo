-- Issues #890-#893: governed deployment legitimacy spine
-- deployment_provenance_registry, deployment_proof_registry, deployment_rollback_registry

CREATE TABLE IF NOT EXISTS deployment_provenance_registry (
  provenance_id TEXT PRIMARY KEY,
  proof_id TEXT NOT NULL,
  commit_sha TEXT NOT NULL,
  workflow_hash TEXT NOT NULL,
  artifact_hash TEXT NOT NULL,
  deploy_actor TEXT NOT NULL,
  deployment_timestamp TEXT NOT NULL,
  environment_classification TEXT NOT NULL,
  deployment_proof_id TEXT,
  append_only TEXT NOT NULL CHECK (append_only='true'),
  immutable TEXT NOT NULL CHECK (immutable='true'),
  created_at TEXT NOT NULL,
  UNIQUE(proof_id),
  UNIQUE(commit_sha, workflow_hash, artifact_hash, environment_classification)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_deployment_provenance_registry_proof_unique
  ON deployment_provenance_registry(proof_id);

CREATE TRIGGER IF NOT EXISTS trg_deployment_provenance_registry_no_update
BEFORE UPDATE ON deployment_provenance_registry
BEGIN
  SELECT RAISE(ABORT, 'deployment_provenance_registry is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_deployment_provenance_registry_no_delete
BEFORE DELETE ON deployment_provenance_registry
BEGIN
  SELECT RAISE(ABORT, 'deployment_provenance_registry is append-only');
END;

CREATE TABLE IF NOT EXISTS deployment_proof_registry (
  deployment_proof_id TEXT PRIMARY KEY,
  provenance_id TEXT NOT NULL,
  proof_id TEXT NOT NULL,
  commit_sha TEXT NOT NULL,
  workflow_hash TEXT NOT NULL,
  artifact_hash TEXT NOT NULL,
  environment_classification TEXT NOT NULL,
  proof_hash TEXT NOT NULL,
  append_only TEXT NOT NULL CHECK (append_only='true'),
  immutable TEXT NOT NULL CHECK (immutable='true'),
  created_at TEXT NOT NULL,
  UNIQUE(proof_id),
  UNIQUE(proof_hash)
);

CREATE TRIGGER IF NOT EXISTS trg_deployment_proof_registry_no_update
BEFORE UPDATE ON deployment_proof_registry
BEGIN
  SELECT RAISE(ABORT, 'deployment_proof_registry is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_deployment_proof_registry_no_delete
BEFORE DELETE ON deployment_proof_registry
BEGIN
  SELECT RAISE(ABORT, 'deployment_proof_registry is append-only');
END;

CREATE TABLE IF NOT EXISTS deployment_rollback_registry (
  rollback_id TEXT PRIMARY KEY,
  prior_proof_id TEXT NOT NULL,
  prior_deployment_proof_id TEXT NOT NULL,
  commit_sha TEXT NOT NULL,
  workflow_hash TEXT NOT NULL,
  artifact_hash TEXT NOT NULL,
  rollback_lineage_hash TEXT NOT NULL,
  environment_classification TEXT NOT NULL,
  append_only TEXT NOT NULL CHECK (append_only='true'),
  immutable TEXT NOT NULL CHECK (immutable='true'),
  created_at TEXT NOT NULL,
  UNIQUE(rollback_lineage_hash)
);

CREATE TRIGGER IF NOT EXISTS trg_deployment_rollback_registry_no_update
BEFORE UPDATE ON deployment_rollback_registry
BEGIN
  SELECT RAISE(ABORT, 'deployment_rollback_registry is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_deployment_rollback_registry_no_delete
BEFORE DELETE ON deployment_rollback_registry
BEGIN
  SELECT RAISE(ABORT, 'deployment_rollback_registry is append-only');
END;
