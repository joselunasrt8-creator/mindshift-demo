import test from 'node:test'
import assert from 'node:assert/strict'
import { clone, fixtures, hashObject, makeState, OUTCOME, runParallel, validateLifecycle } from './fate-attack-helpers.mjs'

test('two executions race same authority: one VALID at most and duplicate NULL', () => {
  const results = runParallel([{}, {}], makeState())
  assert.ok(results.filter((result) => result === OUTCOME.VALID).length <= 1)
  assert.ok(results.includes(OUTCOME.NULL))
})

test('same nonce used in parallel returns NULL for duplicate', () => {
  const first = clone(fixtures.aeo)
  const second = clone(fixtures.aeo)
  second.aeo_id = 'aeo-fixture-002'
  const results = runParallel([{ object: first }, { object: second }], makeState())
  assert.deepEqual(results, [OUTCOME.VALID, OUTCOME.NULL])
})

test('conflicting proof writes return deterministic NULL quarantine result', () => {
  const objectHash = hashObject(fixtures.aeo)
  const proof = { ...clone(fixtures.proof), validated_object_hash: objectHash, execution_hash: objectHash, proof_id: 'conflicting-proof' }
  const state = makeState({ proofRegistry: new Map([[proof.proof_id, { ...proof, execution_hash: 'conflict' }]]) })
  assert.equal(validateLifecycle({ state, proof }), OUTCOME.NULL)
})
