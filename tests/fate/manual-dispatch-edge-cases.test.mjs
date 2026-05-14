import test from 'node:test'
import assert from 'node:assert/strict'
import { clone, fixtures, makeState, OUTCOME, validateLifecycle } from './fate-attack-helpers.mjs'

test('workflow_dispatch without authority binding returns NULL', () => {
  assert.equal(validateLifecycle({ dispatch: { target: fixtures.aeo.target } }), OUTCOME.NULL)
})

test('workflow_dispatch rerun reuses authority returns NULL', () => {
  const state = makeState({ consumedAuthorities: new Set([fixtures.authority.authority_id]) })
  assert.equal(validateLifecycle({ state, dispatch: { authority_id: fixtures.authority.authority_id, target: fixtures.aeo.target } }), OUTCOME.NULL)
})

test('dispatch target differs from AEO target returns NULL', () => {
  const target = clone(fixtures.aeo.target)
  target.workflow = 'manual-dispatch.yml'
  assert.equal(validateLifecycle({ dispatch: { authority_id: fixtures.authority.authority_id, target } }), OUTCOME.NULL)
})
