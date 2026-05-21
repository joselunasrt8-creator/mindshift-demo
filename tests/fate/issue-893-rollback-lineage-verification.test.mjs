import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')
const schema = readFileSync(new URL('../../schema.sql', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../../migrations/0046_deployment_legitimacy_spine.sql', import.meta.url), 'utf8')

test('deployment_rollback_registry table exists in schema with required fields', () => {
  assert.match(schema, /CREATE TABLE IF NOT EXISTS deployment_rollback_registry/, 'deployment_rollback_registry must be declared in schema.sql')
  assert.match(schema, /deployment_rollback_registry[\s\S]*prior_proof_id TEXT NOT NULL/, 'prior_proof_id field required for rollback lineage')
  assert.match(schema, /deployment_rollback_registry[\s\S]*prior_deployment_proof_id TEXT NOT NULL/, 'prior_deployment_proof_id linkage required')
  assert.match(schema, /deployment_rollback_registry[\s\S]*rollback_lineage_hash TEXT NOT NULL/, 'rollback_lineage_hash required for deterministic deduplication')
  assert.match(schema, /deployment_rollback_registry[\s\S]*commit_sha TEXT NOT NULL/, 'commit_sha lineage field required')
  assert.match(schema, /deployment_rollback_registry[\s\S]*workflow_hash TEXT NOT NULL/, 'workflow_hash lineage field required')
  assert.match(schema, /deployment_rollback_registry[\s\S]*artifact_hash TEXT NOT NULL/, 'artifact_hash lineage field required')
  assert.match(schema, /deployment_rollback_registry[\s\S]*environment_classification TEXT NOT NULL/, 'environment_classification field required')
})

test('deployment_rollback_registry is append-only and immutable', () => {
  assert.match(schema, /deployment_rollback_registry[\s\S]*append_only TEXT NOT NULL CHECK \(append_only='true'\)/, 'append_only constraint required')
  assert.match(schema, /deployment_rollback_registry[\s\S]*immutable TEXT NOT NULL CHECK \(immutable='true'\)/, 'immutable constraint required')
  assert.match(schema, /trg_deployment_rollback_registry_no_update/, 'no-update trigger required')
  assert.match(schema, /trg_deployment_rollback_registry_no_delete/, 'no-delete trigger required')
})

test('deployment_rollback_registry enforces UNIQUE(rollback_lineage_hash) for replay protection', () => {
  assert.match(schema, /deployment_rollback_registry[\s\S]*UNIQUE\(rollback_lineage_hash\)/, 'rollback replay protection via unique hash required')
  assert.match(migration, /UNIQUE\(rollback_lineage_hash\)/, 'migration must declare rollback replay protection')
})

test('deployment_rollback_registry exists in src/index.ts migrateOrCreate', () => {
  assert.match(source, /CREATE TABLE IF NOT EXISTS deployment_rollback_registry/, 'runtime table creation must exist')
  assert.match(source, /trg_deployment_rollback_registry_no_update/, 'runtime no-update trigger must exist')
  assert.match(source, /trg_deployment_rollback_registry_no_delete/, 'runtime no-delete trigger must exist')
})

test('deployment_rollback_registry schema columns declared in REQUIRED_SCHEMA_COLUMNS', () => {
  assert.match(source, /deployment_rollback_registry: \[[\s\S]*"rollback_id"[\s\S]*"prior_proof_id"[\s\S]*"rollback_lineage_hash"/, 'schema diagnostics must require rollback lineage fields')
})

test('verifyDeploymentRollbackLineage function exists and enforces prior deployment proof requirement', () => {
  assert.match(source, /async function verifyDeploymentRollbackLineage/, 'verifyDeploymentRollbackLineage function must exist')
  assert.match(source, /reason: "rollback_lineage_not_found"/, 'invalid rollback lineage must be rejected with rollback_lineage_not_found')
  assert.match(source, /deployment_proof_registry WHERE proof_id=\?1/, 'rollback must query deployment_proof_registry by prior proof_id')
})

test('verifyDeploymentRollbackLineage rejects artifact hash mismatch', () => {
  assert.match(source, /reason: "rollback_artifact_hash_mismatch"/, 'artifact hash mismatch in rollback must be rejected')
  assert.match(source, /priorProof\.artifact_hash[\s\S]*artifact_hash/, 'rollback must verify artifact_hash against prior deployment proof')
})

test('verifyDeploymentRollbackLineage rejects workflow hash mismatch', () => {
  assert.match(source, /reason: "rollback_workflow_hash_mismatch"/, 'workflow hash mismatch in rollback must be rejected')
  assert.match(source, /priorProof\.workflow_hash[\s\S]*workflow_hash/, 'rollback must verify workflow_hash against prior deployment proof')
})

test('verifyDeploymentRollbackLineage rejects commit sha mismatch', () => {
  assert.match(source, /reason: "rollback_commit_sha_mismatch"/, 'commit sha mismatch in rollback must be rejected')
})

test('computeRollbackLineageHash produces deterministic rollback lineage hash', () => {
  assert.match(source, /async function computeRollbackLineageHash/, 'computeRollbackLineageHash must exist')
  assert.match(source, /computeRollbackLineageHash[\s\S]*prior_proof_id[\s\S]*prior_deployment_proof_id[\s\S]*commit_sha[\s\S]*workflow_hash[\s\S]*artifact_hash[\s\S]*environment_classification/, 'rollback hash must bind full lineage')
})

test('rollback lineage verification returns prior_deployment_proof_id on success', () => {
  assert.match(source, /prior_deployment_proof_id: String\(priorProof\.deployment_proof_id/, 'successful rollback verification must return prior_deployment_proof_id')
})

test('deployment_rollback_registry migration included in migration chain', () => {
  assert.match(source, /0046_deployment_legitimacy_spine\.sql/, 'deployment legitimacy spine migration registered in CANONICAL_MIGRATION_CHAIN')
})
