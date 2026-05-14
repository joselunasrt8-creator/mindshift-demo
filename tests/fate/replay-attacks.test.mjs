import test from 'node:test'
import assert from 'node:assert/strict'
import { clone, fixtures, makeState, OUTCOME, validateLifecycle } from './fate-attack-helpers.mjs'

test('consumed authority reuse returns NULL', () => {
  const state = makeState({ consumedAuthorities: new Set([fixtures.authority.authority_id]) })
  assert.equal(validateLifecycle({ state }), OUTCOME.NULL)
})

test('duplicate object hash returns NULL', () => {
  const state = makeState()
  assert.equal(validateLifecycle({ state }), OUTCOME.VALID)
  assert.equal(validateLifecycle({ state }), OUTCOME.NULL)
})

test('nonce reuse returns NULL', () => {
  const state = makeState({ usedNonces: new Set([fixtures.aeo.nonce]) })
  assert.equal(validateLifecycle({ state }), OUTCOME.NULL)
})

test('cross-runtime replay attempt returns NULL', () => {
  const object = clone(fixtures.aeo)
  object.runtime_id = 'remote-runtime-fixture'
  assert.equal(validateLifecycle({ object }), OUTCOME.NULL)
})
