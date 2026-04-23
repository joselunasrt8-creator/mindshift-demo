CREATE TABLE IF NOT EXISTS authorities (
  id TEXT PRIMARY KEY,
  decision_id TEXT NOT NULL,
  aeo_json TEXT NOT NULL,
  state TEXT NOT NULL,
  authority_object_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS compilations (
  id TEXT PRIMARY KEY,
  authority_id TEXT NOT NULL,
  state TEXT NOT NULL,
  compiled_object_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (authority_id) REFERENCES authorities(id)
);

CREATE TABLE IF NOT EXISTS validations (
  id TEXT PRIMARY KEY,
  compilation_id TEXT NOT NULL,
  authority_id TEXT NOT NULL,
  state TEXT NOT NULL,
  validated_object_json TEXT NOT NULL,
  validated_object_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (compilation_id) REFERENCES compilations(id),
  FOREIGN KEY (authority_id) REFERENCES authorities(id)
);

CREATE TABLE IF NOT EXISTS executions (
  id TEXT PRIMARY KEY,
  validation_id TEXT NOT NULL,
  authority_id TEXT NOT NULL,
  webhook_url TEXT NOT NULL,
  state TEXT NOT NULL,
  executed_object_json TEXT NOT NULL,
  webhook_status INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (validation_id) REFERENCES validations(id),
  FOREIGN KEY (authority_id) REFERENCES authorities(id)
);

CREATE TABLE IF NOT EXISTS proofs (
  id TEXT PRIMARY KEY,
  execution_id TEXT NOT NULL,
  authority_id TEXT NOT NULL,
  proof_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (execution_id) REFERENCES executions(id),
  FOREIGN KEY (authority_id) REFERENCES authorities(id)
);
