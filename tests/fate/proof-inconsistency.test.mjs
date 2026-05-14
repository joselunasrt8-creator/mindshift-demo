import test from 'node:test'
import assert from 'node:assert/strict'
import { clone, fixtures, hashObject, makeState, OUTCOME, validateLifecycle } from './fate-attack-helpers.mjs'

test('proof missing validated_object_hash returns NULL', () => {
  const proof = clone(fixtures.proof)
  delete proof.validated_object_hash
  assert.equal(validateLifecycle({ proof }), OUTCOME.NULL)
})

test('proof execution_hash differs from executed object returns NULL', () => {
  const proof = clone(fixtures.proof)
  proof.validated_object_hash = hashObject(fixtures.aeo)
  proof.execution_hash = 'different-execution-hash'
  assert.equal(validateLifecycle({ proof }), OUTCOME.NULL)
})

test('proof exists without registry persistence returns NULL', () => {
  const proof = clone(fixtures.proof)
  const objectHash = hashObject(fixtures.aeo)
  proof.validated_object_hash = objectHash
  proof.execution_hash = objectHash
  const state = makeState({ proofRegistry: new Map() })
  assert.equal(validateLifecycle({ state, proof }), OUTCOME.NULL)
})
