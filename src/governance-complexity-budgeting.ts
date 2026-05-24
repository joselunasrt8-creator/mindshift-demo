import { canonicalize, sha256Hex } from './canonical.js'

export const GOVERNANCE_COMPLEXITY_CLASSIFICATIONS = Object.freeze([
  'GOVERNANCE_BUDGET_STABLE',
  'GOVERNANCE_BUDGET_WARNING',
  'GOVERNANCE_BUDGET_EXCEEDED',
  'TOPOLOGY_AMPLIFICATION',
  'RECONCILIATION_AMPLIFICATION',
  'REPLAY_PROPAGATION_EXPANSION',
  'SEMANTIC_COMPLEXITY_CLUSTER',
  'AUTHORITY_CONCENTRATION_GROWTH',
  'DEPENDENCY_FANOUT_AMPLIFICATION',
  'INSTALL_BASE_SCALING_RISK',
  'UNKNOWN_COMPLEXITY_SURFACE',
  'NULL',
] as const)

type GovernanceComplexityClassification = (typeof GOVERNANCE_COMPLEXITY_CLASSIFICATIONS)[number]

export interface GovernanceComplexityNode {
  readonly surface_id: string
  readonly governance_axes?: readonly string[]
  readonly topology_neighbors?: readonly string[]
  readonly reconciliation_channels?: readonly string[]
  readonly replay_vectors?: readonly string[]
  readonly semantic_tags?: readonly string[]
  readonly authority_scopes?: readonly string[]
  readonly dependency_targets?: readonly string[]
  readonly install_base_segments?: readonly string[]
  readonly unknown?: boolean
}

export interface GovernanceComplexityBudgetingInput {
  readonly analysis_id: string
  readonly evidence_only: true
  readonly budget_limit: number
  readonly surfaces: readonly GovernanceComplexityNode[]
}

export interface GovernanceComplexityBudgetingResult {
  readonly artifact_type: 'GOVERNANCE_COMPLEXITY_BUDGETING'
  readonly analysis_id: string
  readonly classification: GovernanceComplexityClassification
  readonly evidence_only: true
  readonly creates_authority: false
  readonly mutates_state: false
  readonly validates_execution: false
  readonly deterministic_complexity_traversal: readonly string[]
  readonly deterministic_topology_ordering: readonly string[]
  readonly deterministic_budget_analysis_ordering: readonly string[]
  readonly governance_complexity_inventory: readonly string[]
  readonly topology_amplification_inventory: readonly string[]
  readonly reconciliation_amplification_inventory: readonly string[]
  readonly replay_propagation_expansion_inventory: readonly string[]
  readonly semantic_complexity_inventory: readonly string[]
  readonly authority_concentration_growth_inventory: readonly string[]
  readonly dependency_fanout_inventory: readonly string[]
  readonly governance_budget_pressure_inventory: readonly string[]
  readonly install_base_scaling_risk_inventory: readonly string[]
  readonly scalability_containment_audit_surface: Readonly<Record<string, string | number | boolean>>
  readonly canonical_hash: string
}

const OBSERVABILITY_AUDIT = Object.freeze({
  governance_visibility_not_authority: true,
  budgeting_non_authoritative: true,
  topology_visibility_cannot_validate_execution: true,
  unknown_classifies_as_risk_or_unknown: true,
})

const sortUnique = (values: Iterable<string>): readonly string[] => Object.freeze(Array.from(new Set(values)).filter(Boolean).sort((a, b) => a.localeCompare(b)))

function normalizeNode(node: GovernanceComplexityNode): GovernanceComplexityNode {
  const norm = (v?: readonly string[]) => sortUnique((v || []).map((x) => String(x || '')))
  return {
    surface_id: String(node?.surface_id || ''),
    governance_axes: norm(node?.governance_axes),
    topology_neighbors: norm(node?.topology_neighbors),
    reconciliation_channels: norm(node?.reconciliation_channels),
    replay_vectors: norm(node?.replay_vectors),
    semantic_tags: norm(node?.semantic_tags),
    authority_scopes: norm(node?.authority_scopes),
    dependency_targets: norm(node?.dependency_targets),
    install_base_segments: norm(node?.install_base_segments),
    unknown: Boolean(node?.unknown),
  }
}

export function budgetGovernanceComplexity(input: GovernanceComplexityBudgetingInput): GovernanceComplexityBudgetingResult {
  if (!input || input.evidence_only !== true || !Array.isArray(input.surfaces) || input.surfaces.length === 0) {
    return Object.freeze({
      artifact_type: 'GOVERNANCE_COMPLEXITY_BUDGETING',
      analysis_id: String(input?.analysis_id || ''),
      classification: 'NULL',
      evidence_only: true,
      creates_authority: false,
      mutates_state: false,
      validates_execution: false,
      deterministic_complexity_traversal: Object.freeze([]),
      deterministic_topology_ordering: Object.freeze([]),
      deterministic_budget_analysis_ordering: Object.freeze([]),
      governance_complexity_inventory: Object.freeze([]),
      topology_amplification_inventory: Object.freeze([]),
      reconciliation_amplification_inventory: Object.freeze([]),
      replay_propagation_expansion_inventory: Object.freeze([]),
      semantic_complexity_inventory: Object.freeze([]),
      authority_concentration_growth_inventory: Object.freeze([]),
      dependency_fanout_inventory: Object.freeze([]),
      governance_budget_pressure_inventory: Object.freeze([]),
      install_base_scaling_risk_inventory: Object.freeze([]),
      scalability_containment_audit_surface: Object.freeze({ ...OBSERVABILITY_AUDIT, budget_limit: 0, budget_consumed: 0, budget_ratio: 0 }),
      canonical_hash: sha256Hex(canonicalize([])),
    })
  }

  const budgetLimit = Math.max(1, Number(input.budget_limit || 0))
  const nodes = input.surfaces.map(normalizeNode).sort((a, b) => a.surface_id.localeCompare(b.surface_id))
  const deterministicTraversal = Object.freeze(nodes.map((n) => n.surface_id))
  const topologyOrdering = Object.freeze(nodes.map((n) => `${n.surface_id}:${(n.topology_neighbors || []).join(',')}`))

  const governanceInventory: string[] = []
  const topologyAmp: string[] = []
  const reconciliationAmp: string[] = []
  const replayExpansion: string[] = []
  const semanticComplexity: string[] = []
  const authorityGrowth: string[] = []
  const dependencyFanout: string[] = []
  const budgetPressure: string[] = []
  const installBaseRisk: string[] = []
  const unknown: string[] = []

  let budgetConsumed = 0
  for (const node of nodes) {
    const g = (node.governance_axes || []).length
    const t = (node.topology_neighbors || []).length
    const r = (node.reconciliation_channels || []).length
    const rp = (node.replay_vectors || []).length
    const s = (node.semantic_tags || []).length
    const a = (node.authority_scopes || []).length
    const d = (node.dependency_targets || []).length
    const i = (node.install_base_segments || []).length
    const score = g + t + r + rp + s + a + d + i
    budgetConsumed += score

    governanceInventory.push(`${node.surface_id}:${score}`)
    if (t >= 3) topologyAmp.push(node.surface_id)
    if (r >= 2) reconciliationAmp.push(node.surface_id)
    if (rp >= 2) replayExpansion.push(node.surface_id)
    if (s >= 2) semanticComplexity.push(node.surface_id)
    if (a >= 2) authorityGrowth.push(node.surface_id)
    if (d >= 3) dependencyFanout.push(node.surface_id)
    if (i >= 2 || (i >= 1 && score >= 8)) installBaseRisk.push(node.surface_id)
    if (score >= Math.ceil(budgetLimit * 0.5)) budgetPressure.push(node.surface_id)
    if (node.unknown) unknown.push(node.surface_id)
  }

  const ratio = Number((budgetConsumed / budgetLimit).toFixed(6))
  let classification: GovernanceComplexityClassification = 'GOVERNANCE_BUDGET_STABLE'
  if (unknown.length > 0) classification = 'UNKNOWN_COMPLEXITY_SURFACE'
  else if (ratio > 1) classification = 'GOVERNANCE_BUDGET_EXCEEDED'
  else if (ratio >= 0.8) classification = 'GOVERNANCE_BUDGET_WARNING'
  else if (installBaseRisk.length > 0) classification = 'INSTALL_BASE_SCALING_RISK'
  else if (dependencyFanout.length > 0) classification = 'DEPENDENCY_FANOUT_AMPLIFICATION'
  else if (authorityGrowth.length > 0) classification = 'AUTHORITY_CONCENTRATION_GROWTH'
  else if (semanticComplexity.length > 0) classification = 'SEMANTIC_COMPLEXITY_CLUSTER'
  else if (replayExpansion.length > 0) classification = 'REPLAY_PROPAGATION_EXPANSION'
  else if (reconciliationAmp.length > 0) classification = 'RECONCILIATION_AMPLIFICATION'
  else if (topologyAmp.length > 0) classification = 'TOPOLOGY_AMPLIFICATION'

  const result = {
    artifact_type: 'GOVERNANCE_COMPLEXITY_BUDGETING' as const,
    analysis_id: String(input.analysis_id || ''),
    classification,
    evidence_only: true as const,
    creates_authority: false as const,
    mutates_state: false as const,
    validates_execution: false as const,
    deterministic_complexity_traversal: deterministicTraversal,
    deterministic_topology_ordering: topologyOrdering,
    deterministic_budget_analysis_ordering: deterministicTraversal,
    governance_complexity_inventory: sortUnique(governanceInventory),
    topology_amplification_inventory: sortUnique(topologyAmp),
    reconciliation_amplification_inventory: sortUnique(reconciliationAmp),
    replay_propagation_expansion_inventory: sortUnique(replayExpansion),
    semantic_complexity_inventory: sortUnique(semanticComplexity),
    authority_concentration_growth_inventory: sortUnique(authorityGrowth),
    dependency_fanout_inventory: sortUnique(dependencyFanout),
    governance_budget_pressure_inventory: sortUnique(budgetPressure),
    install_base_scaling_risk_inventory: sortUnique([...installBaseRisk, ...unknown]),
    scalability_containment_audit_surface: Object.freeze({
      ...OBSERVABILITY_AUDIT,
      budget_limit: budgetLimit,
      budget_consumed: budgetConsumed,
      budget_ratio: ratio,
      budget_stable: ratio < 0.8,
      budget_warning: ratio >= 0.8 && ratio <= 1,
      budget_exceeded: ratio > 1,
    }),
  }

  return Object.freeze({ ...result, canonical_hash: sha256Hex(canonicalize(result)) })
}
