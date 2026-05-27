-- Migration: 0059_topology_visibility_enforcement
-- Purpose: Persist topology visibility snapshot evidence for GLOBAL_VALID gating.
-- Slice I: Topology Visibility Enforcement.
-- Evidence-only: topology visibility ≠ legitimacy; snapshot evidence ≠ authority.
-- Append-only: no UPDATE or DELETE permitted on any row.
-- Anchor issue: #1408  Supporting: #1352, #1418, #1442, #1340, #1440, #1405

CREATE TABLE IF NOT EXISTS topology_visibility_snapshot_registry (
  topology_snapshot_id           TEXT    NOT NULL PRIMARY KEY,
  -- tsn_<sha256> — deterministic, unique per snapshot
  topology_snapshot_hash         TEXT    NOT NULL UNIQUE,
  -- Deterministic content hash (sort-normalized arrays + epoch_id + observed_at)
  observed_nodes_json            TEXT    NOT NULL DEFAULT '[]',
  -- JSON array of surface_id strings visible at observation time
  missing_nodes_json             TEXT    NOT NULL DEFAULT '[]',
  -- JSON array of expected nodes not visible at observation time
  stale_nodes_json               TEXT    NOT NULL DEFAULT '[]',
  -- JSON array of nodes present but epoch-stale
  partitioned_nodes_json         TEXT    NOT NULL DEFAULT '[]',
  -- JSON array of nodes isolated by partition
  observed_at                    TEXT    NOT NULL,
  -- ISO 8601 observation timestamp
  epoch_id                       TEXT    NOT NULL,
  -- Epoch coupling: snapshot is bound to this epoch
  visibility_classification      TEXT    NOT NULL
    CHECK(visibility_classification IN (
      'TOPOLOGY_VISIBLE',
      'TOPOLOGY_PARTIAL',
      'TOPOLOGY_STALE',
      'TOPOLOGY_INVISIBLE',
      'TOPOLOGY_AMBIGUOUS',
      'TOPOLOGY_NULL'
    )),
  -- Only TOPOLOGY_VISIBLE may have finality_guard=1.
  -- All non-visible states must have finality_guard=0 (topology invisibility blocks GLOBAL_VALID).
  finality_guard                 INTEGER NOT NULL DEFAULT 0
    CHECK(finality_guard IN (0, 1)),

  -- Evidence-only discipline: invariant flags enforced on every row
  creates_authority              INTEGER NOT NULL DEFAULT 0 CHECK(creates_authority = 0),
  creates_execution              INTEGER NOT NULL DEFAULT 0 CHECK(creates_execution = 0),
  raw_production_apply_path      TEXT    NOT NULL DEFAULT 'DENIED'
    CHECK(raw_production_apply_path = 'DENIED')
);

-- Index: epoch coupling — find all snapshots for an epoch
CREATE INDEX IF NOT EXISTS idx_tvsr_epoch_id
  ON topology_visibility_snapshot_registry(epoch_id);

-- Index: temporal ordering for audit and stale detection
CREATE INDEX IF NOT EXISTS idx_tvsr_observed_at
  ON topology_visibility_snapshot_registry(observed_at);

-- Index: visibility classification for gating queries
CREATE INDEX IF NOT EXISTS idx_tvsr_visibility_classification
  ON topology_visibility_snapshot_registry(visibility_classification);

-- Append-only enforcement: no UPDATE
CREATE TRIGGER IF NOT EXISTS tvsr_no_update
  BEFORE UPDATE ON topology_visibility_snapshot_registry
BEGIN
  SELECT RAISE(ABORT, 'topology_visibility_snapshot_registry is append-only: UPDATE is forbidden');
END;

-- Append-only enforcement: no DELETE
CREATE TRIGGER IF NOT EXISTS tvsr_no_delete
  BEFORE DELETE ON topology_visibility_snapshot_registry
BEGIN
  SELECT RAISE(ABORT, 'topology_visibility_snapshot_registry is append-only: DELETE is forbidden');
END;

-- creates_authority must always be 0: topology visibility cannot create authority
CREATE TRIGGER IF NOT EXISTS tvsr_no_authority_creation
  BEFORE INSERT ON topology_visibility_snapshot_registry
BEGIN
  SELECT CASE
    WHEN NEW.creates_authority != 0
    THEN RAISE(ABORT, 'topology_visibility_snapshot: creates_authority must be 0 — topology visibility cannot create authority')
  END;
END;

-- creates_execution must always be 0: topology visibility cannot create execution eligibility
CREATE TRIGGER IF NOT EXISTS tvsr_no_execution_creation
  BEFORE INSERT ON topology_visibility_snapshot_registry
BEGIN
  SELECT CASE
    WHEN NEW.creates_execution != 0
    THEN RAISE(ABORT, 'topology_visibility_snapshot: creates_execution must be 0 — topology visibility cannot create execution eligibility')
  END;
END;

-- TOPOLOGY_VISIBLE requires finality_guard=1
-- (non-visible topology may never carry the finality guard)
CREATE TRIGGER IF NOT EXISTS tvsr_visible_requires_finality_guard
  BEFORE INSERT ON topology_visibility_snapshot_registry
  WHEN NEW.visibility_classification = 'TOPOLOGY_VISIBLE'
BEGIN
  SELECT CASE
    WHEN NEW.finality_guard != 1
    THEN RAISE(ABORT, 'TOPOLOGY_VISIBLE snapshot must have finality_guard=1')
  END;
END;

-- Non-VISIBLE states must have finality_guard=0
-- topology invisibility blocks GLOBAL_VALID — visibility is a gate, not a grant
CREATE TRIGGER IF NOT EXISTS tvsr_non_visible_blocks_finality_guard
  BEFORE INSERT ON topology_visibility_snapshot_registry
  WHEN NEW.visibility_classification != 'TOPOLOGY_VISIBLE'
BEGIN
  SELECT CASE
    WHEN NEW.finality_guard != 0
    THEN RAISE(ABORT, 'non-TOPOLOGY_VISIBLE snapshot must have finality_guard=0 — topology invisibility blocks GLOBAL_VALID')
  END;
END;

-- TOPOLOGY_INVISIBLE must have empty observed_nodes_json (no phantom observed nodes)
CREATE TRIGGER IF NOT EXISTS tvsr_invisible_no_observed_nodes
  BEFORE INSERT ON topology_visibility_snapshot_registry
  WHEN NEW.visibility_classification = 'TOPOLOGY_INVISIBLE'
BEGIN
  SELECT CASE
    WHEN NEW.observed_nodes_json != '[]'
    THEN RAISE(ABORT, 'TOPOLOGY_INVISIBLE snapshot must have empty observed_nodes_json — no observed nodes exist')
  END;
END;
