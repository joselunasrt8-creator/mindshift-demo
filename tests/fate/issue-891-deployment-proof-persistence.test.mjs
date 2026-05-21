import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')
const schema = readFileSync(new URL('../../schema.sql', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../../migrations/0046_deployment_legitimacy_spine.sql', import.meta.url), 'utf8')

test('deployment_proof_registry table exists in schema with required fields', () => {
  assert.match(schema, /CREATE TABLE IF NOT EXISTS deployment_proof_registry/, 'deployment_proof_registry must be declared in schema.sql')
  assert.match(schema, /deployment_proof_registry[\s\S]*proof_hash TEXT NOT NULL/, 'proof_hash field required for deterministic hashing')
  assert.match(schema, /deployment_proof_registry[\s\S]*commit_sha TEXT NOT NULL/, 'commit_sha lineage field required')
  assert.match(schema, /deployment_proof_registry[\s\S]*workflow_hash TEXT NOT NULL/, 'workflow_hash lineage field required')
  assert.match(schema, /deployment_proof_registry[\s\S]*artifact_hash TEXT NOT NULL/, 'artifact_hash lineage field required')
  assert.match(schema, /deployment_proof_registry[\s\S]*environment_classification TEXT NOT NULL/, 'environment_classification field required')
  assert.match(schema, /deployment_proof_registry[\s\S]*provenance_id TEXT NOT NULL/, 'provenance_id linkage field required')
})

test('deployment_proof_registry is append-only and immutable in schema', () => {
  assert.match(schema, /deployment_proof_registry[\s\S]*append_only TEXT NOT NULL CHECK \(append_only='true'\)/, 'append_only constraint required')
  assert.match(schema, /deployment_proof_registry[\s\S]*immutable TEXT NOT NULL CHECK \(immutable='true'\)/, 'immutable constraint required')
  assert.match(schema, /trg_deployment_proof_registry_no_update/, 'no-update trigger required')
  assert.match(schema, /trg_deployment_proof_registry_no_delete/, 'no-delete trigger required')
})

test('deployment_proof_registry enforces UNIQUE(proof_hash) for deterministic deduplication', () => {
  assert.match(schema, /deployment_proof_registry[\s\S]*UNIQUE\(proof_hash\)/, 'one deployment proof per deterministic hash required')
  assert.match(schema, /deployment_proof_registry[\s\S]*UNIQUE\(proof_id\)/, 'one deployment proof per proof_registry entry required')
  assert.match(migration, /UNIQUE\(proof_hash\)/, 'migration must declare UNIQUE(proof_hash)')
})

test('deployment_proof_registry exists in src/index.ts migrateOrCreate', () => {
  assert.match(source, /CREATE TABLE IF NOT EXISTS deployment_proof_registry/, 'runtime table creation must exist')
  assert.match(source, /trg_deployment_proof_registry_no_update/, 'runtime no-update trigger must exist')
  assert.match(source, /trg_deployment_proof_registry_no_delete/, 'runtime no-delete trigger must exist')
})

test('deployment_proof_registry schema columns declared in REQUIRED_SCHEMA_COLUMNS', () => {
  assert.match(source, /deployment_proof_registry: \[[\s\S]*"deployment_proof_id"[\s\S]*"proof_hash"[\s\S]*"workflow_hash"[\s\S]*"artifact_hash"/, 'schema diagnostics must require proof lineage fields')
})

test('deployment proof hash is computed deterministically via computeDeploymentProofHash', () => {
  assert.match(source, /async function computeDeploymentProofHash/, 'computeDeploymentProofHash function must exist')
  assert.match(source, /computeDeploymentProofHash\([\s\S]*commit_sha[\s\S]*workflow_hash[\s\S]*artifact_hash[\s\S]*environment_classification/, 'hash must bind commit_sha, workflow_hash, artifact_hash, environment_classification')
})

test('deployment proof is persisted after successful proof insertion', () => {
  assert.match(source, /INSERT OR IGNORE INTO deployment_proof_registry/, 'deployment proof must be persisted after proof')
  assert.match(source, /deployment_proof_registry[\s\S]*deployment_proof_id,provenance_id,proof_id,commit_sha,workflow_hash,artifact_hash,environment_classification,proof_hash/, 'deployment proof INSERT must bind all required fields')
})

test('deployment proof persistence occurs after authority consumption confirmation', () => {
  const proofStart = source.indexOf('if (url.pathname === "/proof" && request.method === "POST") {')
  const authorityConsumed = source.indexOf("AUTHORITY_CONSUMED", proofStart)
  const deploymentProofInsert = source.indexOf('INSERT OR IGNORE INTO deployment_proof_registry', proofStart)
  assert.ok(proofStart >= 0, 'proof route must exist')
  assert.ok(deploymentProofInsert > authorityConsumed, 'deployment proof must be persisted after authority consumption')
})

test('deployment proof lineage binds proof_registry to deployment_provenance_registry', () => {
  assert.match(source, /deployment_proof_id.*deployment_provenance_id/, 'deployment_proof_id links provenance and proof registries')
})
