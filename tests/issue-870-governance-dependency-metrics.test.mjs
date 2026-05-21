import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../migrations/0045_governance_dependency_metrics_registry.sql', import.meta.url), 'utf8')
const artifact = JSON.parse(readFileSync(new URL('../telemetry/install_base/governance_dependency_metrics.json', import.meta.url), 'utf8'))

const METRIC_KEYS = [
  'governance_dependency_ratio',
  'fail_closed_interception_ratio',
  'proof_attachment_ratio',
  'replay_rejection_ratio',
  'continuity_integrity_ratio',
  'distributed_governance_participation_ratio',
]

const DIMENSIONS = [
  'surface_id', 'organization_id', 'runtime_id', 'policy_version',
  'deployment_target', 'time_window', 'governance_layer', 'validator_version',
]

const TIME_WINDOWS = ['hourly', 'daily', 'weekly', 'monthly']

test('issue-870: GovernanceDependencyMetricKey type covers all required metric keys', () => {
  assert.match(source, /type GovernanceDependencyMetricKey =/)
  for (const key of METRIC_KEYS) {
    assert.match(source, new RegExp(`"${key}"`))
  }
})

test('issue-870: governance_dependency_metrics_registry table is defined in source and migration', () => {
  assert.match(source, /CREATE TABLE IF NOT EXISTS governance_dependency_metrics_registry/)
  assert.match(migration, /CREATE TABLE IF NOT EXISTS governance_dependency_metrics_registry/)
})

test('issue-870: metric keys are constrained in table definition', () => {
  for (const key of METRIC_KEYS) {
    assert.match(source, new RegExp(`'${key}'`))
    assert.match(migration, new RegExp(`'${key}'`))
  }
})

test('issue-870: time windows are constrained', () => {
  for (const w of TIME_WINDOWS) {
    assert.match(source, new RegExp(`'${w}'`))
    assert.match(migration, new RegExp(`'${w}'`))
  }
})

test('issue-870: metrics registry is append-only with no-update and no-delete triggers', () => {
  assert.match(source, /trg_governance_dependency_metrics_registry_no_update/)
  assert.match(source, /trg_governance_dependency_metrics_registry_no_delete/)
  assert.match(migration, /trg_governance_dependency_metrics_registry_no_update/)
  assert.match(migration, /trg_governance_dependency_metrics_registry_no_delete/)
})

test('issue-870: evidence_only and non_authoritative constraints enforced', () => {
  assert.match(source, /evidence_only TEXT NOT NULL CHECK \(evidence_only='true'\)/)
  assert.match(source, /non_authoritative TEXT NOT NULL CHECK \(non_authoritative='true'\)/)
  assert.match(source, /creates_execution_permission TEXT NOT NULL CHECK \(creates_execution_permission='false'\)/)
})

test('issue-870: governanceDependencyMetricKeys function returns all metric keys', () => {
  assert.match(source, /function governanceDependencyMetricKeys/)
  for (const key of METRIC_KEYS) {
    assert.match(source, /governanceDependencyMetricKeys/)
  }
})

test('issue-870: governanceDependencyMetricDimensions function covers all dimensions', () => {
  assert.match(source, /function governanceDependencyMetricDimensions/)
  for (const dim of DIMENSIONS) {
    assert.match(source, new RegExp(`"${dim}"`))
  }
})

test('issue-870: artifact is evidence_only and non_authoritative', () => {
  assert.equal(artifact.semantics, 'evidence_only')
  assert.equal(artifact.non_authoritative, true)
  assert.equal(artifact.creates_execution_permission, false)
  assert.equal(artifact.creates_authority, false)
  assert.equal(artifact.append_only, true)
  assert.deepEqual(artifact.metric_keys, METRIC_KEYS)
  assert.deepEqual(artifact.dimensions, DIMENSIONS)
  assert.deepEqual(artifact.time_windows, TIME_WINDOWS)
})

test('issue-870: artifact defines null conditions and invariants', () => {
  assert.ok(artifact.null_conditions.includes('metrics_create_execution_permission'))
  assert.ok(artifact.null_conditions.includes('metrics_used_as_authority'))
  assert.ok(artifact.invariants.includes('usage_ne_legitimacy'))
  assert.ok(artifact.invariants.includes('adoption_ne_authority'))
  assert.ok(artifact.invariants.includes('metrics_ne_proof'))
})

test('issue-870: governanceDependencyMetricNullConditions covers all null conditions', () => {
  assert.match(source, /function governanceDependencyMetricNullConditions/)
  assert.match(source, /metrics_create_execution_permission/)
  assert.match(source, /metrics_bypass_validator_requirements/)
  assert.match(source, /metrics_used_as_authority/)
})
