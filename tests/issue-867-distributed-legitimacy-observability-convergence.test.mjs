import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')
const artifact = JSON.parse(readFileSync(new URL('../governance/install_base/distributed_convergence_model.json', import.meta.url), 'utf8'))

const CONVERGENCE_CLASSIFICATIONS = [
  'CONVERGED',
  'PARTIAL_CONVERGENCE',
  'TOPOLOGY_FRAGMENTED',
  'STALE_REGISTRY',
  'QUORUM_DISAGREEMENT',
  'REPLAY_DIVERGENCE',
  'PROOF_CONTINUITY_LOST',
  'UNKNOWN',
]

const CONFIDENCE_LEVELS = [
  'HIGH_CONFIDENCE',
  'MODERATE_CONFIDENCE',
  'LOW_CONFIDENCE',
  'INSUFFICIENT_EVIDENCE',
  'NULL',
]

const VISIBILITY_SCOPES = [
  'distributed_legitimacy_registry',
  'federated_checkpoint_registry',
  'reconciliation_projections',
  'continuity_lineage_projections',
  'topology_graphs',
  'drift_registries',
  'replay_observability',
  'proof_lineage_projections',
  'install_base_telemetry_projections',
]

const INVARIANTS = [
  'distributed_observability_ne_distributed_authority',
  'projection_ne_canonical_truth',
  'visibility_ne_execution_legitimacy',
  'remote_evidence_cannot_create_validity',
]

test('issue-867: DistributedConvergenceClassification type covers all classifications', () => {
  assert.match(source, /type DistributedConvergenceClassification =/)
  for (const cls of CONVERGENCE_CLASSIFICATIONS) {
    assert.match(source, new RegExp(`"${cls}"`))
  }
})

test('issue-867: DistributedConvergenceConfidence type covers all confidence levels', () => {
  assert.match(source, /type DistributedConvergenceConfidence =/)
  for (const level of CONFIDENCE_LEVELS) {
    assert.match(source, new RegExp(`"${level}"`))
  }
})

test('issue-867: distributedLegitimacyConvergenceClassifications returns all required classifications', () => {
  assert.match(source, /function distributedLegitimacyConvergenceClassifications/)
  for (const cls of CONVERGENCE_CLASSIFICATIONS) {
    assert.match(source, new RegExp(`"${cls}"`))
  }
})

test('issue-867: distributedLegitimacyConvergenceModel function exists and is non-authoritative', () => {
  assert.match(source, /function distributedLegitimacyConvergenceModel/)
  assert.match(source, /convergence_semantics: "non_authoritative_observational_only"/)
  assert.match(source, /evidence_only: true/)
  assert.match(source, /read_only: true/)
  assert.match(source, /creates_authority: false/)
  assert.match(source, /mutations_runtime: false/)
})

test('issue-867: distributedLegitimacyConvergenceModel includes canonical source hierarchy', () => {
  assert.match(source, /canonical_source_hierarchy:/)
  assert.match(source, /"local_authority_registry"/)
  assert.match(source, /"local_validator_result"/)
  assert.match(source, /"local_proof_registry"/)
  assert.match(source, /"federated_checkpoint_evidence"/)
  assert.match(source, /"remote_reconciliation_projection"/)
})

test('issue-867: distributedLegitimacyConvergenceModel null conditions cover all disallowed behaviors', () => {
  assert.match(source, /convergence_requires_runtime_mutation/)
  assert.match(source, /convergence_requires_validator_mutation/)
  assert.match(source, /convergence_creates_authority/)
  assert.match(source, /convergence_triggers_execution/)
  assert.match(source, /distributed_consensus_creating_execution_legitimacy/)
})

test('issue-867: distributedConvergenceVisibilityScopes covers all required scopes', () => {
  assert.match(source, /function distributedConvergenceVisibilityScopes/)
  for (const scope of VISIBILITY_SCOPES) {
    assert.match(source, new RegExp(`"${scope}"`))
  }
})

test('issue-867: artifact is evidence_only and non-authoritative', () => {
  assert.equal(artifact.evidence_only, true)
  assert.equal(artifact.read_only, true)
  assert.equal(artifact.creates_authority, false)
  assert.equal(artifact.runtime_mutation, false)
  assert.equal(artifact.authority_inheritance, false)
  assert.equal(artifact.distributed_consensus_creates_legitimacy, false)
})

test('issue-867: artifact convergence_classifications covers all required states', () => {
  for (const cls of CONVERGENCE_CLASSIFICATIONS) {
    assert.ok(artifact.convergence_classifications.includes(cls), `missing classification: ${cls}`)
  }
})

test('issue-867: artifact visibility_scopes covers all required scopes', () => {
  for (const scope of VISIBILITY_SCOPES) {
    assert.ok(artifact.visibility_scopes.includes(scope), `missing scope: ${scope}`)
  }
})

test('issue-867: artifact invariants preserve evidence-only semantics', () => {
  for (const inv of INVARIANTS) {
    assert.ok(artifact.invariants.includes(inv), `missing invariant: ${inv}`)
  }
})

test('issue-867: artifact null conditions prevent authority creation and execution mutation', () => {
  assert.ok(artifact.null_conditions.includes('convergence_creates_authority'))
  assert.ok(artifact.null_conditions.includes('convergence_triggers_execution'))
  assert.ok(artifact.null_conditions.includes('convergence_requires_runtime_mutation'))
  assert.ok(artifact.null_conditions.includes('distributed_consensus_creating_execution_legitimacy'))
})

test('issue-867: artifact canonical_source_of_truth_hierarchy prioritizes local over remote', () => {
  const h = artifact.canonical_source_of_truth_hierarchy
  assert.ok(h.indexOf('local_authority_registry') < h.indexOf('federated_checkpoint_evidence'))
  assert.ok(h.indexOf('local_validator_result') < h.indexOf('remote_reconciliation_projection'))
})

test('issue-867: artifact evidence_only_federation_boundary prevents authority creation', () => {
  const boundary = artifact.evidence_only_federation_boundary
  assert.equal(boundary.remote_evidence_role, 'narrows_acceptance_range_only')
  assert.ok(boundary.cannot_create.includes('execution_legitimacy'))
  assert.ok(boundary.cannot_create.includes('authority'))
  assert.equal(boundary.canonical_runtime_closure, 'explicit_and_local')
})
