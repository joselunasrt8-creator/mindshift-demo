-- Migration: 0048_finality_classification_registry
-- Purpose: Persist partition-finality state machine classifications for legitimacy objects.
-- Classification evidence ≠ execution authority. This table is evidence-only.
-- Append-only: no UPDATE or DELETE permitted.

CREATE TABLE IF NOT EXISTS finality_classification_registry (
  finality_classification_id           TEXT    NOT NULL PRIMARY KEY,
  object_hash                          TEXT    NOT NULL,
  object_type                          TEXT    NOT NULL
    CHECK(object_type IN ('authority','aeo','execution','proof','session','continuity','validation')),
  classification                       TEXT    NOT NULL
    CHECK(classification IN ('LOCAL_VALID','GLOBAL_VALID','AMBIGUOUS','STALE_VISIBLE','PARTITION_SUSPENDED','NULL')),
  predicate_snapshot_json              TEXT    NOT NULL,
  topology_visibility_snapshot_json    TEXT,
  continuity_id                        TEXT,
  authority_id                         TEXT,
  validation_id                        TEXT,
  proof_id                             TEXT,
  causal_clock_json                    TEXT,
  epoch_id                             TEXT,
  reason_code                          TEXT    NOT NULL,
  supersedes_classification_id         TEXT,
  created_at                           TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),

  has_quorum_evidence                  INTEGER NOT NULL DEFAULT 0
    CHECK(has_quorum_evidence IN (0,1)),
  has_global_consensus_evidence        INTEGER NOT NULL DEFAULT 0
    CHECK(has_global_consensus_evidence IN (0,1)),
  has_lineage_freshness_evidence       INTEGER NOT NULL DEFAULT 0
    CHECK(has_lineage_freshness_evidence IN (0,1)),
  has_cryptographic_integrity_evidence INTEGER NOT NULL DEFAULT 0
    CHECK(has_cryptographic_integrity_evidence IN (0,1)),

  raw_production_apply_path            TEXT    NOT NULL DEFAULT 'DENIED'
    CHECK(raw_production_apply_path = 'DENIED')
);

CREATE INDEX IF NOT EXISTS idx_fcr_object_hash
  ON finality_classification_registry(object_hash);

CREATE INDEX IF NOT EXISTS idx_fcr_supersedes
  ON finality_classification_registry(supersedes_classification_id)
  WHERE supersedes_classification_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fcr_created_at
  ON finality_classification_registry(created_at);

-- Append-only enforcement

CREATE TRIGGER IF NOT EXISTS fcr_no_update
  BEFORE UPDATE ON finality_classification_registry
BEGIN
  SELECT RAISE(ABORT, 'finality_classification_registry is append-only: UPDATE is forbidden');
END;

CREATE TRIGGER IF NOT EXISTS fcr_no_delete
  BEFORE DELETE ON finality_classification_registry
BEGIN
  SELECT RAISE(ABORT, 'finality_classification_registry is append-only: DELETE is forbidden');
END;

-- Supersession referential integrity: supersedes_classification_id must exist

CREATE TRIGGER IF NOT EXISTS fcr_supersedes_must_exist
  BEFORE INSERT ON finality_classification_registry
  WHEN NEW.supersedes_classification_id IS NOT NULL
BEGIN
  SELECT CASE
    WHEN (SELECT COUNT(*) FROM finality_classification_registry
          WHERE finality_classification_id = NEW.supersedes_classification_id) = 0
    THEN RAISE(ABORT, 'supersedes_classification_id references non-existent classification record')
  END;
END;

-- NULL is terminal: no supersession from a NULL-classified record

CREATE TRIGGER IF NOT EXISTS fcr_no_upgrade_from_null
  BEFORE INSERT ON finality_classification_registry
  WHEN NEW.supersedes_classification_id IS NOT NULL
BEGIN
  SELECT CASE
    WHEN (SELECT classification FROM finality_classification_registry
          WHERE finality_classification_id = NEW.supersedes_classification_id) = 'NULL'
    THEN RAISE(ABORT, 'NULL classification is terminal: supersession from NULL is forbidden')
  END;
END;

-- GLOBAL_VALID requires quorum and global consensus evidence flags

CREATE TRIGGER IF NOT EXISTS fcr_global_valid_requires_evidence
  BEFORE INSERT ON finality_classification_registry
  WHEN NEW.classification = 'GLOBAL_VALID'
BEGIN
  SELECT CASE
    WHEN NEW.has_quorum_evidence = 0 OR NEW.has_global_consensus_evidence = 0
    THEN RAISE(ABORT, 'GLOBAL_VALID classification requires has_quorum_evidence=1 and has_global_consensus_evidence=1')
  END;
END;

-- Proof linkage: if proof_id is provided it must reference a COMPLETED proof

CREATE TRIGGER IF NOT EXISTS fcr_proof_must_exist
  BEFORE INSERT ON finality_classification_registry
  WHEN NEW.proof_id IS NOT NULL
BEGIN
  SELECT CASE
    WHEN (SELECT COUNT(*) FROM proof_registry
          WHERE proof_id = NEW.proof_id
          AND status = 'COMPLETED') = 0
    THEN RAISE(ABORT, 'proof_id references non-existent or incomplete proof in proof_registry')
  END;
END;
