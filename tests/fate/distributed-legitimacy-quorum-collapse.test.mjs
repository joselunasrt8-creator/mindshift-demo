import test from 'node:test'
import assert from 'node:assert/strict'

import { reconcileCrossRegistryAuthority, LEGITIMACY_QUORUM_CLASSIFICATION } from '../../runtime/cross_registry_authority_reconciliation.mjs'
import { inspectTemporalLineageReplay } from '../../runtime/temporal_lineage_replay_inspector.ts'

const base = {
  decision_id: 'd-quorum', continuity_id: 'c1', lineage_parent: 'p1', lineage_root: 'r1', authority_timestamp: '2026-05-20T00:00:00.000Z', replay_state: 'FRESH', continuity_status: 'ACTIVE'
}

const canonicalLineage = [
  { id: 'session-1', parent_id: null, stage: 'session', legitimacy_state: 'VALID', epoch: 7, timestamp: '2026-05-20T00:00:00.000Z', topology_hash: 'topo-a' },
  { id: 'continuity-1', parent_id: 'session-1', stage: 'continuity', legitimacy_state: 'VALID', epoch: 7, timestamp: '2026-05-20T00:01:00.000Z', topology_hash: 'topo-a' },
  { id: 'authority-1', parent_id: 'continuity-1', stage: 'authority', legitimacy_state: 'VALID', epoch: 7, timestamp: '2026-05-20T00:02:00.000Z', topology_hash: 'topo-a' },
]

test('revoked vs unknown distributed registry state collapses fail-closed', () => {
  const out = reconcileCrossRegistryAuthority({
    registries: [
      { ...base, authority_status: 'AUTHORIZED' },
      { ...base, registry_id: 'b', authority_status: 'UNKNOWN' },
      { ...base, registry_id: 'c', authority_status: 'REVOKED' }
    ],
    expectedContinuityId: 'c1',
    requiredRegistryCount: 3
  })
  assert.equal(out.executable_legitimacy, 'NULL')
  assert.equal(out.fail_closed, true)
  assert.equal(out.quorum_classifications[0].quorum_classification, LEGITIMACY_QUORUM_CLASSIFICATION.REVOKED_CONFLICT)
})

test('stale replay resurrection attempt collapses to STALE_REPLAY and NULL', () => {
  const out = reconcileCrossRegistryAuthority({
    registries: [
      { ...base, authority_status: 'REVOKED' },
      { ...base, registry_id: 'b', authority_status: 'AUTHORIZED', replay_state: 'REPLAYED' },
    ],
    expectedContinuityId: 'c1'
  })
  assert.equal(out.executable_legitimacy, 'NULL')
  assert.equal(out.quorum_classifications[0].quorum_classification, LEGITIMACY_QUORUM_CLASSIFICATION.STALE_REPLAY)
})

test('conflicting timestamp legitimacy classifies as TEMPORAL_DRIFT', () => {
  const out = reconcileCrossRegistryAuthority({
    registries: [
      { ...base, authority_status: 'AUTHORIZED', authority_timestamp: '2026-05-20T00:00:00.000Z' },
      { ...base, registry_id: 'b', authority_status: 'AUTHORIZED', authority_timestamp: '2026-05-20T00:00:01.000Z' },
    ],
    expectedContinuityId: 'c1'
  })
  assert.equal(out.quorum_classifications[0].quorum_classification, LEGITIMACY_QUORUM_CLASSIFICATION.TEMPORAL_DRIFT)
})

test('partial registry visibility without explicit bounded quorum is NULL', () => {
  const out = reconcileCrossRegistryAuthority({
    registries: [
      { ...base, authority_status: 'AUTHORIZED' },
      { ...base, registry_id: 'b', authority_status: 'UNKNOWN' }
    ],
    requiredRegistryCount: 3
  })
  assert.equal(out.executable_legitimacy, 'NULL')
  assert.equal(out.quorum_classifications[0].quorum_classification, LEGITIMACY_QUORUM_CLASSIFICATION.PARTIAL_VISIBILITY)
})

test('replay divergence reconstruction and federated continuity disagreement return DRIFT', () => {
  const replayLineage = [canonicalLineage[2], canonicalLineage[0], canonicalLineage[1]]
  const result = inspectTemporalLineageReplay({
    canonicalLineage,
    replayLineage,
    expectedEpoch: 7,
    crossRegistryAuthorityStates: [
      { registry_id: 'a', decision_id: 'd-quorum', authority_status: 'AUTHORIZED', authority_timestamp: '2026-05-20T00:00:00.000Z', continuity_id: 'c1' },
      { registry_id: 'b', decision_id: 'd-quorum', authority_status: 'AUTHORIZED', authority_timestamp: '2026-05-20T00:00:00.000Z', continuity_id: 'c2' },
    ]
  })

  assert.equal(result.status, 'DRIFT')
  assert.equal(result.deterministic_conclusion, 'NULL')
})
