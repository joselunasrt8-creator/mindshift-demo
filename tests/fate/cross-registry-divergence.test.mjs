import test from 'node:test'
import assert from 'node:assert/strict'
import { clone, fixtures, makeState, OUTCOME, validateLifecycle } from './fate-attack-helpers.mjs'

test('proof references missing authority returns NULL', () => {
  const state = makeState({ authorityRegistry: new Map() })
  assert.equal(validateLifecycle({ state }), OUTCOME.NULL)
})

test('authority and continuity registries disagree returns TOPOLOGY_DRIFT', () => {
  const continuity = clone(fixtures.continuity)
  continuity.authority_id = 'different-authority'
  assert.equal(validateLifecycle({ continuity }), OUTCOME.TOPOLOGY_DRIFT)
})

test('federation registry claims local authority returns NULL', () => {
  const envelope = clone(fixtures.federationEnvelope)
  envelope.claims_local_authority = true
  assert.equal(validateLifecycle({ envelope }), OUTCOME.NULL)
})
