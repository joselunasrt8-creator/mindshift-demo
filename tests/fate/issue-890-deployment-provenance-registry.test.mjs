import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')
const schema = readFileSync(new URL('../../schema.sql', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../../migrations/0046_deployment_legitimacy_spine.sql', import.meta.url), 'utf8')

test('deployment_provenance_registry table exists in schema with required fields', () => {
  assert.match(schema, /CREATE TABLE IF NOT EXISTS deployment_provenance_registry/, 'deployment_provenance_registry must be declared in schema.sql')
  assert.match(schema, /deployment_provenance_registry[\s\S]*commit_sha TEXT NOT NULL/, 'commit_sha field required')
  assert.match(schema, /deployment_provenance_registry[\s\S]*workflow_hash TEXT NOT NULL/, 'workflow_hash field required')
  assert.match(schema, /deployment_provenance_registry[\s\S]*artifact_hash TEXT NOT NULL/, 'artifact_hash field required')
  assert.match(schema, /deployment_provenance_registry[\s\S]*deploy_actor TEXT NOT NULL/, 'deploy_actor field required')
  assert.match(schema, /deployment_provenance_registry[\s\S]*deployment_timestamp TEXT NOT NULL/, 'deployment_timestamp field required')
  assert.match(schema, /deployment_provenance_registry[\s\S]*environment_classification TEXT NOT NULL/, 'environment_classification field required')
  assert.match(schema, /deployment_provenance_registry[\s\S]*deployment_proof_id TEXT/, 'deployment_proof_id linkage field required')
})

test('deployment_provenance_registry is append-only in schema', () => {
  assert.match(schema, /deployment_provenance_registry[\s\S]*append_only TEXT NOT NULL CHECK \(append_only='true'\)/, 'append_only constraint required')
  assert.match(schema, /deployment_provenance_registry[\s\S]*immutable TEXT NOT NULL CHECK \(immutable='true'\)/, 'immutable constraint required')
  assert.match(schema, /trg_deployment_provenance_registry_no_update/, 'no-update trigger required')
  assert.match(schema, /trg_deployment_provenance_registry_no_delete/, 'no-delete trigger required')
})

test('deployment_provenance_registry enforces UNIQUE(proof_id) constraint', () => {
  assert.match(schema, /deployment_provenance_registry[\s\S]*UNIQUE\(proof_id\)/, 'one provenance record per proof_id required')
  assert.match(migration, /UNIQUE\(proof_id\)/, 'migration must declare UNIQUE(proof_id)')
})

test('deployment_provenance_registry exists in src/index.ts migrateOrCreate', () => {
  assert.match(source, /CREATE TABLE IF NOT EXISTS deployment_provenance_registry/, 'runtime table creation must exist')
  assert.match(source, /trg_deployment_provenance_registry_no_update/, 'runtime no-update trigger must exist')
  assert.match(source, /trg_deployment_provenance_registry_no_delete/, 'runtime no-delete trigger must exist')
})

test('deployment_provenance_registry schema columns declared in REQUIRED_SCHEMA_COLUMNS', () => {
  assert.match(source, /deployment_provenance_registry: \[[\s\S]*"commit_sha"[\s\S]*"workflow_hash"[\s\S]*"artifact_hash"[\s\S]*"deploy_actor"[\s\S]*"environment_classification"/, 'schema diagnostics must require provenance lineage fields')
})

test('deployment provenance is persisted after successful proof', () => {
  assert.match(source, /INSERT OR IGNORE INTO deployment_provenance_registry/, 'deployment provenance must be persisted after proof')
  assert.match(source, /deployment_provenance_registry[\s\S]*provenance_id,proof_id,commit_sha,workflow_hash,artifact_hash,deploy_actor,deployment_timestamp,environment_classification/, 'provenance INSERT must bind all required fields')
})

test('deployment provenance registry is included in migration chain', () => {
  assert.match(source, /0046_deployment_legitimacy_spine\.sql/, 'migration must be registered in CANONICAL_MIGRATION_CHAIN')
})

test('deployment provenance fields sourced from execution lineage', () => {
  assert.match(source, /deploymentCommitSha.*provenance\.merge_commit_sha/, 'commit_sha sourced from merge_commit_sha provenance')
  assert.match(source, /deploymentWorkflowHash.*executionSnapshot\.workflow_hash/, 'workflow_hash sourced from execution snapshot')
  assert.match(source, /deploymentActor.*authority\.identity_id/, 'deploy_actor sourced from authority identity')
})
