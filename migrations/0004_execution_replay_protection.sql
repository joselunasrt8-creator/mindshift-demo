-- Add validated_object_hash storage and lookup index for replay protection.
ALTER TABLE execution_registry ADD COLUMN validated_object_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_execution_registry_validated_hash_status
  ON execution_registry (validated_object_hash, status, created_at);
