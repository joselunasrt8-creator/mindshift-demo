import test from 'node:test'
import assert from 'node:assert/strict'

import { canonicalize, sha256Hex } from '../src/canonical.js'
import {
  budgetGovernanceComplexity,
  GOVERNANCE_COMPLEXITY_CLASSIFICATIONS,
} from '../src/governance-complexity-budgeting.ts'

test('issue-1147: NULL when no valid complexity object exists', () => {
  const result = budgetGovernanceComplexity({ analysis_id: 'x', evidence_only: true, budget_limit: 10, surfaces: [] })
  assert.equal(result.classification, 'NULL')
  assert.equal(result.evidence_only, true)
  assert.equal(result.creates_authority, false)
  assert.equal(result.mutates_state, false)
  assert.equal(result.validates_execution, false)
})

test('issue-1147: deterministic ordering, frozen output, and canonical hashing', () => {
  const input = {
    analysis_id: 'issue-1147-main',
    evidence_only: true,
    budget_limit: 20,
    surfaces: [
      { surface_id: 'b', governance_axes: ['g2', 'g1'], topology_neighbors: ['x', 'y', 'z'], reconciliation_channels: ['r1', 'r2'], replay_vectors: ['rp1', 'rp2'], semantic_tags: ['s1', 's2'], authority_scopes: ['a1', 'a2'], dependency_targets: ['d1', 'd2', 'd3'], install_base_segments: ['seg1'] },
      { surface_id: 'a', governance_axes: ['g0'], topology_neighbors: ['b'], reconciliation_channels: ['r0'], replay_vectors: ['rp0'], semantic_tags: ['s0'], authority_scopes: ['a0'], dependency_targets: ['d0'], install_base_segments: ['seg0', 'seg1'] },
    ],
  }
  const one = budgetGovernanceComplexity(input)
  const two = budgetGovernanceComplexity({ ...input, surfaces: [...input.surfaces].reverse() })

  assert.deepEqual(one.deterministic_complexity_traversal, ['a', 'b'])
  assert.deepEqual(one.deterministic_budget_analysis_ordering, ['a', 'b'])
  assert.equal(one.classification, 'GOVERNANCE_BUDGET_EXCEEDED')
  assert.deepEqual(one, two)
  assert.ok(Object.isFrozen(one))
  assert.ok(Object.isFrozen(one.scalability_containment_audit_surface))

  const clone = { ...one }
  delete clone.canonical_hash
  assert.equal(one.canonical_hash, sha256Hex(canonicalize(clone)))
})

test('issue-1147: classification coverage fixtures', () => {
  const fixtures = [
    ['TOPOLOGY_AMPLIFICATION', [{ surface_id: 'n1', topology_neighbors: ['a', 'b', 'c'] }], 100],
    ['RECONCILIATION_AMPLIFICATION', [{ surface_id: 'n1', topology_neighbors: ['a'], reconciliation_channels: ['r1', 'r2'] }], 100],
    ['REPLAY_PROPAGATION_EXPANSION', [{ surface_id: 'n1', topology_neighbors: ['a'], replay_vectors: ['p1', 'p2'] }], 100],
    ['SEMANTIC_COMPLEXITY_CLUSTER', [{ surface_id: 'n1', topology_neighbors: ['a'], semantic_tags: ['s1', 's2'] }], 100],
    ['AUTHORITY_CONCENTRATION_GROWTH', [{ surface_id: 'n1', topology_neighbors: ['a'], authority_scopes: ['x', 'y'] }], 100],
    ['DEPENDENCY_FANOUT_AMPLIFICATION', [{ surface_id: 'n1', topology_neighbors: ['a'], dependency_targets: ['d1', 'd2', 'd3'] }], 100],
    ['INSTALL_BASE_SCALING_RISK', [{ surface_id: 'n1', topology_neighbors: ['a'], install_base_segments: ['s1', 's2'] }], 100],
    ['GOVERNANCE_BUDGET_WARNING', [{ surface_id: 'n1', governance_axes: ['1','2','3','4'], topology_neighbors: ['a','b'], reconciliation_channels: ['r'] }], 8],
    ['GOVERNANCE_BUDGET_EXCEEDED', [{ surface_id: 'n1', governance_axes: ['1','2','3','4'], topology_neighbors: ['a','b','c'], reconciliation_channels: ['r1','r2'], replay_vectors: ['p1','p2'] }], 8],
    ['UNKNOWN_COMPLEXITY_SURFACE', [{ surface_id: 'n1', unknown: true }], 100],
    ['GOVERNANCE_BUDGET_STABLE', [{ surface_id: 'n1', topology_neighbors: ['a'] }], 100],
  ]

  for (const [expected, surfaces, budget_limit] of fixtures) {
    const result = budgetGovernanceComplexity({ analysis_id: String(expected), evidence_only: true, budget_limit, surfaces })
    assert.equal(result.classification, expected)
  }

  assert.ok(GOVERNANCE_COMPLEXITY_CLASSIFICATIONS.includes('NULL'))
})

