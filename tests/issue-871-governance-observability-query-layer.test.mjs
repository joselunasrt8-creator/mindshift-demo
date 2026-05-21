import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../migrations/0046_governance_observability_query_registry.sql', import.meta.url), 'utf8')
const artifact = JSON.parse(readFileSync(new URL('../telemetry/install_base/observability_query_layer.json', import.meta.url), 'utf8'))

const QUERY_CATEGORIES = [
  'execution_governance_trends',
  'invalid_execution_trends',
  'validator_rejection_trends',
  'continuity_failure_trends',
  'replay_rejection_trends',
  'proof_lineage_completeness',
  'deployment_governance_participation',
  'authority_source_distribution',
]

const AGGREGATION_WINDOWS = ['hourly', 'daily', 'weekly', 'monthly']

test('issue-871: GovernanceObservabilityQueryCategory type covers all required categories', () => {
  assert.match(source, /type GovernanceObservabilityQueryCategory =/)
  for (const cat of QUERY_CATEGORIES) {
    assert.match(source, new RegExp(`"${cat}"`))
  }
})

test('issue-871: GovernanceObservabilityAggregationWindow type covers all windows', () => {
  assert.match(source, /type GovernanceObservabilityAggregationWindow =/)
  for (const w of AGGREGATION_WINDOWS) {
    assert.match(source, new RegExp(`"${w}"`))
  }
})

test('issue-871: governance_observability_query_registry table is defined in source and migration', () => {
  assert.match(source, /CREATE TABLE IF NOT EXISTS governance_observability_query_registry/)
  assert.match(migration, /CREATE TABLE IF NOT EXISTS governance_observability_query_registry/)
})

test('issue-871: query categories are constrained in table CHECK', () => {
  for (const cat of QUERY_CATEGORIES) {
    assert.match(source, new RegExp(`'${cat}'`))
    assert.match(migration, new RegExp(`'${cat}'`))
  }
})

test('issue-871: aggregation windows are constrained in table CHECK', () => {
  for (const w of AGGREGATION_WINDOWS) {
    assert.match(source, new RegExp(`'${w}'`))
    assert.match(migration, new RegExp(`'${w}'`))
  }
})

test('issue-871: lineage integrity is enforced at table level', () => {
  assert.match(source, /source_lineage_preserved TEXT NOT NULL CHECK \(source_lineage_preserved='true'\)/)
  assert.match(source, /validator_lineage_preserved TEXT NOT NULL CHECK \(validator_lineage_preserved='true'\)/)
  assert.match(source, /proof_lineage_preserved TEXT NOT NULL CHECK \(proof_lineage_preserved='true'\)/)
  assert.match(source, /policy_version_lineage_preserved TEXT NOT NULL CHECK \(policy_version_lineage_preserved='true'\)/)
})

test('issue-871: observability cannot mutate or create authority', () => {
  assert.match(source, /creates_authority TEXT NOT NULL CHECK \(creates_authority='false'\)/)
  assert.match(source, /triggers_execution TEXT NOT NULL CHECK \(triggers_execution='false'\)/)
  assert.match(source, /mutates_runtime TEXT NOT NULL CHECK \(mutates_runtime='false'\)/)
})

test('issue-871: registry is append-only with triggers', () => {
  assert.match(source, /trg_governance_observability_query_registry_no_update/)
  assert.match(source, /trg_governance_observability_query_registry_no_delete/)
  assert.match(migration, /trg_governance_observability_query_registry_no_update/)
  assert.match(migration, /trg_governance_observability_query_registry_no_delete/)
})

test('issue-871: governanceObservabilityQueryCategories function returns all categories', () => {
  assert.match(source, /function governanceObservabilityQueryCategories/)
  for (const cat of QUERY_CATEGORIES) {
    assert.match(source, new RegExp(`"${cat}"`))
  }
})

test('issue-871: governanceObservabilityIntegrityPreservation enforces all lineage fields', () => {
  assert.match(source, /function governanceObservabilityIntegrityPreservation/)
  assert.match(source, /source_lineage_preserved: true/)
  assert.match(source, /validator_lineage_preserved: true/)
  assert.match(source, /proof_lineage_preserved: true/)
  assert.match(source, /policy_version_lineage_preserved: true/)
})

test('issue-871: artifact is read-only and evidence-only', () => {
  assert.equal(artifact.read_only, true)
  assert.equal(artifact.evidence_only, true)
  assert.equal(artifact.creates_authority, false)
  assert.equal(artifact.triggers_execution, false)
  assert.equal(artifact.mutates_runtime, false)
  assert.deepEqual(artifact.query_categories, QUERY_CATEGORIES)
  assert.deepEqual(artifact.aggregation_windows, AGGREGATION_WINDOWS)
})

test('issue-871: artifact integrity requirements cover all lineage types', () => {
  assert.equal(artifact.integrity_requirements.source_lineage_preserved, true)
  assert.equal(artifact.integrity_requirements.validator_lineage_preserved, true)
  assert.equal(artifact.integrity_requirements.proof_lineage_preserved, true)
  assert.equal(artifact.integrity_requirements.policy_version_lineage_preserved, true)
})

test('issue-871: artifact null conditions cover all disallowed behaviors', () => {
  assert.ok(artifact.null_conditions.includes('dashboards_mutate_runtime_state'))
  assert.ok(artifact.null_conditions.includes('query_systems_create_authority'))
  assert.ok(artifact.null_conditions.includes('aggregation_rewrites_proof_lineage'))
  assert.ok(artifact.null_conditions.includes('observability_bypasses_validator_boundaries'))
  assert.ok(artifact.null_conditions.includes('dashboards_trigger_execution_directly'))
  assert.ok(artifact.null_conditions.includes('telemetry_metrics_used_as_execution_eligibility'))
})
