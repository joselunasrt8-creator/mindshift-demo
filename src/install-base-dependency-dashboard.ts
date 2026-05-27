/**
 * src/install-base-dependency-dashboard.ts
 * Issue #1425 — Install-Base Dependency Dashboard v1
 *
 * Evidence-only, observability-only dashboard aggregator for the MindShift
 * legitimacy infrastructure. Assembles governed execution metrics, replay rejection
 * visibility, proof lineage, continuity lineage, reconciliation status,
 * distributed disagreement tracking, topology dependency graphs, and legitimacy
 * surface closure maps into a unified, immutable dashboard snapshot.
 *
 * Core invariants:
 *   observability ≠ authority
 *   visibility ≠ legitimacy
 *
 * Constraints:
 *   - Dashboard remains observability-only
 *   - Telemetry cannot mutate runtime state
 *   - Visualization cannot alter legitimacy outcomes
 *   - Replay-safe lineage must remain preserved
 */

import { canonicalize, sha256Hex } from './canonical.js'

// ── Panel result constants ─────────────────────────────────────────────────────

export const DASHBOARD_PANEL_STATES = {
  POPULATED: 'PANEL_POPULATED',
  EMPTY: 'PANEL_EMPTY',
  NULL: 'PANEL_NULL',
} as const

export type DashboardPanelState = (typeof DASHBOARD_PANEL_STATES)[keyof typeof DASHBOARD_PANEL_STATES]

export const DASHBOARD_RESULTS = {
  ASSEMBLED: 'DASHBOARD_ASSEMBLED',
  NULL: 'DASHBOARD_NULL',
} as const

export type DashboardResult = (typeof DASHBOARD_RESULTS)[keyof typeof DASHBOARD_RESULTS]

// ── Panel type definitions ─────────────────────────────────────────────────────

export interface GovernedExecutionMetricsPanel {
  readonly panel_id: 'governed_execution_metrics'
  readonly state: DashboardPanelState
  readonly governed_surface_count: number
  readonly ungoverned_surface_count: number
  readonly validation_success_count: number
  readonly validation_failure_count: number
  readonly proof_persistence_count: number
  readonly canonical_chain: readonly string[]
  readonly panel_hash: string
}

export interface ReplayRejectionVisibilityPanel {
  readonly panel_id: 'replay_rejection_visibility'
  readonly state: DashboardPanelState
  readonly replay_rejection_count: number
  readonly replay_resurrection_count: number
  readonly open_replay_surfaces: readonly string[]
  readonly panel_hash: string
}

export interface ProofLineagePanel {
  readonly panel_id: 'proof_lineage'
  readonly state: DashboardPanelState
  readonly proof_nodes: readonly string[]
  readonly lineage_edges: readonly { readonly from: string; readonly to: string }[]
  readonly proof_coverage_count: number
  readonly missing_proof_count: number
  readonly panel_hash: string
}

export interface ContinuityLineagePanel {
  readonly panel_id: 'continuity_lineage'
  readonly state: DashboardPanelState
  readonly lineage_chain: readonly string[]
  readonly continuity_gap_count: number
  readonly continuity_revocation_count: number
  readonly panel_hash: string
}

export interface ReconciliationStatusPanel {
  readonly panel_id: 'reconciliation_status'
  readonly state: DashboardPanelState
  readonly reconciliation_drift_count: number
  readonly quarantine_count: number
  readonly open_gap_count: number
  readonly contained_gap_count: number
  readonly panel_hash: string
}

export interface DistributedDisagreementPanel {
  readonly panel_id: 'distributed_disagreement'
  readonly state: DashboardPanelState
  readonly distributed_disagreement_count: number
  readonly split_brain_count: number
  readonly causal_divergence_count: number
  readonly topology_drift_count: number
  readonly disagreement_surfaces: readonly string[]
  readonly panel_hash: string
}

export interface TopologyDependencyGraphPanel {
  readonly panel_id: 'topology_dependency_graph'
  readonly state: DashboardPanelState
  readonly nodes: readonly { readonly node_id: string; readonly node_type: string; readonly classification: string }[]
  readonly edges: readonly { readonly from: string; readonly to: string; readonly edge_type: string }[]
  readonly install_base_signal: number
  readonly panel_hash: string
}

export interface LegitimacySurfaceClosurePanel {
  readonly panel_id: 'legitimacy_surface_closure'
  readonly state: DashboardPanelState
  readonly total_surface_count: number
  readonly closed_surface_count: number
  readonly open_gap_surface_count: number
  readonly closure_classifications: readonly { readonly surface_id: string; readonly closure_state: string }[]
  readonly panel_hash: string
}

// ── Dashboard snapshot type ────────────────────────────────────────────────────

export interface InstallBaseDependencyDashboard {
  readonly artifact_type: 'INSTALL_BASE_DEPENDENCY_DASHBOARD'
  readonly dashboard_version: 'v1'
  readonly evidence_only: true
  readonly creates_authority: false
  readonly mutates_state: false
  readonly validates_execution: false
  readonly telemetry_boundary: 'observability_only_evidence_only_non_executable'
  readonly dashboard_result: DashboardResult
  readonly panels: {
    readonly governed_execution_metrics: GovernedExecutionMetricsPanel
    readonly replay_rejection_visibility: ReplayRejectionVisibilityPanel
    readonly proof_lineage: ProofLineagePanel
    readonly continuity_lineage: ContinuityLineagePanel
    readonly reconciliation_status: ReconciliationStatusPanel
    readonly distributed_disagreement: DistributedDisagreementPanel
    readonly topology_dependency_graph: TopologyDependencyGraphPanel
    readonly legitimacy_surface_closure: LegitimacySurfaceClosurePanel
  }
  readonly dashboard_hash: string
}

// ── Dashboard input type ───────────────────────────────────────────────────────

export interface DashboardInput {
  readonly evidence_only: true
  readonly install_base_telemetry?: {
    readonly categories?: {
      readonly runtime_dependency?: Record<string, number>
      readonly workflow_dependency?: Record<string, number>
      readonly ecosystem_dependency?: Record<string, number>
    }
    readonly classifications?: Record<string, number>
    readonly metrics?: Record<string, unknown>
    readonly canonical_chain?: readonly string[]
  }
  readonly legitimacy_telemetry?: {
    readonly metric_registry?: Record<string, number>
    readonly dependency_concentration_inventory?: readonly string[]
    readonly topology_drift_inventory?: readonly string[]
    readonly reconciliation_divergence_inventory?: readonly string[]
    readonly replay_rejection_inventory?: readonly string[]
  }
  readonly topology_projection?: {
    readonly nodes?: readonly { readonly node_id: string; readonly node_type: string; readonly state: string }[]
    readonly edges?: readonly { readonly edge_id: string; readonly edge_type: string; readonly from: string; readonly to: string }[]
    readonly metrics?: Record<string, number>
  }
  readonly surface_closure_input?: {
    readonly surfaces?: readonly { readonly surface_id: string; readonly sovereignty_tier?: string; readonly closure_state?: string }[]
  }
}

// ── Internal helpers ───────────────────────────────────────────────────────────

const CANONICAL_CHAIN = Object.freeze([
  '/session', '/continuity', '/authority', '/compile', '/validate', '/execute', '/proof',
])

function panelHash(panel: object): string {
  return sha256Hex(canonicalize(panel))
}

function safeNum(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0
}

function safeArr<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : []
}

function sortedUnique(values: string[]): readonly string[] {
  return Object.freeze(Array.from(new Set(values)).sort())
}

// ── Panel builders ─────────────────────────────────────────────────────────────

function buildGovernedExecutionMetricsPanel(input: DashboardInput): GovernedExecutionMetricsPanel {
  const rt = input.install_base_telemetry?.categories?.runtime_dependency ?? {}
  const metrics = input.install_base_telemetry?.metrics ?? {}
  const chainRaw = safeArr<string>(input.install_base_telemetry?.canonical_chain)
  const canonical_chain = chainRaw.length > 0
    ? Object.freeze(chainRaw.map(String))
    : CANONICAL_CHAIN

  const governed_surface_count = safeNum(metrics.governed_surface_count)
  const ungoverned_surface_count = safeNum(metrics.ungoverned_surface_count)
  const validation_success_count = safeNum(rt.validation_success_count)
  const validation_failure_count = safeNum(rt.validation_failure_count)
  const proof_persistence_count = safeNum(rt.proof_persistence_count)

  const state: DashboardPanelState =
    governed_surface_count > 0 || validation_success_count > 0
      ? DASHBOARD_PANEL_STATES.POPULATED
      : DASHBOARD_PANEL_STATES.EMPTY

  const core = {
    panel_id: 'governed_execution_metrics' as const,
    state,
    governed_surface_count,
    ungoverned_surface_count,
    validation_success_count,
    validation_failure_count,
    proof_persistence_count,
    canonical_chain,
  }
  return Object.freeze({ ...core, panel_hash: panelHash(core) })
}

function buildReplayRejectionVisibilityPanel(input: DashboardInput): ReplayRejectionVisibilityPanel {
  const rt = input.install_base_telemetry?.categories?.runtime_dependency ?? {}
  const ltm = input.legitimacy_telemetry?.metric_registry ?? {}
  const replayInventory = safeArr<string>(input.legitimacy_telemetry?.replay_rejection_inventory)

  const replay_rejection_count =
    safeNum(rt.replay_rejection_count) + safeNum(ltm.replay_rejection_total)
  const replay_resurrection_count = safeNum(ltm.replay_resurrection_total)
  const open_replay_surfaces = sortedUnique(replayInventory.map(String))

  const state: DashboardPanelState =
    replay_rejection_count > 0 || replay_resurrection_count > 0
      ? DASHBOARD_PANEL_STATES.POPULATED
      : DASHBOARD_PANEL_STATES.EMPTY

  const core = {
    panel_id: 'replay_rejection_visibility' as const,
    state,
    replay_rejection_count,
    replay_resurrection_count,
    open_replay_surfaces,
  }
  return Object.freeze({ ...core, panel_hash: panelHash(core) })
}

function buildProofLineagePanel(input: DashboardInput): ProofLineagePanel {
  const rt = input.install_base_telemetry?.categories?.runtime_dependency ?? {}
  const classifications = input.install_base_telemetry?.classifications ?? {}

  const proof_coverage_count =
    safeNum(classifications.PROOF_DEPENDENCY) + safeNum(rt.proof_persistence_count)
  const missing_proof_count = safeNum(rt.validation_failure_count)

  const proof_nodes = CANONICAL_CHAIN
  const lineage_edges = Object.freeze(
    CANONICAL_CHAIN.slice(0, -1).map((from, i) =>
      Object.freeze({ from, to: CANONICAL_CHAIN[i + 1] }),
    ),
  )

  const state: DashboardPanelState = proof_coverage_count > 0
    ? DASHBOARD_PANEL_STATES.POPULATED
    : DASHBOARD_PANEL_STATES.EMPTY

  const core = {
    panel_id: 'proof_lineage' as const,
    state,
    proof_nodes,
    lineage_edges,
    proof_coverage_count,
    missing_proof_count,
  }
  return Object.freeze({ ...core, panel_hash: panelHash(core) })
}

function buildContinuityLineagePanel(input: DashboardInput): ContinuityLineagePanel {
  const rt = input.install_base_telemetry?.categories?.runtime_dependency ?? {}
  const ltm = input.legitimacy_telemetry?.metric_registry ?? {}

  const continuity_revocation_count =
    safeNum(rt.continuity_revocation_count) + safeNum(ltm.continuity_revocation_total)
  const continuity_gap_count = safeNum(rt.reconciliation_drift_count)
  const lineage_chain = CANONICAL_CHAIN

  const state: DashboardPanelState =
    continuity_revocation_count > 0 || continuity_gap_count > 0
      ? DASHBOARD_PANEL_STATES.POPULATED
      : DASHBOARD_PANEL_STATES.EMPTY

  const core = {
    panel_id: 'continuity_lineage' as const,
    state,
    lineage_chain,
    continuity_gap_count,
    continuity_revocation_count,
  }
  return Object.freeze({ ...core, panel_hash: panelHash(core) })
}

function buildReconciliationStatusPanel(input: DashboardInput): ReconciliationStatusPanel {
  const rt = input.install_base_telemetry?.categories?.runtime_dependency ?? {}
  const metrics = input.install_base_telemetry?.metrics ?? {}
  const ltm = input.legitimacy_telemetry?.metric_registry ?? {}

  const reconciliation_drift_count =
    safeNum(rt.reconciliation_drift_count) + safeNum(ltm.reconciliation_failure_total)
  const quarantine_count = safeNum(rt.deterministic_quarantine_count)
  const open_gap_count = safeNum(metrics.open_sovereignty_gap_count)
  const contained_gap_count = safeNum(metrics.contained_sovereignty_gap_count)

  const state: DashboardPanelState =
    reconciliation_drift_count > 0 || open_gap_count > 0
      ? DASHBOARD_PANEL_STATES.POPULATED
      : DASHBOARD_PANEL_STATES.EMPTY

  const core = {
    panel_id: 'reconciliation_status' as const,
    state,
    reconciliation_drift_count,
    quarantine_count,
    open_gap_count,
    contained_gap_count,
  }
  return Object.freeze({ ...core, panel_hash: panelHash(core) })
}

function buildDistributedDisagreementPanel(input: DashboardInput): DistributedDisagreementPanel {
  const ltm = input.legitimacy_telemetry?.metric_registry ?? {}
  const driftInventory = safeArr<string>(input.legitimacy_telemetry?.topology_drift_inventory)
  const reconInventory = safeArr<string>(
    input.legitimacy_telemetry?.reconciliation_divergence_inventory,
  )

  const distributed_disagreement_count = safeNum(ltm.distributed_disagreement_total)
  const split_brain_count = safeNum(ltm.split_brain_total)
  const causal_divergence_count = safeNum(ltm.causal_divergence_total)
  const topology_drift_count = safeNum(ltm.topology_drift_total)
  const disagreement_surfaces = sortedUnique([
    ...driftInventory.map(String),
    ...reconInventory.map(String),
  ])

  const state: DashboardPanelState =
    distributed_disagreement_count > 0 || split_brain_count > 0 || topology_drift_count > 0
      ? DASHBOARD_PANEL_STATES.POPULATED
      : DASHBOARD_PANEL_STATES.EMPTY

  const core = {
    panel_id: 'distributed_disagreement' as const,
    state,
    distributed_disagreement_count,
    split_brain_count,
    causal_divergence_count,
    topology_drift_count,
    disagreement_surfaces,
  }
  return Object.freeze({ ...core, panel_hash: panelHash(core) })
}

function buildTopologyDependencyGraphPanel(input: DashboardInput): TopologyDependencyGraphPanel {
  const proj = input.topology_projection
  const classifications = input.install_base_telemetry?.classifications ?? {}

  type RawNode = { node_id: string; node_type: string; state: string }
  type RawEdge = { edge_id: string; edge_type: string; from: string; to: string }

  const rawNodes = safeArr<RawNode>(proj?.nodes)
  const rawEdges = safeArr<RawEdge>(proj?.edges)

  const nodes = Object.freeze(
    rawNodes
      .map((n) =>
        Object.freeze({
          node_id: String(n.node_id || ''),
          node_type: String(n.node_type || ''),
          classification: String(n.state || 'UNKNOWN'),
        }),
      )
      .sort((a, b) => a.node_id.localeCompare(b.node_id)),
  )

  const edges = Object.freeze(
    rawEdges
      .map((e) =>
        Object.freeze({
          from: String(e.from || ''),
          to: String(e.to || ''),
          edge_type: String(e.edge_type || ''),
        }),
      )
      .sort((a, b) => `${a.from}:${a.to}`.localeCompare(`${b.from}:${b.to}`)),
  )

  const install_base_signal = Object.values(classifications).reduce(
    (sum, v) => sum + safeNum(v),
    0,
  )

  const state: DashboardPanelState = nodes.length > 0
    ? DASHBOARD_PANEL_STATES.POPULATED
    : DASHBOARD_PANEL_STATES.EMPTY

  const core = {
    panel_id: 'topology_dependency_graph' as const,
    state,
    nodes,
    edges,
    install_base_signal,
  }
  return Object.freeze({ ...core, panel_hash: panelHash(core) })
}

function buildLegitimacySurfaceClosurePanel(input: DashboardInput): LegitimacySurfaceClosurePanel {
  type RawSurface = { surface_id: string; sovereignty_tier?: string; closure_state?: string }
  const rawSurfaces = safeArr<RawSurface>(input.surface_closure_input?.surfaces)

  const closure_classifications = Object.freeze(
    rawSurfaces
      .map((s) => {
        const tier = String(s.sovereignty_tier || 'UNKNOWN')
        const closure_state = s.closure_state
          ? String(s.closure_state)
          : tier === 'S0' || tier === 'S1'
            ? 'CLOSED'
            : 'OPEN'
        return Object.freeze({ surface_id: String(s.surface_id || ''), closure_state })
      })
      .sort((a, b) => a.surface_id.localeCompare(b.surface_id)),
  )

  const total_surface_count = closure_classifications.length
  const closed_surface_count = closure_classifications.filter(
    (c) => c.closure_state === 'CLOSED',
  ).length
  const open_gap_surface_count = total_surface_count - closed_surface_count

  const state: DashboardPanelState = total_surface_count > 0
    ? DASHBOARD_PANEL_STATES.POPULATED
    : DASHBOARD_PANEL_STATES.EMPTY

  const core = {
    panel_id: 'legitimacy_surface_closure' as const,
    state,
    total_surface_count,
    closed_surface_count,
    open_gap_surface_count,
    closure_classifications,
  }
  return Object.freeze({ ...core, panel_hash: panelHash(core) })
}

// ── Dashboard hash ─────────────────────────────────────────────────────────────

export function computeDashboardHash(fields: Record<string, unknown>): string {
  const { dashboard_hash: _excluded, ...rest } = fields
  return sha256Hex(canonicalize(rest))
}

// ── Null dashboard builder ─────────────────────────────────────────────────────

function buildNullDashboard(): InstallBaseDependencyDashboard {
  const fields: Record<string, unknown> = {
    artifact_type: 'INSTALL_BASE_DEPENDENCY_DASHBOARD',
    dashboard_version: 'v1',
    evidence_only: true,
    creates_authority: false,
    mutates_state: false,
    validates_execution: false,
    telemetry_boundary: 'observability_only_evidence_only_non_executable',
    dashboard_result: DASHBOARD_RESULTS.NULL,
    panels: Object.freeze({}),
  }
  return Object.freeze({
    ...fields,
    dashboard_hash: computeDashboardHash(fields),
  }) as unknown as InstallBaseDependencyDashboard
}

// ── Main builder ───────────────────────────────────────────────────────────────

/**
 * Builds an INSTALL_BASE_DEPENDENCY_DASHBOARD evidence artifact from install-base
 * telemetry, legitimacy telemetry, topology projection, and surface closure inputs.
 *
 * Evidence only — observability only. Cannot create authority, mutate runtime state,
 * alter legitimacy outcomes, or affect replay-safe lineage.
 * Fail-closed: returns NULL dashboard when evidence_only is not explicitly true.
 */
export function buildInstallBaseDependencyDashboard(
  input: unknown,
): InstallBaseDependencyDashboard {
  if (
    input === null ||
    input === undefined ||
    typeof input !== 'object' ||
    Array.isArray(input)
  ) {
    return buildNullDashboard()
  }

  const obj = input as DashboardInput
  if (obj.evidence_only !== true) {
    return buildNullDashboard()
  }

  const governed_execution_metrics = buildGovernedExecutionMetricsPanel(obj)
  const replay_rejection_visibility = buildReplayRejectionVisibilityPanel(obj)
  const proof_lineage = buildProofLineagePanel(obj)
  const continuity_lineage = buildContinuityLineagePanel(obj)
  const reconciliation_status = buildReconciliationStatusPanel(obj)
  const distributed_disagreement = buildDistributedDisagreementPanel(obj)
  const topology_dependency_graph = buildTopologyDependencyGraphPanel(obj)
  const legitimacy_surface_closure = buildLegitimacySurfaceClosurePanel(obj)

  const panels = Object.freeze({
    governed_execution_metrics,
    replay_rejection_visibility,
    proof_lineage,
    continuity_lineage,
    reconciliation_status,
    distributed_disagreement,
    topology_dependency_graph,
    legitimacy_surface_closure,
  })

  const fields: Record<string, unknown> = {
    artifact_type: 'INSTALL_BASE_DEPENDENCY_DASHBOARD',
    dashboard_version: 'v1',
    evidence_only: true,
    creates_authority: false,
    mutates_state: false,
    validates_execution: false,
    telemetry_boundary: 'observability_only_evidence_only_non_executable',
    dashboard_result: DASHBOARD_RESULTS.ASSEMBLED,
    panels,
  }

  return Object.freeze({
    ...fields,
    dashboard_hash: computeDashboardHash(fields),
  }) as InstallBaseDependencyDashboard
}
