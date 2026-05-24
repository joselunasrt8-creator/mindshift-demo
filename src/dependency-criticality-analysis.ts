import { canonicalize, sha256Hex } from './canonical.js'

export const DEPENDENCY_CRITICALITY_CLASSIFICATIONS = Object.freeze([
  'DEPENDENCY_CRITICAL',
  'BLAST_RADIUS_HIGH',
  'GOVERNANCE_CONCENTRATED',
  'AUTHORITY_CONCENTRATED',
  'REPLAY_DEPENDENCY_CRITICAL',
  'RECONCILIATION_BOTTLENECK',
  'TOPOLOGY_CRITICAL_PATH',
  'SEMANTIC_CLUSTERING',
  'SINGLE_POINT_FAILURE',
  'OBSERVABILITY_ONLY',
  'UNKNOWN_DEPENDENCY_SURFACE',
  'NULL',
] as const)

type DependencyClassification = (typeof DEPENDENCY_CRITICALITY_CLASSIFICATIONS)[number]

export interface DependencyNode {
  readonly dependency_id: string
  readonly surfaces?: readonly string[]
  readonly authority_scopes?: readonly string[]
  readonly replay_channels?: readonly string[]
  readonly reconciliation_paths?: readonly string[]
  readonly semantic_tags?: readonly string[]
  readonly hidden?: boolean
  readonly unknown?: boolean
}

export interface DependencyEdge {
  readonly from: string
  readonly to: string
}

export interface DependencyCriticalityInput {
  readonly analysis_id: string
  readonly evidence_only: true
  readonly dependencies: readonly DependencyNode[]
  readonly dependency_edges?: readonly DependencyEdge[]
}

export interface DependencyCriticalityResult {
  readonly artifact_type: 'DEPENDENCY_CRITICALITY_ANALYSIS'
  readonly analysis_id: string
  readonly classification: DependencyClassification
  readonly evidence_only: true
  readonly creates_authority: false
  readonly mutates_state: false
  readonly validates_execution: false
  readonly deterministic_dependency_order: readonly string[]
  readonly deterministic_dependency_graph: readonly string[]
  readonly dependency_criticality_inventory: readonly string[]
  readonly blast_radius_inventory: readonly string[]
  readonly governance_concentration_inventory: readonly string[]
  readonly authority_concentration_inventory: readonly string[]
  readonly replay_dependency_inventory: readonly string[]
  readonly reconciliation_bottleneck_inventory: readonly string[]
  readonly topology_critical_path_inventory: readonly string[]
  readonly semantic_dependency_clustering_inventory: readonly string[]
  readonly single_point_failure_inventory: readonly string[]
  readonly observability_boundary_inventory: readonly string[]
  readonly unknown_dependency_surface_inventory: readonly string[]
  readonly graph_hash: string
}

const OBSERVABILITY_BOUNDARIES = Object.freeze([
  'evidence_only',
  'visibility_neq_authority',
  'topology_visibility_cannot_validate_execution',
  'dependency_analysis_non_authoritative',
])

function sortedUnique(values: Iterable<string>): readonly string[] {
  return Object.freeze(Array.from(new Set(values)).filter(Boolean).sort((a, b) => a.localeCompare(b)))
}

function normalizeNode(node: DependencyNode): DependencyNode {
  return {
    dependency_id: String(node?.dependency_id || ''),
    surfaces: sortedUnique((node?.surfaces || []).map((v) => String(v || ''))),
    authority_scopes: sortedUnique((node?.authority_scopes || []).map((v) => String(v || ''))),
    replay_channels: sortedUnique((node?.replay_channels || []).map((v) => String(v || ''))),
    reconciliation_paths: sortedUnique((node?.reconciliation_paths || []).map((v) => String(v || ''))),
    semantic_tags: sortedUnique((node?.semantic_tags || []).map((v) => String(v || ''))),
    hidden: Boolean(node?.hidden),
    unknown: Boolean(node?.unknown),
  }
}

function normalizeEdge(edge: DependencyEdge): DependencyEdge {
  return { from: String(edge?.from || ''), to: String(edge?.to || '') }
}

function sortEdges(edges: readonly DependencyEdge[]): readonly DependencyEdge[] {
  return Object.freeze(edges.slice().sort((a, b) => {
    const from = a.from.localeCompare(b.from)
    if (from !== 0) return from
    return a.to.localeCompare(b.to)
  }))
}

export function analyzeDependencyCriticality(input: DependencyCriticalityInput): DependencyCriticalityResult {
  if (!input || input.evidence_only !== true || !Array.isArray(input.dependencies) || input.dependencies.length === 0) {
    return Object.freeze({
      artifact_type: 'DEPENDENCY_CRITICALITY_ANALYSIS',
      analysis_id: String(input?.analysis_id || ''),
      classification: 'NULL',
      evidence_only: true,
      creates_authority: false,
      mutates_state: false,
      validates_execution: false,
      deterministic_dependency_order: Object.freeze([]),
      deterministic_dependency_graph: Object.freeze([]),
      dependency_criticality_inventory: Object.freeze([]),
      blast_radius_inventory: Object.freeze([]),
      governance_concentration_inventory: Object.freeze([]),
      authority_concentration_inventory: Object.freeze([]),
      replay_dependency_inventory: Object.freeze([]),
      reconciliation_bottleneck_inventory: Object.freeze([]),
      topology_critical_path_inventory: Object.freeze([]),
      semantic_dependency_clustering_inventory: Object.freeze([]),
      single_point_failure_inventory: Object.freeze([]),
      observability_boundary_inventory: OBSERVABILITY_BOUNDARIES,
      unknown_dependency_surface_inventory: Object.freeze([]),
      graph_hash: sha256Hex(canonicalize([])),
    })
  }

  const nodes = input.dependencies.map(normalizeNode).sort((a, b) => a.dependency_id.localeCompare(b.dependency_id))
  const nodeIds = new Set(nodes.map((n) => n.dependency_id))
  const edges = sortEdges((input.dependency_edges || []).map(normalizeEdge).filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to)))
  const labels = Object.freeze(edges.map((e) => `${e.from}->${e.to}`))

  const inbound: Record<string, number> = {}
  const outbound: Record<string, number> = {}
  for (const id of nodeIds) {
    inbound[id] = 0
    outbound[id] = 0
  }
  for (const edge of edges) {
    outbound[edge.from] += 1
    inbound[edge.to] += 1
  }

  const depCritical: string[] = []
  const blastHigh: string[] = []
  const governanceConc: string[] = []
  const authorityConc: string[] = []
  const replayCritical: string[] = []
  const reconciliationBottleneck: string[] = []
  const topologyCritical: string[] = []
  const semanticClusters: string[] = []
  const singlePoint: string[] = []
  const unknownSurfaces: string[] = []

  const semanticIndex: Record<string, string[]> = {}
  for (const node of nodes) {
    for (const tag of node.semantic_tags || []) {
      semanticIndex[tag] = semanticIndex[tag] || []
      semanticIndex[tag].push(node.dependency_id)
    }
  }

  for (const node of nodes) {
    const id = node.dependency_id
    const inCount = inbound[id]
    const outCount = outbound[id]
    const scopeCount = (node.authority_scopes || []).length
    const replayCount = (node.replay_channels || []).length
    const reconCount = (node.reconciliation_paths || []).length
    const surfaceCount = (node.surfaces || []).length
    const semanticCount = (node.semantic_tags || []).length

    if (node.hidden || node.unknown) unknownSurfaces.push(id)
    if (inCount >= 2 || outCount >= 2 || node.hidden || node.unknown) depCritical.push(id)
    if (outCount >= 2 || (outCount >= 1 && surfaceCount >= 2)) blastHigh.push(id)
    if (surfaceCount >= 2 || inCount >= 2) governanceConc.push(id)
    if (scopeCount >= 2 || (scopeCount >= 1 && inCount >= 2)) authorityConc.push(id)
    if (replayCount >= 2 || (replayCount >= 1 && inCount >= 2)) replayCritical.push(id)
    if (reconCount >= 2 || (reconCount >= 1 && inCount >= 2)) reconciliationBottleneck.push(id)
    if (inCount >= 1 && outCount >= 1) topologyCritical.push(id)
    if (semanticCount >= 2) semanticClusters.push(id)
    if (inCount === 0 && outCount >= 2) singlePoint.push(id)
  }

  for (const [tag, ids] of Object.entries(semanticIndex)) {
    if (ids.length >= 2) semanticClusters.push(`cluster:${tag}`)
  }

  const dependencyCriticalityInventory = sortedUnique(depCritical)
  const blastRadiusInventory = sortedUnique(blastHigh)
  const governanceConcentrationInventory = sortedUnique(governanceConc)
  const authorityConcentrationInventory = sortedUnique(authorityConc)
  const replayDependencyInventory = sortedUnique(replayCritical)
  const reconciliationBottleneckInventory = sortedUnique(reconciliationBottleneck)
  const topologyCriticalPathInventory = sortedUnique(topologyCritical)
  const semanticDependencyClusteringInventory = sortedUnique(semanticClusters)
  const singlePointFailureInventory = sortedUnique(singlePoint)
  const unknownDependencySurfaceInventory = sortedUnique(unknownSurfaces)

  let classification: DependencyClassification = 'OBSERVABILITY_ONLY'
  if (unknownDependencySurfaceInventory.length > 0) classification = 'UNKNOWN_DEPENDENCY_SURFACE'
  else if (singlePointFailureInventory.length > 0) classification = 'SINGLE_POINT_FAILURE'
  else if (blastRadiusInventory.length > 0) classification = 'BLAST_RADIUS_HIGH'
  else if (dependencyCriticalityInventory.length > 0) classification = 'DEPENDENCY_CRITICAL'

  const payload = {
    artifact_type: 'DEPENDENCY_CRITICALITY_ANALYSIS' as const,
    analysis_id: String(input.analysis_id || ''),
    classification,
    evidence_only: true as const,
    creates_authority: false as const,
    mutates_state: false as const,
    validates_execution: false as const,
    deterministic_dependency_order: Object.freeze(nodes.map((n) => n.dependency_id)),
    deterministic_dependency_graph: labels,
    dependency_criticality_inventory: dependencyCriticalityInventory,
    blast_radius_inventory: blastRadiusInventory,
    governance_concentration_inventory: governanceConcentrationInventory,
    authority_concentration_inventory: authorityConcentrationInventory,
    replay_dependency_inventory: replayDependencyInventory,
    reconciliation_bottleneck_inventory: reconciliationBottleneckInventory,
    topology_critical_path_inventory: topologyCriticalPathInventory,
    semantic_dependency_clustering_inventory: semanticDependencyClusteringInventory,
    single_point_failure_inventory: singlePointFailureInventory,
    observability_boundary_inventory: OBSERVABILITY_BOUNDARIES,
    unknown_dependency_surface_inventory: unknownDependencySurfaceInventory,
  }

  return Object.freeze({ ...payload, graph_hash: sha256Hex(canonicalize(payload.deterministic_dependency_graph)) })
}
