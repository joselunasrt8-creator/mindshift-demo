CREATE TABLE IF NOT EXISTS governance_observability_query_registry (
  query_id TEXT PRIMARY KEY,
  query_category TEXT NOT NULL CHECK (query_category IN (
    'execution_governance_trends',
    'invalid_execution_trends',
    'validator_rejection_trends',
    'continuity_failure_trends',
    'replay_rejection_trends',
    'proof_lineage_completeness',
    'deployment_governance_participation',
    'authority_source_distribution'
  )),
  aggregation_window TEXT NOT NULL CHECK (aggregation_window IN ('hourly','daily','weekly','monthly')),
  source_lineage_preserved TEXT NOT NULL CHECK (source_lineage_preserved='true'),
  validator_lineage_preserved TEXT NOT NULL CHECK (validator_lineage_preserved='true'),
  proof_lineage_preserved TEXT NOT NULL CHECK (proof_lineage_preserved='true'),
  policy_version_lineage_preserved TEXT NOT NULL CHECK (policy_version_lineage_preserved='true'),
  read_only TEXT NOT NULL CHECK (read_only='true'),
  evidence_only TEXT NOT NULL CHECK (evidence_only='true'),
  creates_authority TEXT NOT NULL CHECK (creates_authority='false'),
  triggers_execution TEXT NOT NULL CHECK (triggers_execution='false'),
  mutates_runtime TEXT NOT NULL CHECK (mutates_runtime='false'),
  query_hash TEXT NOT NULL,
  computed_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_governance_observability_query_category_window
  ON governance_observability_query_registry(query_category, aggregation_window, computed_at);

CREATE TRIGGER IF NOT EXISTS trg_governance_observability_query_registry_no_update
BEFORE UPDATE ON governance_observability_query_registry
BEGIN
  SELECT RAISE(ABORT, 'governance_observability_query_registry is read-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_governance_observability_query_registry_no_delete
BEFORE DELETE ON governance_observability_query_registry
BEGIN
  SELECT RAISE(ABORT, 'governance_observability_query_registry is read-only');
END;
