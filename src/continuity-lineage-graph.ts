/**
 * src/continuity-lineage-graph.ts
 * Issue #1425 — Continuity Lineage Graph
 *
 * Evidence-only continuity lineage graph builder. Represents the canonical
 * /session → /continuity → /authority → /compile → /validate → /execute → /proof
 * chain, observed gap positions, and revocation events as an immutable graph artifact.
 *
 * Graph nodes are canonical chain steps or observed gap markers.
 * Graph edges are PRECEDES (chain order) or HAS_GAP (gap annotation).
 *
 * Core invariants:
 *   lineage graph ≠ continuity authority
 *   gap observation ≠ gap resolution
 *   visualization ≠ legitimacy outcome
 */

import { canonicalize, sha256Hex } from './canonical.js'

// ── Constants ──────────────────────────────────────────────────────────────────

export const LINEAGE_NODE_TYPES = {
  CHAIN_STEP: 'CHAIN_STEP',
  GAP_MARKER: 'GAP_MARKER',
  REVOCATION_MARKER: 'REVOCATION_MARKER',
} as const

export type LineageNodeType =
  (typeof LINEAGE_NODE_TYPES)[keyof typeof LINEAGE_NODE_TYPES]

export const LINEAGE_EDGE_TYPES = {
  PRECEDES: 'PRECEDES',
  HAS_GAP: 'HAS_GAP',
  HAS_REVOCATION: 'HAS_REVOCATION',
} as const

export type LineageEdgeType =
  (typeof LINEAGE_EDGE_TYPES)[keyof typeof LINEAGE_EDGE_TYPES]

export const LINEAGE_GRAPH_RESULTS = {
  PROJECTED: 'LINEAGE_GRAPH_PROJECTED',
  NULL: 'LINEAGE_GRAPH_NULL',
} as const

export type LineageGraphResult =
  (typeof LINEAGE_GRAPH_RESULTS)[keyof typeof LINEAGE_GRAPH_RESULTS]

// The canonical execution chain — deterministic order enforced.
export const CANONICAL_EXECUTION_CHAIN = Object.freeze([
  '/session',
  '/continuity',
  '/authority',
  '/compile',
  '/validate',
  '/execute',
  '/proof',
])

// ── Types ──────────────────────────────────────────────────────────────────────

export interface LineageNode {
  readonly node_id: string
  readonly node_type: LineageNodeType
  readonly chain_position: number | null
  readonly label: string
  readonly has_gap: boolean
  readonly has_revocation: boolean
  readonly node_hash: string
}

export interface LineageEdge {
  readonly edge_id: string
  readonly edge_type: LineageEdgeType
  readonly from: string
  readonly to: string
}

export interface LineageGraphMetrics {
  readonly total_chain_steps: number
  readonly observed_gap_count: number
  readonly revocation_count: number
  readonly chain_coverage_percentage: number
  readonly is_chain_complete: boolean
}

export interface ContinuityLineageGraph {
  readonly artifact_type: 'CONTINUITY_LINEAGE_GRAPH'
  readonly evidence_only: true
  readonly creates_authority: false
  readonly mutates_state: false
  readonly result: LineageGraphResult
  readonly canonical_chain: readonly string[]
  readonly nodes: readonly LineageNode[]
  readonly edges: readonly LineageEdge[]
  readonly metrics: LineageGraphMetrics
  readonly lineage_graph_hash: string
}

export interface ContinuityLineageInput {
  readonly evidence_only: true
  readonly gap_positions?: readonly string[]
  readonly revocation_events?: readonly { readonly surface_id: string; readonly reason?: string }[]
  readonly observed_steps?: readonly string[]
}

// ── Internal helpers ───────────────────────────────────────────────────────────

function nodeHash(node_id: string, node_type: string, chain_position: number | null): string {
  return sha256Hex(canonicalize({ node_id, node_type, chain_position }))
}

function edgeId(edge_type: string, from: string, to: string): string {
  return sha256Hex(canonicalize({ edge_type, from, to }))
}

// ── Null graph builder ─────────────────────────────────────────────────────────

function buildNullLineageGraph(): ContinuityLineageGraph {
  const fields: Record<string, unknown> = {
    artifact_type: 'CONTINUITY_LINEAGE_GRAPH',
    evidence_only: true,
    creates_authority: false,
    mutates_state: false,
    result: LINEAGE_GRAPH_RESULTS.NULL,
    canonical_chain: CANONICAL_EXECUTION_CHAIN,
    nodes: Object.freeze([]),
    edges: Object.freeze([]),
    metrics: Object.freeze({
      total_chain_steps: 0,
      observed_gap_count: 0,
      revocation_count: 0,
      chain_coverage_percentage: 0,
      is_chain_complete: false,
    }),
  }
  return Object.freeze({
    ...fields,
    lineage_graph_hash: sha256Hex(canonicalize(fields)),
  }) as ContinuityLineageGraph
}

// ── Main builder ───────────────────────────────────────────────────────────────

/**
 * Builds a CONTINUITY_LINEAGE_GRAPH evidence artifact.
 *
 * Evidence only — does not create authority, resolve gaps, or mutate runtime state.
 * The canonical chain is always represented as the fixed seven-step sequence.
 * Gap markers are overlaid where gap positions are observed.
 * Revocation markers are overlaid where revocation events are observed.
 * Fail-closed: returns NULL graph on invalid input.
 */
export function buildContinuityLineageGraph(
  input: unknown,
): ContinuityLineageGraph {
  if (
    input === null ||
    input === undefined ||
    typeof input !== 'object' ||
    Array.isArray(input)
  ) {
    return buildNullLineageGraph()
  }

  const obj = input as ContinuityLineageInput
  if (obj.evidence_only !== true) return buildNullLineageGraph()

  const gapPositions = new Set(
    (Array.isArray(obj.gap_positions) ? obj.gap_positions : []).map(String),
  )
  const revocationSurfaces = new Set(
    (Array.isArray(obj.revocation_events) ? obj.revocation_events : []).map(
      (e) => String((e as { surface_id?: unknown }).surface_id || ''),
    ),
  )
  const observedSteps = new Set(
    (Array.isArray(obj.observed_steps) ? obj.observed_steps : CANONICAL_EXECUTION_CHAIN).map(
      String,
    ),
  )

  // Build chain step nodes
  const nodes: LineageNode[] = CANONICAL_EXECUTION_CHAIN.map((step, idx) => {
    const has_gap = gapPositions.has(step)
    const has_revocation = revocationSurfaces.has(step)
    const core = {
      node_id: step,
      node_type: LINEAGE_NODE_TYPES.CHAIN_STEP as LineageNodeType,
      chain_position: idx,
      label: step,
      has_gap,
      has_revocation,
    }
    return Object.freeze({
      ...core,
      node_hash: nodeHash(step, LINEAGE_NODE_TYPES.CHAIN_STEP, idx),
    }) as LineageNode
  })

  // Build gap marker nodes for any gap positions not in the canonical chain
  for (const pos of gapPositions) {
    if (!CANONICAL_EXECUTION_CHAIN.includes(pos)) {
      const core = {
        node_id: `gap:${pos}`,
        node_type: LINEAGE_NODE_TYPES.GAP_MARKER as LineageNodeType,
        chain_position: null,
        label: pos,
        has_gap: true,
        has_revocation: false,
      }
      nodes.push(Object.freeze({
        ...core,
        node_hash: nodeHash(`gap:${pos}`, LINEAGE_NODE_TYPES.GAP_MARKER, null),
      }) as LineageNode)
    }
  }

  // Build revocation marker nodes for any revocation surfaces not in the canonical chain
  for (const surface of revocationSurfaces) {
    if (!CANONICAL_EXECUTION_CHAIN.includes(surface)) {
      const core = {
        node_id: `revocation:${surface}`,
        node_type: LINEAGE_NODE_TYPES.REVOCATION_MARKER as LineageNodeType,
        chain_position: null,
        label: surface,
        has_gap: false,
        has_revocation: true,
      }
      nodes.push(Object.freeze({
        ...core,
        node_hash: nodeHash(`revocation:${surface}`, LINEAGE_NODE_TYPES.REVOCATION_MARKER, null),
      }) as LineageNode)
    }
  }

  // Build PRECEDES edges along the canonical chain
  const edges: LineageEdge[] = []
  for (let i = 0; i < CANONICAL_EXECUTION_CHAIN.length - 1; i++) {
    const from = CANONICAL_EXECUTION_CHAIN[i]
    const to = CANONICAL_EXECUTION_CHAIN[i + 1]
    edges.push(Object.freeze({
      edge_id: edgeId(LINEAGE_EDGE_TYPES.PRECEDES, from, to),
      edge_type: LINEAGE_EDGE_TYPES.PRECEDES,
      from,
      to,
    }) as LineageEdge)
  }

  // Build HAS_GAP edges from gap-flagged chain steps to their gap markers
  for (const node of nodes) {
    if (node.has_gap && node.node_type === LINEAGE_NODE_TYPES.CHAIN_STEP) {
      const gapMarkerId = `gap:${node.node_id}`
      if (nodes.some((n) => n.node_id === gapMarkerId)) {
        edges.push(Object.freeze({
          edge_id: edgeId(LINEAGE_EDGE_TYPES.HAS_GAP, node.node_id, gapMarkerId),
          edge_type: LINEAGE_EDGE_TYPES.HAS_GAP,
          from: node.node_id,
          to: gapMarkerId,
        }) as LineageEdge)
      }
    }
    if (node.has_revocation && node.node_type === LINEAGE_NODE_TYPES.CHAIN_STEP) {
      const revMarkerId = `revocation:${node.node_id}`
      if (nodes.some((n) => n.node_id === revMarkerId)) {
        edges.push(Object.freeze({
          edge_id: edgeId(LINEAGE_EDGE_TYPES.HAS_REVOCATION, node.node_id, revMarkerId),
          edge_type: LINEAGE_EDGE_TYPES.HAS_REVOCATION,
          from: node.node_id,
          to: revMarkerId,
        }) as LineageEdge)
      }
    }
  }

  const total_chain_steps = CANONICAL_EXECUTION_CHAIN.length
  const observed_gap_count = nodes.filter((n) => n.has_gap).length
  const revocation_count = nodes.filter((n) => n.has_revocation).length
  const observed_step_count = CANONICAL_EXECUTION_CHAIN.filter((s) => observedSteps.has(s)).length
  const chain_coverage_percentage = Number(
    ((observed_step_count / total_chain_steps) * 100).toFixed(2),
  )
  const is_chain_complete =
    observed_step_count === total_chain_steps && observed_gap_count === 0

  const metrics: LineageGraphMetrics = Object.freeze({
    total_chain_steps,
    observed_gap_count,
    revocation_count,
    chain_coverage_percentage,
    is_chain_complete,
  })

  const frozenNodes = Object.freeze(nodes.map((n) => Object.freeze({ ...n })))
  const frozenEdges = Object.freeze(edges.map((e) => Object.freeze({ ...e })))

  const fields: Record<string, unknown> = {
    artifact_type: 'CONTINUITY_LINEAGE_GRAPH',
    evidence_only: true,
    creates_authority: false,
    mutates_state: false,
    result: LINEAGE_GRAPH_RESULTS.PROJECTED,
    canonical_chain: CANONICAL_EXECUTION_CHAIN,
    nodes: frozenNodes,
    edges: frozenEdges,
    metrics,
  }

  return Object.freeze({
    ...fields,
    lineage_graph_hash: sha256Hex(canonicalize(fields)),
  }) as ContinuityLineageGraph
}
