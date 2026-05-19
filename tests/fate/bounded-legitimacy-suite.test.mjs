import test from 'node:test'
import assert from 'node:assert/strict'
import { clone, fixtures, hashObject, makeState, OUTCOME, validateLifecycle, validateProof, validateReplay } from './fate-attack-helpers.mjs'

function lifecycleFixture(state = makeState()) {
  const object = clone(fixtures.aeo)
  const hash = hashObject(object)
  const proof = clone(fixtures.proof)
  proof.validated_object_hash = hash
  proof.execution_hash = hash
  return { state, object, proof }
}

test('exact-object integrity: validated hash must equal executed hash and mutated execution fails closed', () => {
  const { state, object, proof } = lifecycleFixture()
  assert.equal(validateLifecycle({ state, object, executedObject: object, proof }), OUTCOME.VALID)

  const mutatedExecuted = clone(object)
  mutatedExecuted.target.repository = 'attacker/replay'
  assert.equal(validateLifecycle({ state: makeState(), object, executedObject: mutatedExecuted }), OUTCOME.NULL)
})

test('replay resistance: authority/object/nonce reuse all fail closed deterministically', () => {
  const shared = makeState()
  assert.equal(validateLifecycle({ state: shared }), OUTCOME.VALID)
  assert.equal(validateLifecycle({ state: shared }), OUTCOME.NULL)

  const fresh = makeState()
  const firstReplay = validateReplay(fresh, clone(fixtures.aeo), { reserve: true })
  const secondReplay = validateReplay(fresh, clone(fixtures.aeo), { reserve: true })
  assert.equal(firstReplay, OUTCOME.VALID)
  assert.equal(secondReplay, OUTCOME.NULL)
})

test('proof coherence: orphan and non-executed lineage proofs fail closed', () => {
  const { object } = lifecycleFixture()

  const orphanState = makeState({ proofRegistry: new Map(), executionRegistry: new Map() })
  const orphanProof = clone(fixtures.proof)
  const hash = hashObject(object)
  orphanProof.validated_object_hash = hash
  orphanProof.execution_hash = hash
  assert.equal(validateProof(orphanProof, object, orphanState), OUTCOME.NULL)

  const nonExecutedState = makeState({
    executionRegistry: new Map([[fixtures.proof.execution_id, { execution_id: fixtures.proof.execution_id, object_hash: hash, persisted: false }]]),
  })
  const nonExecutedProof = clone(fixtures.proof)
  nonExecutedProof.validated_object_hash = hash
  nonExecutedProof.execution_hash = hash
  assert.equal(validateProof(nonExecutedProof, object, nonExecutedState), OUTCOME.NULL)
})

test('boundary bypass prevention: invalid dispatch lineage fails closed', () => {
  const { state, object } = lifecycleFixture()
  const bypassDispatch = { authority_id: fixtures.authority.authority_id, target: { repository: 'evil/repo' } }
  assert.equal(validateLifecycle({ state, object, dispatch: bypassDispatch }), OUTCOME.NULL)
})

test('continuity lineage: orphan, expired, and revoked continuity invalidate downstream execution', () => {
  const orphanContinuityState = makeState({ continuityRegistry: new Map() })
  assert.equal(validateLifecycle({ state: orphanContinuityState }), OUTCOME.TOPOLOGY_DRIFT)

  const expiredContinuity = clone(fixtures.continuity)
  expiredContinuity.expires_at = '2020-01-01T00:00:00.000Z'
  const expiredState = makeState({ continuityRegistry: new Map([[expiredContinuity.continuity_id, expiredContinuity]]) })
  assert.equal(validateLifecycle({ state: expiredState, continuity: expiredContinuity }), OUTCOME.NULL)

  const revokedAuthorityState = makeState({ revokedAuthorityIds: new Set([fixtures.authority.authority_id]) })
  assert.equal(validateLifecycle({ state: revokedAuthorityState }), OUTCOME.NULL)
})

test('deterministic canonicalization: same semantic object hashes identically and semantic change drifts', () => {
  const base = { a: 1, b: { c: 2, d: [3, 4] } }
  const equivalent = { b: { d: [3, 4], c: 2 }, a: 1 }
  const drifted = { a: 1, b: { c: 2, d: [3, 5] } }

  assert.equal(hashObject(base), hashObject(equivalent))
  assert.notEqual(hashObject(base), hashObject(drifted))
})
