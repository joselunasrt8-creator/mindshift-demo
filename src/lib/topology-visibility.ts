import { sha256Hex, canonicalize } from '../canonical.js'
import type { FinalityClassification } from './finality-classification.js'

// Evidence-only — topology visibility ≠ legitimacy
export const creates_authority = false as const
export const creates_execution = false as const

// Six canonical topology visibility states.
// Only TOPOLOGY_VISIBLE satisfies the T predicate for GLOBAL_VALID gating.
export type TopologyVisibilityState =
  | 'TOPOLOGY_VISIBLE'    // all required nodes observed, none stale or partitioned
  | 'TOPOLOGY_PARTIAL'    // some required nodes missing; GLOBAL_VALID blocked
  | 'TOPOLOGY_STALE'      // epoch-stale nodes present; GLOBAL_VALID blocked
  | 'TOPOLOGY_INVISIBLE'  // no observed nodes; GLOBAL_VALID blocked
  | 'TOPOLOGY_AMBIGUOUS'  // partition detected; GLOBAL_VALID blocked
  | 'TOPOLOGY_NULL'       // snapshot absent or irreconcilable; GLOBAL_VALID blocked

// A topology snapshot record — deterministic, evidence-only, append-only.
export type TopologySnapshot = {
  readonly topology_snapshot_id: string           // tsn_<sha256> — deterministic
  readonly topology_snapshot_hash: string         // deterministic content hash
  readonly observed_nodes: readonly string[]      // surface IDs visible at observation time
  readonly missing_nodes: readonly string[]       // expected nodes not visible
  readonly stale_nodes: readonly string[]         // nodes present but epoch-stale
  readonly partitioned_nodes: readonly string[]   // nodes isolated by partition
  readonly observed_at: string                    // ISO 8601
  readonly epoch_id: string                       // epoch coupling
  readonly visibility_classification: TopologyVisibilityState
  // Evidence-only discipline
  readonly creates_authority: false
  readonly creates_execution: false
  readonly raw_production_apply_path: 'DENIED'
}

// The output of classifyTopologyVisibility — pure evidence record.
export type TopologyVisibilityResult = {
  readonly topology_visibility: TopologyVisibilityState
  readonly finality_guard: boolean              // true only when TOPOLOGY_VISIBLE
  readonly classification: 'VISIBLE' | 'DEGRADED' | 'BLOCKING'
  readonly missing_nodes: readonly string[]
  readonly stale_nodes: readonly string[]
  readonly creates_authority: false
  readonly creates_execution: false
}

// Builds the deterministic content hash for a topology snapshot.
// Sort-normalized so field order in the caller does not affect the hash.
export function buildTopologySnapshotHash(opts: {
  readonly observed_nodes: readonly string[]
  readonly missing_nodes: readonly string[]
  readonly stale_nodes: readonly string[]
  readonly partitioned_nodes: readonly string[]
  readonly epoch_id: string
  readonly observed_at: string
}): string {
  return sha256Hex(
    canonicalize({
      observed_nodes: [...opts.observed_nodes].sort(),
      missing_nodes: [...opts.missing_nodes].sort(),
      stale_nodes: [...opts.stale_nodes].sort(),
      partitioned_nodes: [...opts.partitioned_nodes].sort(),
      epoch_id: opts.epoch_id,
      observed_at: opts.observed_at,
    }),
  )
}

// Builds the deterministic topology_snapshot_id.
export function buildTopologySnapshotId(
  topology_snapshot_hash: string,
  epoch_id: string,
): string {
  return `tsn_${sha256Hex(canonicalize({ topology_snapshot_hash, epoch_id }))}`
}

// Classifies topology visibility from a snapshot (or null).
// Fail-closed: any degraded or absent state blocks GLOBAL_VALID via finality_guard=false.
// Evaluation order (most severe first):
//   1. null snapshot           → TOPOLOGY_NULL      (blocking)
//   2. no observed nodes       → TOPOLOGY_INVISIBLE (blocking)
//   3. stale nodes present     → TOPOLOGY_STALE     (degraded)
//   4. partitioned nodes       → TOPOLOGY_AMBIGUOUS (blocking)
//   5. missing nodes           → TOPOLOGY_PARTIAL   (blocking)
//   6. all clear               → TOPOLOGY_VISIBLE   (finality_guard=true)
export function classifyTopologyVisibility(
  snapshot: TopologySnapshot | null,
): TopologyVisibilityResult {
  if (snapshot === null) {
    return Object.freeze({
      topology_visibility: 'TOPOLOGY_NULL' as const,
      finality_guard: false,
      classification: 'BLOCKING' as const,
      missing_nodes: Object.freeze([] as string[]),
      stale_nodes: Object.freeze([] as string[]),
      creates_authority: false as const,
      creates_execution: false as const,
    })
  }

  const { observed_nodes, missing_nodes, stale_nodes, partitioned_nodes, visibility_classification } = snapshot

  if (visibility_classification === 'TOPOLOGY_NULL') {
    return Object.freeze({
      topology_visibility: 'TOPOLOGY_NULL' as const,
      finality_guard: false,
      classification: 'BLOCKING' as const,
      missing_nodes: Object.freeze([...missing_nodes]),
      stale_nodes: Object.freeze([...stale_nodes]),
      creates_authority: false as const,
      creates_execution: false as const,
    })
  }

  if (observed_nodes.length === 0) {
    return Object.freeze({
      topology_visibility: 'TOPOLOGY_INVISIBLE' as const,
      finality_guard: false,
      classification: 'BLOCKING' as const,
      missing_nodes: Object.freeze([...missing_nodes]),
      stale_nodes: Object.freeze([...stale_nodes]),
      creates_authority: false as const,
      creates_execution: false as const,
    })
  }

  if (stale_nodes.length > 0) {
    return Object.freeze({
      topology_visibility: 'TOPOLOGY_STALE' as const,
      finality_guard: false,
      classification: 'DEGRADED' as const,
      missing_nodes: Object.freeze([...missing_nodes]),
      stale_nodes: Object.freeze([...stale_nodes]),
      creates_authority: false as const,
      creates_execution: false as const,
    })
  }

  if (partitioned_nodes.length > 0) {
    return Object.freeze({
      topology_visibility: 'TOPOLOGY_AMBIGUOUS' as const,
      finality_guard: false,
      classification: 'BLOCKING' as const,
      missing_nodes: Object.freeze([...missing_nodes]),
      stale_nodes: Object.freeze([] as string[]),
      creates_authority: false as const,
      creates_execution: false as const,
    })
  }

  if (missing_nodes.length > 0) {
    return Object.freeze({
      topology_visibility: 'TOPOLOGY_PARTIAL' as const,
      finality_guard: false,
      classification: 'BLOCKING' as const,
      missing_nodes: Object.freeze([...missing_nodes]),
      stale_nodes: Object.freeze([] as string[]),
      creates_authority: false as const,
      creates_execution: false as const,
    })
  }

  return Object.freeze({
    topology_visibility: 'TOPOLOGY_VISIBLE' as const,
    finality_guard: true,
    classification: 'VISIBLE' as const,
    missing_nodes: Object.freeze([] as string[]),
    stale_nodes: Object.freeze([] as string[]),
    creates_authority: false as const,
    creates_execution: false as const,
  })
}

// Validates a topology snapshot structure.
// Returns null when valid; returns an error string when invalid.
// Used to gate snapshot ingestion at system boundaries.
export function validateTopologySnapshot(snapshot: unknown): string | null {
  if (snapshot === null || snapshot === undefined) return 'topology snapshot is null or missing'
  if (typeof snapshot !== 'object') return 'topology snapshot must be an object'
  const s = snapshot as Record<string, unknown>
  if (!s.topology_snapshot_hash || typeof s.topology_snapshot_hash !== 'string' || s.topology_snapshot_hash.length === 0) {
    return 'topology_snapshot_hash is missing or empty'
  }
  if (!Array.isArray(s.observed_nodes)) return 'observed_nodes must be an array'
  if (!Array.isArray(s.missing_nodes)) return 'missing_nodes must be an array'
  if (!Array.isArray(s.stale_nodes)) return 'stale_nodes must be an array'
  if (!Array.isArray(s.partitioned_nodes)) return 'partitioned_nodes must be an array'
  if (!s.epoch_id || typeof s.epoch_id !== 'string') return 'epoch_id is missing'
  if (!s.observed_at || typeof s.observed_at !== 'string') return 'observed_at is missing'
  return null
}

// Maps a TopologyVisibilityState to the boolean passed as topologyPresent
// in classifyFromPredicates. Only TOPOLOGY_VISIBLE yields true.
// Topology visibility alone never grants legitimacy — it is a necessary gate, not a source.
export function topologyVisibilityToFinalityGuard(state: TopologyVisibilityState): boolean {
  return state === 'TOPOLOGY_VISIBLE'
}

// Maps a TopologyVisibilityState to the finality classification it forces.
// Returns null when TOPOLOGY_VISIBLE — no override; the caller proceeds normally.
// All non-visible states return a blocking classification that prevents GLOBAL_VALID.
export function topologyVisibilityToFinalityClassification(
  state: TopologyVisibilityState,
): FinalityClassification | null {
  switch (state) {
    case 'TOPOLOGY_VISIBLE':   return null
    case 'TOPOLOGY_PARTIAL':   return 'PARTITION_SUSPENDED'
    case 'TOPOLOGY_STALE':     return 'STALE_VISIBLE'
    case 'TOPOLOGY_INVISIBLE': return 'NULL'
    case 'TOPOLOGY_AMBIGUOUS': return 'AMBIGUOUS'
    case 'TOPOLOGY_NULL':      return 'NULL'
  }
}

// Returns evidence flag annotations for a topology visibility result.
// Evidence flags reflect the observation — they do not grant authority or execution.
export function topologyEvidenceFlags(result: TopologyVisibilityResult): {
  readonly is_topology_visible: 0 | 1
  readonly topology_visibility: TopologyVisibilityState
  readonly creates_authority: false
  readonly creates_execution: false
} {
  return Object.freeze({
    is_topology_visible: result.finality_guard ? 1 : 0 as 0 | 1,
    topology_visibility: result.topology_visibility,
    creates_authority: false as const,
    creates_execution: false as const,
  })
}
