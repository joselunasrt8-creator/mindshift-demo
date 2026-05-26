import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  creates_authority,
  creates_execution,
  classifyTopologyVisibility,
  validateTopologySnapshot,
  topologyVisibilityToFinalityGuard,
  topologyVisibilityToFinalityClassification,
  topologyEvidenceFlags,
  buildTopologySnapshotHash,
  buildTopologySnapshotId,
} from '../../src/lib/topology-visibility.js'
import { classifyFromPredicates } from '../../src/lib/finality-classification.js'

const fixture = JSON.parse(
  readFileSync('tests/fixtures/stage2/topology_invisible.json', 'utf8'),
)
const migration0059Sql = readFileSync(
  'migrations/0059_topology_visibility_enforcement.sql',
  'utf8',
)

// ── CONF-DIST-09: Topology invisibility returns NULL / AMBIGUOUS ───────────────
//
// Stage 2 invariant: topology visibility ≠ legitimacy.
// Invisible, missing, stale, partial, or ambiguous topology snapshots must
// block GLOBAL_VALID without exception. Topology visibility alone cannot
// create authority or execution eligibility.
//
// Reference: docs/stage2-distributed-legitimacy-enforcement-plan-v1.md §14
// Anchor issue: #1408  Supporting: #1352, #1418, #1442, #1340, #1440, #1405

// ── Non-operative meta-assertions ────────────────────────────────────────────

test('CONF-DIST-09: fixture is non-operative', () => {
  assert.equal(fixture._non_operative, true)
})

test('CONF-DIST-09: topology-visibility module creates_authority is false', () => {
  assert.equal(creates_authority, false)
})

test('CONF-DIST-09: topology-visibility module creates_execution is false', () => {
  assert.equal(creates_execution, false)
})

test('CONF-DIST-09: fixture expected outcome is AMBIGUOUS (primary scenario)', () => {
  assert.equal(fixture.expected_classification, 'AMBIGUOUS')
})

test('CONF-DIST-09: fixture forbidden_classifications includes GLOBAL_VALID', () => {
  assert.ok(fixture.forbidden_classifications.includes('GLOBAL_VALID'))
})

test('CONF-DIST-09: fixture forbidden_classifications includes LOCAL_VALID', () => {
  assert.ok(fixture.forbidden_classifications.includes('LOCAL_VALID'))
})

// ── Null snapshot → TOPOLOGY_NULL ────────────────────────────────────────────

test('CONF-DIST-09: null topology snapshot → TOPOLOGY_NULL', () => {
  const result = classifyTopologyVisibility(null)
  assert.equal(result.topology_visibility, 'TOPOLOGY_NULL')
})

test('CONF-DIST-09: null topology snapshot → finality_guard=false', () => {
  const result = classifyTopologyVisibility(null)
  assert.equal(result.finality_guard, false)
})

test('CONF-DIST-09: null topology snapshot → classification=BLOCKING', () => {
  const result = classifyTopologyVisibility(null)
  assert.equal(result.classification, 'BLOCKING')
})

test('CONF-DIST-09: null topology snapshot → creates_authority remains false', () => {
  const result = classifyTopologyVisibility(null)
  assert.equal(result.creates_authority, false)
})

test('CONF-DIST-09: null topology snapshot → creates_execution remains false', () => {
  const result = classifyTopologyVisibility(null)
  assert.equal(result.creates_execution, false)
})

test('CONF-DIST-09: null snapshot → finality guard blocks GLOBAL_VALID via classifyFromPredicates', () => {
  const result = classifyTopologyVisibility(null)
  const topologyPresent = topologyVisibilityToFinalityGuard(result.topology_visibility)
  const finalityResult = classifyFromPredicates(fixture.predicate_snapshot, topologyPresent, fixture.epoch_status)
  assert.notEqual(finalityResult, 'GLOBAL_VALID')
  assert.notEqual(finalityResult, 'LOCAL_VALID')
})

// ── Invisible snapshot (no observed nodes) → TOPOLOGY_INVISIBLE ──────────────

test('CONF-DIST-09: snapshot with no observed nodes → TOPOLOGY_INVISIBLE', () => {
  const c = fixture.cases.find(c => c._name === 'invisible_topology_no_observed_nodes')
  const result = classifyTopologyVisibility(c.topology_snapshot)
  assert.equal(result.topology_visibility, 'TOPOLOGY_INVISIBLE')
  assert.equal(result.topology_visibility, c.expected_topology_visibility)
})

test('CONF-DIST-09: invisible snapshot → finality_guard=false', () => {
  const c = fixture.cases.find(c => c._name === 'invisible_topology_no_observed_nodes')
  const result = classifyTopologyVisibility(c.topology_snapshot)
  assert.equal(result.finality_guard, false)
  assert.equal(result.finality_guard, c.expected_finality_guard)
})

test('CONF-DIST-09: invisible snapshot → topologyVisibilityToFinalityClassification returns NULL', () => {
  const c = fixture.cases.find(c => c._name === 'invisible_topology_no_observed_nodes')
  const result = classifyTopologyVisibility(c.topology_snapshot)
  const cls = topologyVisibilityToFinalityClassification(result.topology_visibility)
  assert.equal(cls, 'NULL')
  assert.equal(cls, c.expected_finality_classification)
})

test('CONF-DIST-09: invisible snapshot blocks GLOBAL_VALID', () => {
  const c = fixture.cases.find(c => c._name === 'invisible_topology_no_observed_nodes')
  const result = classifyTopologyVisibility(c.topology_snapshot)
  const topologyPresent = topologyVisibilityToFinalityGuard(result.topology_visibility)
  const finalityResult = classifyFromPredicates(fixture.predicate_snapshot, topologyPresent, fixture.epoch_status)
  assert.notEqual(finalityResult, 'GLOBAL_VALID')
  c.forbidden_finality_classifications.forEach(f => assert.notEqual(finalityResult, f))
})

test('CONF-DIST-09: invisible snapshot → creates_authority=false', () => {
  const c = fixture.cases.find(c => c._name === 'invisible_topology_no_observed_nodes')
  const result = classifyTopologyVisibility(c.topology_snapshot)
  assert.equal(result.creates_authority, false)
})

test('CONF-DIST-09: invisible snapshot → creates_execution=false', () => {
  const c = fixture.cases.find(c => c._name === 'invisible_topology_no_observed_nodes')
  const result = classifyTopologyVisibility(c.topology_snapshot)
  assert.equal(result.creates_execution, false)
})

// ── Stale snapshot → TOPOLOGY_STALE ──────────────────────────────────────────

test('CONF-DIST-09: snapshot with stale nodes → TOPOLOGY_STALE', () => {
  const c = fixture.cases.find(c => c._name === 'stale_topology_snapshot')
  const result = classifyTopologyVisibility(c.topology_snapshot)
  assert.equal(result.topology_visibility, 'TOPOLOGY_STALE')
  assert.equal(result.topology_visibility, c.expected_topology_visibility)
})

test('CONF-DIST-09: stale snapshot → finality_guard=false', () => {
  const c = fixture.cases.find(c => c._name === 'stale_topology_snapshot')
  const result = classifyTopologyVisibility(c.topology_snapshot)
  assert.equal(result.finality_guard, false)
})

test('CONF-DIST-09: stale snapshot → topologyVisibilityToFinalityClassification returns STALE_VISIBLE', () => {
  const c = fixture.cases.find(c => c._name === 'stale_topology_snapshot')
  const result = classifyTopologyVisibility(c.topology_snapshot)
  const cls = topologyVisibilityToFinalityClassification(result.topology_visibility)
  assert.equal(cls, 'STALE_VISIBLE')
  assert.equal(cls, c.expected_finality_classification)
})

test('CONF-DIST-09: stale snapshot blocks GLOBAL_VALID', () => {
  const c = fixture.cases.find(c => c._name === 'stale_topology_snapshot')
  const result = classifyTopologyVisibility(c.topology_snapshot)
  const topologyPresent = topologyVisibilityToFinalityGuard(result.topology_visibility)
  const finalityResult = classifyFromPredicates(fixture.predicate_snapshot, topologyPresent, fixture.epoch_status)
  assert.notEqual(finalityResult, 'GLOBAL_VALID')
  c.forbidden_finality_classifications.forEach(f => assert.notEqual(finalityResult, f))
})

test('CONF-DIST-09: stale snapshot stale_nodes are preserved in result', () => {
  const c = fixture.cases.find(c => c._name === 'stale_topology_snapshot')
  const result = classifyTopologyVisibility(c.topology_snapshot)
  assert.deepEqual([...result.stale_nodes].sort(), [...c.topology_snapshot.stale_nodes].sort())
})

// ── Partial snapshot → TOPOLOGY_PARTIAL ──────────────────────────────────────

test('CONF-DIST-09: snapshot with missing nodes → TOPOLOGY_PARTIAL', () => {
  const c = fixture.cases.find(c => c._name === 'partial_topology_snapshot_missing_nodes')
  const result = classifyTopologyVisibility(c.topology_snapshot)
  assert.equal(result.topology_visibility, 'TOPOLOGY_PARTIAL')
  assert.equal(result.topology_visibility, c.expected_topology_visibility)
})

test('CONF-DIST-09: partial snapshot → finality_guard=false', () => {
  const c = fixture.cases.find(c => c._name === 'partial_topology_snapshot_missing_nodes')
  const result = classifyTopologyVisibility(c.topology_snapshot)
  assert.equal(result.finality_guard, false)
})

test('CONF-DIST-09: partial snapshot → topologyVisibilityToFinalityClassification returns PARTITION_SUSPENDED', () => {
  const c = fixture.cases.find(c => c._name === 'partial_topology_snapshot_missing_nodes')
  const result = classifyTopologyVisibility(c.topology_snapshot)
  const cls = topologyVisibilityToFinalityClassification(result.topology_visibility)
  assert.equal(cls, 'PARTITION_SUSPENDED')
  assert.equal(cls, c.expected_finality_classification)
})

test('CONF-DIST-09: partial snapshot blocks GLOBAL_VALID', () => {
  const c = fixture.cases.find(c => c._name === 'partial_topology_snapshot_missing_nodes')
  const result = classifyTopologyVisibility(c.topology_snapshot)
  const topologyPresent = topologyVisibilityToFinalityGuard(result.topology_visibility)
  const finalityResult = classifyFromPredicates(fixture.predicate_snapshot, topologyPresent, fixture.epoch_status)
  assert.notEqual(finalityResult, 'GLOBAL_VALID')
  c.forbidden_finality_classifications.forEach(f => assert.notEqual(finalityResult, f))
})

test('CONF-DIST-09: partial snapshot missing_nodes are preserved in result', () => {
  const c = fixture.cases.find(c => c._name === 'partial_topology_snapshot_missing_nodes')
  const result = classifyTopologyVisibility(c.topology_snapshot)
  assert.deepEqual([...result.missing_nodes].sort(), [...c.topology_snapshot.missing_nodes].sort())
})

// ── Ambiguous snapshot (partitioned nodes) → TOPOLOGY_AMBIGUOUS ──────────────

test('CONF-DIST-09: snapshot with partitioned nodes → TOPOLOGY_AMBIGUOUS', () => {
  const c = fixture.cases.find(c => c._name === 'ambiguous_topology_partition_detected')
  const result = classifyTopologyVisibility(c.topology_snapshot)
  assert.equal(result.topology_visibility, 'TOPOLOGY_AMBIGUOUS')
  assert.equal(result.topology_visibility, c.expected_topology_visibility)
})

test('CONF-DIST-09: ambiguous snapshot → finality_guard=false', () => {
  const c = fixture.cases.find(c => c._name === 'ambiguous_topology_partition_detected')
  const result = classifyTopologyVisibility(c.topology_snapshot)
  assert.equal(result.finality_guard, false)
})

test('CONF-DIST-09: ambiguous snapshot → topologyVisibilityToFinalityClassification returns AMBIGUOUS', () => {
  const c = fixture.cases.find(c => c._name === 'ambiguous_topology_partition_detected')
  const result = classifyTopologyVisibility(c.topology_snapshot)
  const cls = topologyVisibilityToFinalityClassification(result.topology_visibility)
  assert.equal(cls, 'AMBIGUOUS')
  assert.equal(cls, c.expected_finality_classification)
  assert.equal(cls, fixture.expected_classification)
})

test('CONF-DIST-09: ambiguous snapshot blocks GLOBAL_VALID', () => {
  const c = fixture.cases.find(c => c._name === 'ambiguous_topology_partition_detected')
  const result = classifyTopologyVisibility(c.topology_snapshot)
  const topologyPresent = topologyVisibilityToFinalityGuard(result.topology_visibility)
  const finalityResult = classifyFromPredicates(fixture.predicate_snapshot, topologyPresent, fixture.epoch_status)
  assert.notEqual(finalityResult, 'GLOBAL_VALID')
  c.forbidden_finality_classifications.forEach(f => assert.notEqual(finalityResult, f))
})

// ── All non-visible states block GLOBAL_VALID ─────────────────────────────────

test('CONF-DIST-09: all fixture cases have finality_guard=false (non-visible topology)', () => {
  for (const c of fixture.cases) {
    const result = classifyTopologyVisibility(c.topology_snapshot)
    assert.equal(result.finality_guard, false, `case ${c._name} should have finality_guard=false`)
  }
})

test('CONF-DIST-09: all fixture cases block GLOBAL_VALID via classifyFromPredicates', () => {
  for (const c of fixture.cases) {
    const result = classifyTopologyVisibility(c.topology_snapshot)
    const topologyPresent = topologyVisibilityToFinalityGuard(result.topology_visibility)
    const finalityResult = classifyFromPredicates(fixture.predicate_snapshot, topologyPresent, fixture.epoch_status)
    assert.notEqual(finalityResult, 'GLOBAL_VALID', `case ${c._name} must not produce GLOBAL_VALID`)
    assert.notEqual(finalityResult, 'LOCAL_VALID', `case ${c._name} must not produce LOCAL_VALID`)
  }
})

test('CONF-DIST-09: all fixture cases preserve creates_authority=false', () => {
  for (const c of fixture.cases) {
    const result = classifyTopologyVisibility(c.topology_snapshot)
    assert.equal(result.creates_authority, false, `case ${c._name} creates_authority must be false`)
  }
})

test('CONF-DIST-09: all fixture cases preserve creates_execution=false', () => {
  for (const c of fixture.cases) {
    const result = classifyTopologyVisibility(c.topology_snapshot)
    assert.equal(result.creates_execution, false, `case ${c._name} creates_execution must be false`)
  }
})

// ── topologyVisibilityToFinalityGuard contracts ───────────────────────────────

test('CONF-DIST-09: topologyVisibilityToFinalityGuard returns true only for TOPOLOGY_VISIBLE', () => {
  assert.equal(topologyVisibilityToFinalityGuard('TOPOLOGY_VISIBLE'), true)
  assert.equal(topologyVisibilityToFinalityGuard('TOPOLOGY_PARTIAL'), false)
  assert.equal(topologyVisibilityToFinalityGuard('TOPOLOGY_STALE'), false)
  assert.equal(topologyVisibilityToFinalityGuard('TOPOLOGY_INVISIBLE'), false)
  assert.equal(topologyVisibilityToFinalityGuard('TOPOLOGY_AMBIGUOUS'), false)
  assert.equal(topologyVisibilityToFinalityGuard('TOPOLOGY_NULL'), false)
})

test('CONF-DIST-09: topology visibility alone does not create authority (visible state)', () => {
  const visibleSnapshot = {
    topology_snapshot_id: 'tsn_visible_test',
    topology_snapshot_hash: 'aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899',
    observed_nodes: ['validator-1', 'validator-2', 'validator-3'],
    missing_nodes: [],
    stale_nodes: [],
    partitioned_nodes: [],
    observed_at: '2026-05-26T00:00:00Z',
    epoch_id: 'epoch-test-visible-01',
    visibility_classification: 'TOPOLOGY_VISIBLE',
    creates_authority: false,
    creates_execution: false,
    raw_production_apply_path: 'DENIED',
  }
  const result = classifyTopologyVisibility(visibleSnapshot)
  assert.equal(result.topology_visibility, 'TOPOLOGY_VISIBLE')
  assert.equal(result.finality_guard, true)
  assert.equal(result.creates_authority, false)
  assert.equal(result.creates_execution, false)
})

test('CONF-DIST-09: topology visibility alone does not create execution eligibility (visible state)', () => {
  const visibleSnapshot = {
    topology_snapshot_id: 'tsn_visible_exec_test',
    topology_snapshot_hash: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
    observed_nodes: ['validator-1', 'validator-2'],
    missing_nodes: [],
    stale_nodes: [],
    partitioned_nodes: [],
    observed_at: '2026-05-26T00:00:00Z',
    epoch_id: 'epoch-test-visible-02',
    visibility_classification: 'TOPOLOGY_VISIBLE',
    creates_authority: false,
    creates_execution: false,
    raw_production_apply_path: 'DENIED',
  }
  const result = classifyTopologyVisibility(visibleSnapshot)
  assert.equal(result.creates_execution, false)
})

test('CONF-DIST-09: TOPOLOGY_VISIBLE with absent base predicates does not promote to GLOBAL_VALID', () => {
  // Topology visible is necessary but not sufficient for GLOBAL_VALID.
  // All base predicates must also be satisfied.
  const incompletePredicates = {
    V: false, A: true, U: true, P: true, R: true, T: true, C: true,
    Q: true, G: true, L: true, X: true,
  }
  const result = classifyFromPredicates(incompletePredicates, true, 'EPOCH_GLOBAL_AUTHORITATIVE')
  assert.notEqual(result, 'GLOBAL_VALID')
})

// ── topologyVisibilityToFinalityClassification contracts ──────────────────────

test('CONF-DIST-09: topologyVisibilityToFinalityClassification returns null for TOPOLOGY_VISIBLE', () => {
  assert.equal(topologyVisibilityToFinalityClassification('TOPOLOGY_VISIBLE'), null)
})

test('CONF-DIST-09: topologyVisibilityToFinalityClassification returns PARTITION_SUSPENDED for TOPOLOGY_PARTIAL', () => {
  assert.equal(topologyVisibilityToFinalityClassification('TOPOLOGY_PARTIAL'), 'PARTITION_SUSPENDED')
})

test('CONF-DIST-09: topologyVisibilityToFinalityClassification returns STALE_VISIBLE for TOPOLOGY_STALE', () => {
  assert.equal(topologyVisibilityToFinalityClassification('TOPOLOGY_STALE'), 'STALE_VISIBLE')
})

test('CONF-DIST-09: topologyVisibilityToFinalityClassification returns NULL for TOPOLOGY_INVISIBLE', () => {
  assert.equal(topologyVisibilityToFinalityClassification('TOPOLOGY_INVISIBLE'), 'NULL')
})

test('CONF-DIST-09: topologyVisibilityToFinalityClassification returns AMBIGUOUS for TOPOLOGY_AMBIGUOUS', () => {
  assert.equal(topologyVisibilityToFinalityClassification('TOPOLOGY_AMBIGUOUS'), 'AMBIGUOUS')
})

test('CONF-DIST-09: topologyVisibilityToFinalityClassification returns NULL for TOPOLOGY_NULL', () => {
  assert.equal(topologyVisibilityToFinalityClassification('TOPOLOGY_NULL'), 'NULL')
})

test('CONF-DIST-09: no non-visible state maps to a classification that allows GLOBAL_VALID', () => {
  const nonVisible = ['TOPOLOGY_PARTIAL', 'TOPOLOGY_STALE', 'TOPOLOGY_INVISIBLE', 'TOPOLOGY_AMBIGUOUS', 'TOPOLOGY_NULL']
  for (const state of nonVisible) {
    const cls = topologyVisibilityToFinalityClassification(state)
    assert.notEqual(cls, 'GLOBAL_VALID', `${state} must not map to GLOBAL_VALID`)
    assert.notEqual(cls, 'CONVERGENCE_VALID', `${state} must not map to CONVERGENCE_VALID`)
    assert.notEqual(cls, 'LOCAL_VALID', `${state} must not map to LOCAL_VALID`)
  }
})

// ── topologyEvidenceFlags contracts ──────────────────────────────────────────

test('CONF-DIST-09: topologyEvidenceFlags reflects visibility state correctly', () => {
  const invisibleResult = classifyTopologyVisibility(null)
  const flags = topologyEvidenceFlags(invisibleResult)
  assert.equal(flags.is_topology_visible, 0)
  assert.equal(flags.creates_authority, false)
  assert.equal(flags.creates_execution, false)
})

test('CONF-DIST-09: topologyEvidenceFlags is_topology_visible=1 only for TOPOLOGY_VISIBLE', () => {
  const visibleSnapshot = {
    topology_snapshot_id: 'tsn_flags_test',
    topology_snapshot_hash: 'cafebabecafebabecafebabecafebabecafebabecafebabecafebabecafebabe',
    observed_nodes: ['validator-1', 'validator-2'],
    missing_nodes: [],
    stale_nodes: [],
    partitioned_nodes: [],
    observed_at: '2026-05-26T00:00:00Z',
    epoch_id: 'epoch-test-flags',
    visibility_classification: 'TOPOLOGY_VISIBLE',
    creates_authority: false,
    creates_execution: false,
    raw_production_apply_path: 'DENIED',
  }
  const visibleResult = classifyTopologyVisibility(visibleSnapshot)
  const flags = topologyEvidenceFlags(visibleResult)
  assert.equal(flags.is_topology_visible, 1)
  assert.equal(flags.creates_authority, false)
  assert.equal(flags.creates_execution, false)
})

// ── validateTopologySnapshot contracts ───────────────────────────────────────

test('CONF-DIST-09: validateTopologySnapshot returns error for null input', () => {
  const err = validateTopologySnapshot(null)
  assert.ok(typeof err === 'string' && err.length > 0)
})

test('CONF-DIST-09: validateTopologySnapshot returns error for missing topology_snapshot_hash', () => {
  const err = validateTopologySnapshot({
    observed_nodes: [], missing_nodes: [], stale_nodes: [], partitioned_nodes: [],
    epoch_id: 'ep1', observed_at: '2026-05-26T00:00:00Z',
  })
  assert.ok(typeof err === 'string')
})

test('CONF-DIST-09: validateTopologySnapshot returns null for valid snapshot', () => {
  const err = validateTopologySnapshot({
    topology_snapshot_hash: 'abc123',
    observed_nodes: ['v1'], missing_nodes: [], stale_nodes: [], partitioned_nodes: [],
    epoch_id: 'ep1', observed_at: '2026-05-26T00:00:00Z',
  })
  assert.equal(err, null)
})

// ── buildTopologySnapshotHash determinism ─────────────────────────────────────

test('CONF-DIST-09: buildTopologySnapshotHash is deterministic', () => {
  const opts = {
    observed_nodes: ['v1', 'v2'],
    missing_nodes: [],
    stale_nodes: [],
    partitioned_nodes: [],
    epoch_id: 'epoch-hash-test',
    observed_at: '2026-05-26T00:00:00Z',
  }
  const h1 = buildTopologySnapshotHash(opts)
  const h2 = buildTopologySnapshotHash(opts)
  assert.equal(h1, h2)
  assert.match(h1, /^[0-9a-f]{64}$/)
})

test('CONF-DIST-09: buildTopologySnapshotHash is order-independent for node arrays', () => {
  const base = {
    missing_nodes: [],
    stale_nodes: [],
    partitioned_nodes: [],
    epoch_id: 'epoch-order-test',
    observed_at: '2026-05-26T00:00:00Z',
  }
  const h1 = buildTopologySnapshotHash({ ...base, observed_nodes: ['v1', 'v2'] })
  const h2 = buildTopologySnapshotHash({ ...base, observed_nodes: ['v2', 'v1'] })
  assert.equal(h1, h2)
})

// ── buildTopologySnapshotId determinism ───────────────────────────────────────

test('CONF-DIST-09: buildTopologySnapshotId produces tsn_ prefix', () => {
  const id = buildTopologySnapshotId('deadbeef', 'epoch-test')
  assert.match(id, /^tsn_[0-9a-f]{64}$/)
})

test('CONF-DIST-09: buildTopologySnapshotId is deterministic', () => {
  const id1 = buildTopologySnapshotId('deadbeef', 'epoch-test')
  const id2 = buildTopologySnapshotId('deadbeef', 'epoch-test')
  assert.equal(id1, id2)
})

// ── Migration 0059 structural assertions ──────────────────────────────────────

test('CONF-DIST-09: migration 0059 creates topology_visibility_snapshot_registry table', () => {
  assert.match(migration0059Sql, /CREATE TABLE IF NOT EXISTS topology_visibility_snapshot_registry/)
})

test('CONF-DIST-09: migration 0059 defines all six visibility_classification states', () => {
  assert.match(migration0059Sql, /TOPOLOGY_VISIBLE/)
  assert.match(migration0059Sql, /TOPOLOGY_PARTIAL/)
  assert.match(migration0059Sql, /TOPOLOGY_STALE/)
  assert.match(migration0059Sql, /TOPOLOGY_INVISIBLE/)
  assert.match(migration0059Sql, /TOPOLOGY_AMBIGUOUS/)
  assert.match(migration0059Sql, /TOPOLOGY_NULL/)
})

test('CONF-DIST-09: migration 0059 defines tvsr_no_update trigger', () => {
  assert.match(migration0059Sql, /tvsr_no_update/)
  assert.match(migration0059Sql, /UPDATE is forbidden/)
})

test('CONF-DIST-09: migration 0059 defines tvsr_no_delete trigger', () => {
  assert.match(migration0059Sql, /tvsr_no_delete/)
  assert.match(migration0059Sql, /DELETE is forbidden/)
})

test('CONF-DIST-09: migration 0059 defines tvsr_no_authority_creation trigger', () => {
  assert.match(migration0059Sql, /tvsr_no_authority_creation/)
  assert.match(migration0059Sql, /topology visibility cannot create authority/)
})

test('CONF-DIST-09: migration 0059 defines tvsr_no_execution_creation trigger', () => {
  assert.match(migration0059Sql, /tvsr_no_execution_creation/)
  assert.match(migration0059Sql, /topology visibility cannot create execution eligibility/)
})

test('CONF-DIST-09: migration 0059 enforces finality_guard=0 for non-VISIBLE states', () => {
  assert.match(migration0059Sql, /tvsr_non_visible_blocks_finality_guard/)
  assert.match(migration0059Sql, /topology invisibility blocks GLOBAL_VALID/)
})

test('CONF-DIST-09: migration 0059 enforces finality_guard=1 for TOPOLOGY_VISIBLE', () => {
  assert.match(migration0059Sql, /tvsr_visible_requires_finality_guard/)
})

test('CONF-DIST-09: migration 0059 creates_authority CHECK(creates_authority = 0)', () => {
  assert.match(migration0059Sql, /creates_authority\s+INTEGER.*DEFAULT 0.*CHECK\(creates_authority = 0\)/)
})

test('CONF-DIST-09: migration 0059 creates_execution CHECK(creates_execution = 0)', () => {
  assert.match(migration0059Sql, /creates_execution\s+INTEGER.*DEFAULT 0.*CHECK\(creates_execution = 0\)/)
})

test('CONF-DIST-09: migration 0059 raw_production_apply_path DENIED guard', () => {
  assert.match(migration0059Sql, /raw_production_apply_path.*DEFAULT 'DENIED'/)
  assert.match(migration0059Sql, /raw_production_apply_path = 'DENIED'/)
})
