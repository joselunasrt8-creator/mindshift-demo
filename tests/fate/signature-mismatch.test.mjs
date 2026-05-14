import test from 'node:test'
import assert from 'node:assert/strict'
import { clone, fixtures, makeState, OUTCOME, validateLifecycle } from './fate-attack-helpers.mjs'

test('signature does not match canonical object hash returns NULL', () => {
  const proof = clone(fixtures.proof)
  proof.validated_object_hash = 'not-the-canonical-object-hash'
  proof.execution_hash = 'not-the-canonical-object-hash'
  assert.equal(validateLifecycle({ proof }), OUTCOME.NULL)
})

test('stale authority key used returns NULL', () => {
  const authority = clone(fixtures.authority)
  authority.key_id = 'retired-local-test-key'
  assert.equal(validateLifecycle({ authority }), OUTCOME.NULL)
})

test('federation signature claims authority inheritance returns NULL', () => {
  const envelope = clone(fixtures.federationEnvelope)
  envelope.inherits_authority = true
  assert.equal(validateLifecycle({ envelope }), OUTCOME.NULL)
})
