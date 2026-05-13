-- MindShift legitimacy graph closure registry.
-- Append-only, replay-neutral evidence only. No UPDATE. No DELETE.

CREATE TABLE IF NOT EXISTS legitimacy_graph_registry (
  graph_checkpoint_id TEXT PRIMARY KEY,
  graph_checkpoint_hash TEXT NOT NULL,
  graph_coherence_hash TEXT NOT NULL,
  node_count TEXT NOT NULL,
  edge_count TEXT NOT NULL,
  orphan_count TEXT NOT NULL,
  drift_classes TEXT NOT NULL,
  checkpoint_object_hash TEXT NOT NULL,
  cross_registry_replay_continuity TEXT NOT NULL CHECK (cross_registry_replay_continuity IN ('CONTINUOUS','FRAGMENTED')),
  evidence_only TEXT NOT NULL CHECK (evidence_only='true'),
  replay_neutral TEXT NOT NULL CHECK (replay_neutral='true'),
  mutation_capable TEXT NOT NULL CHECK (mutation_capable='false'),
  remote_authority_denied TEXT NOT NULL CHECK (remote_authority_denied='true'),
  read_only TEXT NOT NULL CHECK (read_only='true'),
  creates_authority TEXT NOT NULL CHECK (creates_authority='false'),
  execution_started TEXT NOT NULL CHECK (execution_started='false'),
  generated_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_legitimacy_graph_registry_checkpoint
  ON legitimacy_graph_registry(graph_checkpoint_hash, graph_coherence_hash, cross_registry_replay_continuity);

CREATE INDEX IF NOT EXISTS idx_legitimacy_graph_registry_drift
  ON legitimacy_graph_registry(orphan_count, cross_registry_replay_continuity);

CREATE TRIGGER IF NOT EXISTS trg_legitimacy_graph_registry_no_update
BEFORE UPDATE ON legitimacy_graph_registry
BEGIN
  SELECT RAISE(ABORT, 'legitimacy_graph_registry is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_legitimacy_graph_registry_no_delete
BEFORE DELETE ON legitimacy_graph_registry
BEGIN
  SELECT RAISE(ABORT, 'legitimacy_graph_registry is append-only');
END;
