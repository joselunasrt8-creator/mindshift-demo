import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  buildContainmentEnvelope,
  buildContainmentGraph,
  propagateContainment,
  computeIsolationBoundary,
  computeFederatedIsolation,
  computeContainmentCollapse,
  hashCanonical,
} from '../../runtime/reconciliation/quarantine-containment-engine.js'

const source = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../../migrations/0035_legitimacy_quarantine_registry.sql', import.meta.url), 'utf8')
const mergeGovernance = JSON.parse(readFileSync(new URL('../../governance/runtime/MERGE_GOVERNANCE_RULES.json', import.meta.url), 'utf8'))

const baseContamination = Object.freeze({
  topology_hash: 'topology-a',
  drift_summary: [
    { classification: 'UNDECLARED_SURFACE', identity: '/hidden', reason: 'execution_surface_not_declared_in_runtime_topology' },
    { classification: 'PROOF_LINEAGE_CONTAMINATION', identity: 'proof-1', reason: 'proof_lineage_contaminated' },
  ],
  topology_ancestry: ['root', 'child'],
})

test('recursive quarantine propagation determinism preserves same verdict for same contamination and topology', () => {
  const first = buildContainmentEnvelope(baseContamination)
  const second = buildContainmentEnvelope(baseContamination)
  assert.equal(first.envelope_hash, second.envelope_hash)
  assert.equal(first.verdict.verdict_hash, second.verdict.verdict_hash)
  assert.equal(first.status, 'CONTAINMENT_ACTIVE')
})

test('containment boundary equivalence is canonical-order independent', () => {
  const reordered = { ...baseContamination, drift_summary: [...baseContamination.drift_summary].reverse() }
  assert.equal(buildContainmentEnvelope(baseContamination).boundary.boundary_hash, buildContainmentEnvelope(reordered).boundary.boundary_hash)
})

test('proof contamination spread contains proof trust and collapses merge trust', () => {
  const envelope = buildContainmentEnvelope({ drift_summary: [{ classification: 'PROOF_LINEAGE_CONTAMINATION', identity: 'proof-a' }] })
  assert.ok(envelope.containment_classes.includes('PROOF_TRUST_CONTAINED'))
  assert.ok(envelope.containment_classes.includes('MERGE_TRUST_COLLAPSED'))
  assert.equal(envelope.boundary.merge_authorization_allowed, false)
})

test('federated isolation propagation isolates remote trust without inherited authority', () => {
  const federation = computeFederatedIsolation(buildContainmentGraph({ drift_summary: [{ classification: 'UNDECLARED_SURFACE', identity: 'surface-a' }] }))
  assert.equal(federation.federation_state, 'FEDERATED_TRUST_ISOLATED')
  assert.equal(federation.remote_authority_denied, true)
  assert.equal(federation.remote_execution_legitimacy, false)
})

test('topology ancestry quarantine recursively restricts downstream lineage', () => {
  const graph = buildContainmentGraph({ drift_summary: [{ classification: 'TOPOLOGY_DRIFT', identity: 'ancestor-a' }] })
  assert.ok(graph.containment_classes.includes('TOPOLOGY_ANCESTRY_QUARANTINED'))
  assert.ok(graph.containment_classes.includes('LINEAGE_TRUST_ISOLATED'))
})

test('governance contamination expansion restricts downstream coordination trust', () => {
  const graph = buildContainmentGraph({ drift_summary: [{ classification: 'GOVERNANCE_MISMATCH', identity: 'policy-a' }] })
  assert.ok(graph.containment_classes.includes('GOVERNANCE_CONTAMINATION_EXPANDED'))
  assert.ok(graph.containment_classes.includes('DOWNSTREAM_COORDINATION_RESTRICTED'))
})

test('bounded containment traversal overflows fail-closed to boundary overflow', () => {
  const graph = buildContainmentGraph(baseContamination, { maxNodes: 1 })
  const quarantine = propagateContainment(baseContamination, { maxNodes: 1 })
  assert.equal(graph.truncated, true)
  assert.ok(graph.containment_classes.includes('CONTAINMENT_BOUNDARY_OVERFLOW'))
  assert.equal(quarantine.fail_closed, true)
})

test('merge trust collapse propagation never authorizes merge', () => {
  const graph = buildContainmentGraph({ drift_summary: [{ classification: 'MERGE_LINEAGE_CONTAMINATED', identity: 'merge-a' }] })
  const boundary = computeIsolationBoundary(graph)
  const verdict = computeContainmentCollapse(graph, boundary, computeFederatedIsolation(graph))
  assert.equal(boundary.merge_legitimacy, 'NULL')
  assert.equal(verdict.governed_merge_allowed, false)
  assert.equal(verdict.preo_validity, 'NULL')
})

test('deterministic quarantine hashing uses canonical material', () => {
  const a = { b: 1, a: ['x', 'y'] }
  const b = { a: ['x', 'y'], b: 1 }
  assert.equal(hashCanonical(a), hashCanonical(b))
})

test('undeclared surface containment creates recursive and federated containment classes', () => {
  const envelope = buildContainmentEnvelope({ drift_summary: [{ classification: 'UNDECLARED_SURFACE', identity: '/shadow' }] })
  assert.ok(envelope.containment_classes.includes('FEDERATED_CONTAINMENT_REQUIRED'))
  assert.ok(envelope.containment_classes.includes('TOPOLOGY_ANCESTRY_QUARANTINED'))
  assert.equal(envelope.verdict.downstream_legitimacy, 'QUARANTINED')
})

test('quarantine registry is append-only, indexed, immutable evidence', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS legitimacy_quarantine_registry/)
  for (const indexName of ['quarantine_hash', 'containment_hash', 'lineage_hash', 'federation_hash', 'boundary_hash', 'classification']) assert.match(migration, new RegExp(`idx_legitimacy_quarantine_registry_${indexName}`))
  assert.match(migration, /trg_legitimacy_quarantine_registry_no_update/)
  assert.match(migration, /trg_legitimacy_quarantine_registry_no_delete/)
  assert.match(migration, /CHECK \(quarantine_authoritative='false'\)/)
})

test('GET-only containment observability routes are non-authoritative', () => {
  for (const route of ['/reconcile/quarantine', '/reconcile/containment', '/reconcile/isolation', '/reconcile/federation-boundary']) {
    assert.ok(source.includes(route), `missing route ${route}`)
  }
  assert.match(source, /QUARANTINE_CONTAINMENT_ROUTES\.includes\(url\.pathname as any\) && request\.method !== "GET"/)
  assert.match(source, /merge_authorization_allowed: false/)
  assert.match(source, /quarantine_authoritative: false/)
})

test('merge governance containment rules invalidate legitimacy without authorizing merge', () => {
  for (const rule of [
    'Active containment boundary -> merge legitimacy NULL',
    'Recursive quarantine propagation -> PREO invalid',
    'Federated containment divergence -> governance trust isolated',
    'Downstream contamination spread -> merge authorization prohibited',
    'Containment evidence may invalidate legitimacy but may NEVER authorize merge',
  ]) assert.ok(mergeGovernance.rules.includes(rule))
  assert.equal(mergeGovernance.legitimacy_quarantine_containment.may_authorize_merge, false)
})
