-- Distributed legitimacy interoperability is append-only, read-only evidence.
-- Remote legitimacy evidence never becomes local execution authority.
CREATE TABLE IF NOT EXISTS distributed_legitimacy_registry (
  envelope_id TEXT PRIMARY KEY,
  canonical_hash TEXT NOT NULL,
  lineage_root TEXT NOT NULL,
  continuity_id TEXT NOT NULL,
  reconciliation_id TEXT NOT NULL,
  federation_classification TEXT NOT NULL,
  replay_indicators TEXT NOT NULL,
  drift_indicators TEXT NOT NULL,
  evidence_only TEXT NOT NULL CHECK (evidence_only='true'),
  remote_authority_denied TEXT NOT NULL CHECK (remote_authority_denied='true'),
  read_only TEXT NOT NULL CHECK (read_only='true'),
  mutation_capable TEXT NOT NULL CHECK (mutation_capable='false'),
  replay_neutral TEXT NOT NULL CHECK (replay_neutral='true'),
  generated_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_distributed_legitimacy_registry_hash_unique
  ON distributed_legitimacy_registry(canonical_hash);

CREATE INDEX IF NOT EXISTS idx_distributed_legitimacy_registry_lineage
  ON distributed_legitimacy_registry(lineage_root, continuity_id, reconciliation_id);

CREATE TRIGGER IF NOT EXISTS trg_distributed_legitimacy_registry_no_update
BEFORE UPDATE ON distributed_legitimacy_registry
BEGIN
  SELECT RAISE(ABORT, 'distributed_legitimacy_registry is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_distributed_legitimacy_registry_no_delete
BEFORE DELETE ON distributed_legitimacy_registry
BEGIN
  SELECT RAISE(ABORT, 'distributed_legitimacy_registry is append-only');
END;

CREATE TABLE IF NOT EXISTS federated_checkpoint_registry (
  checkpoint_envelope_id TEXT PRIMARY KEY,
  checkpoint_id TEXT NOT NULL,
  canonical_hash TEXT NOT NULL,
  lineage_root TEXT NOT NULL,
  continuity_id TEXT NOT NULL,
  reconciliation_id TEXT NOT NULL,
  reconciliation_merkle_root TEXT NOT NULL,
  federation_classification TEXT NOT NULL,
  replay_indicators TEXT NOT NULL,
  drift_indicators TEXT NOT NULL,
  evidence_only TEXT NOT NULL CHECK (evidence_only='true'),
  remote_authority_denied TEXT NOT NULL CHECK (remote_authority_denied='true'),
  read_only TEXT NOT NULL CHECK (read_only='true'),
  mutation_capable TEXT NOT NULL CHECK (mutation_capable='false'),
  replay_neutral TEXT NOT NULL CHECK (replay_neutral='true'),
  generated_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_federated_checkpoint_registry_hash_unique
  ON federated_checkpoint_registry(canonical_hash);

CREATE INDEX IF NOT EXISTS idx_federated_checkpoint_registry_lineage
  ON federated_checkpoint_registry(lineage_root, continuity_id, reconciliation_id);

CREATE TRIGGER IF NOT EXISTS trg_federated_checkpoint_registry_no_update
BEFORE UPDATE ON federated_checkpoint_registry
BEGIN
  SELECT RAISE(ABORT, 'federated_checkpoint_registry is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_federated_checkpoint_registry_no_delete
BEFORE DELETE ON federated_checkpoint_registry
BEGIN
  SELECT RAISE(ABORT, 'federated_checkpoint_registry is append-only');
END;
