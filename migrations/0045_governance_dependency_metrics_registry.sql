CREATE TABLE IF NOT EXISTS governance_dependency_metrics_registry (
  metric_id TEXT PRIMARY KEY,
  metric_key TEXT NOT NULL CHECK (metric_key IN (
    'governance_dependency_ratio',
    'fail_closed_interception_ratio',
    'proof_attachment_ratio',
    'replay_rejection_ratio',
    'continuity_integrity_ratio',
    'distributed_governance_participation_ratio'
  )),
  surface_id TEXT,
  organization_id TEXT,
  runtime_id TEXT,
  policy_version TEXT,
  deployment_target TEXT,
  time_window TEXT NOT NULL CHECK (time_window IN ('hourly','daily','weekly','monthly')),
  governance_layer TEXT,
  validator_version TEXT,
  numerator INTEGER NOT NULL,
  denominator INTEGER NOT NULL,
  ratio_value REAL NOT NULL,
  evidence_only TEXT NOT NULL CHECK (evidence_only='true'),
  non_authoritative TEXT NOT NULL CHECK (non_authoritative='true'),
  creates_execution_permission TEXT NOT NULL CHECK (creates_execution_permission='false'),
  computed_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_governance_dependency_metrics_key_window
  ON governance_dependency_metrics_registry(metric_key, time_window, computed_at);

CREATE INDEX IF NOT EXISTS idx_governance_dependency_metrics_surface
  ON governance_dependency_metrics_registry(surface_id, organization_id, runtime_id);

CREATE TRIGGER IF NOT EXISTS trg_governance_dependency_metrics_registry_no_update
BEFORE UPDATE ON governance_dependency_metrics_registry
BEGIN
  SELECT RAISE(ABORT, 'governance_dependency_metrics_registry is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_governance_dependency_metrics_registry_no_delete
BEFORE DELETE ON governance_dependency_metrics_registry
BEGIN
  SELECT RAISE(ABORT, 'governance_dependency_metrics_registry is append-only');
END;
