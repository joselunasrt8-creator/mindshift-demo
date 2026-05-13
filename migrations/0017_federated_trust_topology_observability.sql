CREATE TABLE IF NOT EXISTS federated_trust_registry (
  trust_envelope_id TEXT PRIMARY KEY,
  federation_origin TEXT NOT NULL,
  federation_tier TEXT NOT NULL,
  verification_status TEXT NOT NULL,
  evidence_only TEXT NOT NULL,
  remote_authority_denied TEXT NOT NULL,
  continuity_reference TEXT NOT NULL,
  lineage_root TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  canonical_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_federated_trust_registry_hash
  ON federated_trust_registry(canonical_hash);

CREATE TABLE IF NOT EXISTS revocation_topology_registry (
  topology_id TEXT PRIMARY KEY,
  authority_id TEXT,
  continuity_id TEXT,
  lineage_root TEXT NOT NULL,
  topology_hash TEXT NOT NULL,
  drift_summary TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_revocation_topology_registry_hash
  ON revocation_topology_registry(topology_hash);
