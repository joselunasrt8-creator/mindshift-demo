import test from 'node:test'
import assert from 'node:assert/strict'
import { clone, fixtures, makeState, OUTCOME, validateLifecycle } from './fate-attack-helpers.mjs'

test('authority scope expands after validation returns NULL', () => {
  const executedObject = clone(fixtures.aeo)
  executedObject.target.branch = 'release'
  assert.equal(validateLifecycle({ executedObject }), OUTCOME.NULL)
})

test('authority subject mismatch returns NULL', () => {
  const authority = clone(fixtures.authority)
  authority.subject = 'manual-production-deploy'
  assert.equal(validateLifecycle({ authority }), OUTCOME.NULL)
})

test('expired authority used returns NULL', () => {
  const authority = clone(fixtures.authority)
  authority.expires_at = '2026-05-13T23:59:59.000Z'
  assert.equal(validateLifecycle({ authority }), OUTCOME.NULL)
})

test('revoked descendant authority used returns NULL', () => {
  const state = makeState({ revokedAuthorityIds: new Set([fixtures.authority.authority_id]) })
  assert.equal(validateLifecycle({ state }), OUTCOME.NULL)
})
