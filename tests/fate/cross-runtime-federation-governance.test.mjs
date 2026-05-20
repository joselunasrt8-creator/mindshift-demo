import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function readJson(path) {
  return JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'))
}

const surfaces = readJson('runtime/federated_runtime_surfaces.json')
const rules = readJson('runtime/federated_authority_rules.json')
const failureModes = readJson('runtime/runtime_partition_failure_modes.json')
const bypasses = readJson('runtime/federated_bypass_paths.json')
const validatorConstraints = readJson('runtime/remote_validator_constraints.json')

const validFixture = readJson('tests/fixtures/federation-lineage/valid_canonical_federation.json')
const splitBrainFixture = readJson('tests/fixtures/federation-lineage/split_brain_runtime.json')
const replayedRemoteProofFixture = readJson('tests/fixtures/federation-lineage/replayed_remote_proof.json')
const detachedRemoteExecutionFixture = readJson('tests/fixtures/federation-lineage/detached_remote_execution.json')
const partitionedLineageFixture = readJson('tests/fixtures/federation-lineage/partitioned_lineage.json')
const staleRemoteAuthorityFixture = readJson('tests/fixtures/federation-lineage/stale_remote_authority.json')
const divergentValidatorFixture = readJson('tests/fixtures/federation-lineage/divergent_validator_consensus.json')
const quorumWithoutContinuityFixture = readJson('tests/fixtures/federation-lineage/quorum_without_continuity.json')

test('Cross-runtime federation governance closure: only canonical federated continuity reaches VALID', () => {
  assert.deepEqual(surfaces.canonical_federated_continuity, [
    '/session',
    '/continuity',
    '/authority',
    '/compile',
    '/validate',
    'federation_boundary',
    '/execute',
    '/proof',
  ])
  assert.equal(validFixture.expected_result, 'VALID')
})

test('Cross-runtime federation governance closure: all invalid federated states deterministically resolve to NULL', () => {
  for (const fixture of [
    splitBrainFixture,
    replayedRemoteProofFixture,
    detachedRemoteExecutionFixture,
    partitionedLineageFixture,
    staleRemoteAuthorityFixture,
    divergentValidatorFixture,
    quorumWithoutContinuityFixture,
  ]) {
    assert.equal(fixture.expected_result, 'NULL')
  }
})

test('Cross-runtime federation governance closure: fail-closed federation bypass classes are enumerated', () => {
  const ids = new Set(bypasses.bypass_paths.map((entry) => entry.bypass_id))
  for (const id of [
    'federated_replay_continuation',
    'cross_runtime_lineage_fragmentation',
    'split_brain_authority_execution',
    'detached_remote_continuation',
    'independent_runtime_quorum_synthesis',
    'stale_remote_proof_reuse',
    'cross_cluster_authority_escalation',
    'remote_validator_divergence',
  ]) assert.equal(ids.has(id), true)

  assert.equal(bypasses.required_invariant, 'cross_runtime_quorum != legitimacy')
  assert.equal(bypasses.fail_closed_response, 'NULL')
})

test('Cross-runtime federation governance closure: authority and validator constraints preserve non-transferable legitimacy', () => {
  assert.equal(rules.execution_gate, 'VALID && AUTHORIZED && UNUSED && POLICY_VALID && CANONICAL_LINEAGE_CONTINUITY')
  assert.equal(rules.else_result, 'NULL')
  assert.equal(rules.rules.remote_proof_not_local_authority, true)
  assert.equal(rules.rules.cross_runtime_quorum_not_legitimacy, true)
  assert.equal(rules.rules.cross_runtime_authority_aggregation_without_binding_null, true)

  assert.equal(validatorConstraints.constraints.remote_validator_divergence_null, true)
  assert.equal(validatorConstraints.constraints.remote_validator_quorum_requires_canonical_lineage, true)
  assert.equal(validatorConstraints.else_result, 'NULL')
})

test('Cross-runtime federation governance closure: partition and split-brain failure modes remain explicit and deterministic', () => {
  const map = new Map(failureModes.failure_modes.map((mode) => [mode.failure_id, mode.result]))
  assert.equal(map.get('split_brain_runtime'), 'NULL')
  assert.equal(map.get('partitioned_lineage'), 'NULL')
  assert.equal(map.get('detached_federation_continuation'), 'NULL')
  assert.equal(map.get('remote_validator_divergence'), 'NULL')
  assert.equal(failureModes.determinism, 'fail_closed')
})
