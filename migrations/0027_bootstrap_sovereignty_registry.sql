-- Bootstrap sovereignty registry: append-only, replay-neutral runtime initialization evidence.
CREATE TABLE IF NOT EXISTS bootstrap_sovereignty_registry (
  checkpoint_id TEXT PRIMARY KEY,
  manifest_hash TEXT NOT NULL,
  lineage_checkpoint_hash TEXT NOT NULL,
  deployment_lineage_root TEXT NOT NULL,
  bootstrap_trust_root_hash TEXT NOT NULL,
  initialization_order_hash TEXT NOT NULL,
  startup_dependency_graph_hash TEXT NOT NULL,
  startup_topology_hash TEXT NOT NULL,
  replay_neutrality_hash TEXT NOT NULL,
  conformance_status TEXT NOT NULL CHECK (conformance_status IN ('BOOTSTRAP_CONFORMANT','NULL')),
  drift_classes TEXT NOT NULL,
  evidence_only TEXT NOT NULL CHECK (evidence_only='true'),
  replay_neutral TEXT NOT NULL CHECK (replay_neutral='true'),
  mutation_capable TEXT NOT NULL CHECK (mutation_capable='false'),
  remote_authority_denied TEXT NOT NULL CHECK (remote_authority_denied='true'),
  read_only TEXT NOT NULL CHECK (read_only='true'),
  generated_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bootstrap_sovereignty_registry_manifest
  ON bootstrap_sovereignty_registry(manifest_hash, lineage_checkpoint_hash, conformance_status);

CREATE INDEX IF NOT EXISTS idx_bootstrap_sovereignty_registry_topology
  ON bootstrap_sovereignty_registry(deployment_lineage_root, bootstrap_trust_root_hash, startup_topology_hash);

CREATE TRIGGER IF NOT EXISTS trg_bootstrap_sovereignty_registry_no_update
BEFORE UPDATE ON bootstrap_sovereignty_registry
BEGIN
  SELECT RAISE(ABORT, 'bootstrap_sovereignty_registry is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_bootstrap_sovereignty_registry_no_delete
BEFORE DELETE ON bootstrap_sovereignty_registry
BEGIN
  SELECT RAISE(ABORT, 'bootstrap_sovereignty_registry is append-only');
END;
