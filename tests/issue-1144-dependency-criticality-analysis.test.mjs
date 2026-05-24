import test from 'node:test'
import assert from 'node:assert/strict'

import { canonicalize, sha256Hex } from '../src/canonical.js'
import { analyzeDependencyCriticality } from '../src/dependency-criticality-analysis.ts'

const deps = [
  {
    dependency_id: 'authority-ledger',
    surfaces: ['authority', 'compile', 'validate'],
    authority_scopes: ['root', 'delegated'],
    replay_channels: ['execution', 'proof'],
    reconciliation_paths: ['cross-registry', 'lineage'],
    semantic_tags: ['authority', 'governance'],
  },
  {
    dependency_id: 'replay-index',
    surfaces: ['validate', 'execute'],
    authority_scopes: ['delegated'],
    replay_channels: ['execution', 'continuity'],
    reconciliation_paths: ['lineage'],
    semantic_tags: ['replay', 'governance'],
  },
  {
    dependency_id: 'topology-view',
    surfaces: ['telemetry'],
    semantic_tags: ['topology', 'observability'],
  },
  {
    dependency_id: 'unknown-shadow',
    surfaces: ['shadow'],
    unknown: true,
    semantic_tags: ['hidden'],
  },
]

const edges = [
  { from: 'authority-ledger', to: 'replay-index' },
  { from: 'authority-ledger', to: 'topology-view' },
  { from: 'replay-index', to: 'topology-view' },
  { from: 'authority-ledger', to: 'unknown-shadow' },
]

function buildInput(overrides = {}) {
  return {
    analysis_id: 'issue-1144',
    evidence_only: true,
    dependencies: deps,
    dependency_edges: edges,
    ...overrides,
  }
}

test('Issue #1144: deterministic traversal and blast-radius ordering', () => {
  const result = analyzeDependencyCriticality(buildInput({ dependencies: [...deps].reverse(), dependency_edges: [...edges].reverse() }))
  assert.deepEqual(result.deterministic_dependency_order, ['authority-ledger', 'replay-index', 'topology-view', 'unknown-shadow'])
  assert.deepEqual(result.deterministic_dependency_graph, [
    'authority-ledger->replay-index',
    'authority-ledger->topology-view',
    'authority-ledger->unknown-shadow',
    'replay-index->topology-view',
  ])
  assert.deepEqual(result.blast_radius_inventory, ['authority-ledger', 'replay-index'])
})

test('Issue #1144: concentration and bottleneck inventories', () => {
  const result = analyzeDependencyCriticality(buildInput())
  assert.equal(result.classification, 'UNKNOWN_DEPENDENCY_SURFACE')
  assert.deepEqual(result.dependency_criticality_inventory, ['authority-ledger', 'topology-view', 'unknown-shadow'])
  assert.deepEqual(result.governance_concentration_inventory, ['authority-ledger', 'replay-index', 'topology-view'])
  assert.deepEqual(result.authority_concentration_inventory, ['authority-ledger'])
  assert.deepEqual(result.replay_dependency_inventory, ['authority-ledger', 'replay-index'])
  assert.deepEqual(result.reconciliation_bottleneck_inventory, ['authority-ledger'])
  assert.deepEqual(result.topology_critical_path_inventory, ['replay-index'])
  assert.ok(result.semantic_dependency_clustering_inventory.includes('cluster:governance'))
  assert.deepEqual(result.single_point_failure_inventory, ['authority-ledger'])
  assert.deepEqual(result.unknown_dependency_surface_inventory, ['unknown-shadow'])
})

test('Issue #1144: observability-only and non-authoritative semantics', () => {
  const result = analyzeDependencyCriticality(buildInput())
  assert.equal(result.evidence_only, true)
  assert.equal(result.creates_authority, false)
  assert.equal(result.mutates_state, false)
  assert.equal(result.validates_execution, false)
  assert.ok(result.observability_boundary_inventory.includes('visibility_neq_authority'))
})

test('Issue #1144: canonical hashing verification and frozen output', () => {
  const result = analyzeDependencyCriticality(buildInput())
  assert.equal(result.graph_hash, sha256Hex(canonicalize(result.deterministic_dependency_graph)))
  assert.ok(Object.isFrozen(result))
  assert.ok(Object.isFrozen(result.dependency_criticality_inventory))
})

test('Issue #1144: fail-closed NULL behavior', () => {
  const result = analyzeDependencyCriticality({ analysis_id: 'x', evidence_only: true, dependencies: [] })
  assert.equal(result.classification, 'NULL')
  assert.deepEqual(result.deterministic_dependency_order, [])
})
