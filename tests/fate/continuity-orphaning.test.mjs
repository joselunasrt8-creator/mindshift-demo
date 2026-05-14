import test from 'node:test'
import assert from 'node:assert/strict'
import { clone, fixtures, makeState, OUTCOME, validateLifecycle } from './fate-attack-helpers.mjs'

test('authority without continuity chain returns TOPOLOGY_DRIFT', () => {
  const state = makeState({ continuityRegistry: new Map() })
  assert.equal(validateLifecycle({ state }), OUTCOME.TOPOLOGY_DRIFT)
})

test('proof references orphaned execution returns NULL', () => {
  const proof = clone(fixtures.proof)
  const state = makeState({ executionRegistry: new Map(), proofRegistry: new Map([[proof.proof_id, proof]]) })
  assert.equal(validateLifecycle({ state, proof }), OUTCOME.NULL)
})

test('session expired before execution returns NULL', () => {
  const continuity = clone(fixtures.continuity)
  continuity.expires_at = '2026-05-13T23:59:59.000Z'
  assert.equal(validateLifecycle({ continuity }), OUTCOME.NULL)
})
