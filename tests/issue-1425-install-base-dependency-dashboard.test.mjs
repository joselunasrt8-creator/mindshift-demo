import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Source-level invariant checks
const dashboardSrc = readFileSync(
  new URL('../src/install-base-dependency-dashboard.ts', import.meta.url),
  'utf8',
)
const closureMapSrc = readFileSync(
  new URL('../src/legitimacy-surface-closure-map.ts', import.meta.url),
  'utf8',
)
const lineageGraphSrc = readFileSync(
  new URL('../src/continuity-lineage-graph.ts', import.meta.url),
  'utf8',
)
const pipelineSrc = readFileSync(
  new URL('../src/telemetry/append-only-ingestion-pipeline.ts', import.meta.url),
  'utf8',
)

// ── Dashboard source invariants ────────────────────────────────────────────────

test('issue-1425: dashboard declares evidence_only: true on all output artifacts', () => {
  assert.match(dashboardSrc, /evidence_only: true/)
  assert.match(dashboardSrc, /creates_authority: false/)
  assert.match(dashboardSrc, /mutates_state: false/)
  assert.match(dashboardSrc, /validates_execution: false/)
})

test('issue-1425: dashboard telemetry_boundary is observability_only_evidence_only_non_executable', () => {
  assert.match(dashboardSrc, /observability_only_evidence_only_non_executable/)
})

test('issue-1425: dashboard artifact_type is INSTALL_BASE_DEPENDENCY_DASHBOARD', () => {
  assert.match(dashboardSrc, /INSTALL_BASE_DEPENDENCY_DASHBOARD/)
})

test('issue-1425: dashboard includes all eight required panels', () => {
  assert.match(dashboardSrc, /governed_execution_metrics/)
  assert.match(dashboardSrc, /replay_rejection_visibility/)
  assert.match(dashboardSrc, /proof_lineage/)
  assert.match(dashboardSrc, /continuity_lineage/)
  assert.match(dashboardSrc, /reconciliation_status/)
  assert.match(dashboardSrc, /distributed_disagreement/)
  assert.match(dashboardSrc, /topology_dependency_graph/)
  assert.match(dashboardSrc, /legitimacy_surface_closure/)
})

test('issue-1425: dashboard fail-closed on missing evidence_only', () => {
  assert.match(dashboardSrc, /evidence_only !== true/)
  assert.match(dashboardSrc, /DASHBOARD_NULL/)
})

test('issue-1425: dashboard uses deterministic sha256 hashing', () => {
  assert.match(dashboardSrc, /sha256Hex/)
  assert.match(dashboardSrc, /canonicalize/)
  assert.match(dashboardSrc, /dashboard_hash/)
  assert.match(dashboardSrc, /panel_hash/)
})

test('issue-1425: dashboard canonical chain includes all seven steps', () => {
  assert.match(dashboardSrc, /\/session/)
  assert.match(dashboardSrc, /\/continuity/)
  assert.match(dashboardSrc, /\/authority/)
  assert.match(dashboardSrc, /\/compile/)
  assert.match(dashboardSrc, /\/validate/)
  assert.match(dashboardSrc, /\/execute/)
  assert.match(dashboardSrc, /\/proof/)
})

test('issue-1425: dashboard result constants are ASSEMBLED and NULL', () => {
  assert.match(dashboardSrc, /DASHBOARD_ASSEMBLED/)
  assert.match(dashboardSrc, /DASHBOARD_NULL/)
})

test('issue-1425: dashboard install_base_signal is present in topology panel', () => {
  assert.match(dashboardSrc, /install_base_signal/)
})

// ── Legitimacy surface closure map invariants ──────────────────────────────────

test('issue-1425: closure map declares evidence_only: true', () => {
  assert.match(closureMapSrc, /evidence_only: true/)
  assert.match(closureMapSrc, /creates_authority: false/)
  assert.match(closureMapSrc, /mutates_state: false/)
})

test('issue-1425: closure map artifact_type is LEGITIMACY_SURFACE_CLOSURE_MAP', () => {
  assert.match(closureMapSrc, /LEGITIMACY_SURFACE_CLOSURE_MAP/)
})

test('issue-1425: closure map defines CLOSED, OPEN_GAP, UNGOVERNED, UNKNOWN states', () => {
  assert.match(closureMapSrc, /CLOSED/)
  assert.match(closureMapSrc, /OPEN_GAP/)
  assert.match(closureMapSrc, /UNGOVERNED/)
  assert.match(closureMapSrc, /UNKNOWN/)
})

test('issue-1425: closure map maps S0/S1 to CLOSED and S2/S3 to OPEN_GAP', () => {
  assert.match(closureMapSrc, /S0.*CLOSED|CLOSED.*S0/s)
  assert.match(closureMapSrc, /S2.*OPEN_GAP|OPEN_GAP.*S2/s)
})

test('issue-1425: closure map fail-closed on invalid input', () => {
  assert.match(closureMapSrc, /evidence_only !== true/)
  assert.match(closureMapSrc, /CLOSURE_MAP_NULL/)
})

test('issue-1425: closure map includes closure_percentage metric', () => {
  assert.match(closureMapSrc, /closure_percentage/)
})

// ── Continuity lineage graph invariants ───────────────────────────────────────

test('issue-1425: lineage graph declares evidence_only: true', () => {
  assert.match(lineageGraphSrc, /evidence_only: true/)
  assert.match(lineageGraphSrc, /creates_authority: false/)
  assert.match(lineageGraphSrc, /mutates_state: false/)
})

test('issue-1425: lineage graph artifact_type is CONTINUITY_LINEAGE_GRAPH', () => {
  assert.match(lineageGraphSrc, /CONTINUITY_LINEAGE_GRAPH/)
})

test('issue-1425: lineage graph includes PRECEDES, HAS_GAP, HAS_REVOCATION edge types', () => {
  assert.match(lineageGraphSrc, /PRECEDES/)
  assert.match(lineageGraphSrc, /HAS_GAP/)
  assert.match(lineageGraphSrc, /HAS_REVOCATION/)
})

test('issue-1425: lineage graph fail-closed on invalid input', () => {
  assert.match(lineageGraphSrc, /evidence_only !== true/)
  assert.match(lineageGraphSrc, /LINEAGE_GRAPH_NULL/)
})

test('issue-1425: lineage graph tracks is_chain_complete metric', () => {
  assert.match(lineageGraphSrc, /is_chain_complete/)
  assert.match(lineageGraphSrc, /chain_coverage_percentage/)
})

test('issue-1425: lineage graph canonical chain has seven steps', () => {
  assert.match(lineageGraphSrc, /CANONICAL_EXECUTION_CHAIN/)
  // All seven steps present
  ;['/session', '/continuity', '/authority', '/compile', '/validate', '/execute', '/proof'].forEach(
    (step) => assert.match(lineageGraphSrc, new RegExp(step.replace('/', '\\/'))),
  )
})

// ── Append-only pipeline invariants ───────────────────────────────────────────

test('issue-1425: pipeline declares evidence_only: true', () => {
  assert.match(pipelineSrc, /evidence_only: true/)
  assert.match(pipelineSrc, /creates_authority: false/)
  assert.match(pipelineSrc, /mutates_runtime_state: false/)
})

test('issue-1425: pipeline mutation_allowed is always false', () => {
  assert.match(pipelineSrc, /mutation_allowed: false/)
})

test('issue-1425: pipeline artifact_type is APPEND_ONLY_TELEMETRY_PIPELINE', () => {
  assert.match(pipelineSrc, /APPEND_ONLY_TELEMETRY_PIPELINE/)
})

test('issue-1425: pipeline entry artifact_type is APPEND_ONLY_TELEMETRY_ENTRY', () => {
  assert.match(pipelineSrc, /APPEND_ONLY_TELEMETRY_ENTRY/)
})

test('issue-1425: pipeline carries previous_entry_hash chain for replay safety', () => {
  assert.match(pipelineSrc, /previous_entry_hash/)
  assert.match(pipelineSrc, /GENESIS_HASH/)
})

test('issue-1425: pipeline exposes verifyPipelineIntegrity function', () => {
  assert.match(pipelineSrc, /verifyPipelineIntegrity/)
})

test('issue-1425: pipeline exposes createPipeline, appendTelemetryEvent, buildPipelineFromEvents', () => {
  assert.match(pipelineSrc, /createPipeline/)
  assert.match(pipelineSrc, /appendTelemetryEvent/)
  assert.match(pipelineSrc, /buildPipelineFromEvents/)
})

test('issue-1425: pipeline sequence_number is monotonically increasing', () => {
  assert.match(pipelineSrc, /sequence_number/)
  assert.match(pipelineSrc, /pipeline\.entry_count/)
})

// ── Cross-cutting observability boundary invariants ───────────────────────────

test('issue-1425: all modules preserve observability != authority invariant', () => {
  for (const [name, src] of [
    ['dashboard', dashboardSrc],
    ['closure_map', closureMapSrc],
    ['lineage_graph', lineageGraphSrc],
    ['pipeline', pipelineSrc],
  ]) {
    assert.ok(
      src.includes('creates_authority: false') ||
        src.includes('creates_authority = false'),
      `${name} must declare creates_authority: false`,
    )
  }
})

test('issue-1425: no module contains runtime mutation or execution grants', () => {
  const forbidden = ['mutates_state: true', 'creates_authority: true', 'mutates_runtime_state: true']
  for (const [name, src] of [
    ['dashboard', dashboardSrc],
    ['closure_map', closureMapSrc],
    ['lineage_graph', lineageGraphSrc],
    ['pipeline', pipelineSrc],
  ]) {
    for (const pattern of forbidden) {
      assert.ok(!src.includes(pattern), `${name} must not contain "${pattern}"`)
    }
  }
})
