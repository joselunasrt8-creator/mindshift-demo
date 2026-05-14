CREATE TABLE IF NOT EXISTS legitimacy_quarantine_registry (
  quarantine_id TEXT PRIMARY KEY,
  quarantine_hash TEXT NOT NULL,
  containment_hash TEXT NOT NULL,
  lineage_hash TEXT NOT NULL,
  federation_hash TEXT NOT NULL,
  boundary_hash TEXT NOT NULL,
  classification TEXT NOT NULL CHECK (classification IN ('RECURSIVE_QUARANTINE_ACTIVE','FEDERATED_CONTAINMENT_REQUIRED','LINEAGE_TRUST_ISOLATED','TOPOLOGY_ANCESTRY_QUARANTINED','DOWNSTREAM_COORDINATION_RESTRICTED','MERGE_TRUST_COLLAPSED','PROOF_TRUST_CONTAINED','GOVERNANCE_CONTAMINATION_EXPANDED','CONTAINMENT_BOUNDARY_OVERFLOW','NULL')),
  quarantine_object TEXT NOT NULL,
  containment_boundary TEXT NOT NULL,
  isolation_graph TEXT NOT NULL,
  federated_containment TEXT NOT NULL,
  propagation_envelope TEXT NOT NULL,
  verdict_object TEXT NOT NULL,
  evidence_only TEXT NOT NULL CHECK (evidence_only='true'),
  replay_neutral TEXT NOT NULL CHECK (replay_neutral='true'),
  mutation_capable TEXT NOT NULL CHECK (mutation_capable='false'),
  read_only TEXT NOT NULL CHECK (read_only='true'),
  creates_authority TEXT NOT NULL CHECK (creates_authority='false'),
  executable TEXT NOT NULL CHECK (executable='false'),
  deployment_capable TEXT NOT NULL CHECK (deployment_capable='false'),
  proof_generating TEXT NOT NULL CHECK (proof_generating='false'),
  fail_closed_on_ambiguity TEXT NOT NULL CHECK (fail_closed_on_ambiguity='true'),
  quarantine_authoritative TEXT NOT NULL CHECK (quarantine_authoritative='false'),
  generated_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_legitimacy_quarantine_registry_quarantine_hash
  ON legitimacy_quarantine_registry (quarantine_hash);

CREATE INDEX IF NOT EXISTS idx_legitimacy_quarantine_registry_containment_hash
  ON legitimacy_quarantine_registry (containment_hash);

CREATE INDEX IF NOT EXISTS idx_legitimacy_quarantine_registry_lineage_hash
  ON legitimacy_quarantine_registry (lineage_hash);

CREATE INDEX IF NOT EXISTS idx_legitimacy_quarantine_registry_federation_hash
  ON legitimacy_quarantine_registry (federation_hash);

CREATE INDEX IF NOT EXISTS idx_legitimacy_quarantine_registry_boundary_hash
  ON legitimacy_quarantine_registry (boundary_hash);

CREATE INDEX IF NOT EXISTS idx_legitimacy_quarantine_registry_classification
  ON legitimacy_quarantine_registry (classification);

CREATE TRIGGER IF NOT EXISTS trg_legitimacy_quarantine_registry_no_update
BEFORE UPDATE ON legitimacy_quarantine_registry
BEGIN
  SELECT RAISE(ABORT, 'legitimacy_quarantine_registry is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_legitimacy_quarantine_registry_no_delete
BEFORE DELETE ON legitimacy_quarantine_registry
BEGIN
  SELECT RAISE(ABORT, 'legitimacy_quarantine_registry is append-only');
END;
