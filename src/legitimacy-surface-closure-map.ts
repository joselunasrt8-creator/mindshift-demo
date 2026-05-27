/**
 * src/legitimacy-surface-closure-map.ts
 * Issue #1425 — Legitimacy Surface Closure Map
 *
 * Evidence-only legitimacy surface closure mapping. Maps each observed execution
 * surface to its closure state relative to governed execution boundaries.
 *
 * Closure state classification:
 *   CLOSED         — surface is fully governed (S0/S1 sovereignty tier)
 *   OPEN_GAP       — surface has an identified sovereignty gap (S2/S3)
 *   UNGOVERNED     — surface is outside governed boundary, no sovereignty record
 *   UNKNOWN        — surface tier cannot be determined from available evidence
 *
 * Core invariants:
 *   visibility ≠ legitimacy
 *   closure map ≠ authority grant
 *   surface classification ≠ execution permission
 */

import { canonicalize, sha256Hex } from './canonical.js'

// ── Closure state constants ────────────────────────────────────────────────────

export const SURFACE_CLOSURE_STATES = {
  CLOSED: 'CLOSED',
  OPEN_GAP: 'OPEN_GAP',
  UNGOVERNED: 'UNGOVERNED',
  UNKNOWN: 'UNKNOWN',
} as const

export type SurfaceClosureState =
  (typeof SURFACE_CLOSURE_STATES)[keyof typeof SURFACE_CLOSURE_STATES]

export const CLOSURE_MAP_RESULTS = {
  MAPPED: 'CLOSURE_MAP_MAPPED',
  EMPTY: 'CLOSURE_MAP_EMPTY',
  NULL: 'CLOSURE_MAP_NULL',
} as const

export type ClosureMapResult =
  (typeof CLOSURE_MAP_RESULTS)[keyof typeof CLOSURE_MAP_RESULTS]

// ── Sovereignty tier → closure state mapping ───────────────────────────────────
// S0/S1: fully governed → CLOSED
// S2: contained gap → OPEN_GAP
// S3: uncontained gap → OPEN_GAP
// absent/unknown → UNKNOWN

const TIER_TO_CLOSURE: Readonly<Record<string, SurfaceClosureState>> = Object.freeze({
  S0: 'CLOSED',
  S1: 'CLOSED',
  S2: 'OPEN_GAP',
  S3: 'OPEN_GAP',
})

// ── Types ──────────────────────────────────────────────────────────────────────

export interface SurfaceClosureRecord {
  readonly surface_id: string
  readonly sovereignty_tier: string
  readonly closure_state: SurfaceClosureState
  readonly gap_class: string | null
  readonly required_action: string | null
  readonly evidence_hash: string
}

export interface LegitimacySurfaceClosureMap {
  readonly artifact_type: 'LEGITIMACY_SURFACE_CLOSURE_MAP'
  readonly evidence_only: true
  readonly creates_authority: false
  readonly mutates_state: false
  readonly result: ClosureMapResult
  readonly total_surface_count: number
  readonly closed_count: number
  readonly open_gap_count: number
  readonly ungoverned_count: number
  readonly unknown_count: number
  readonly closure_percentage: number
  readonly records: readonly SurfaceClosureRecord[]
  readonly open_gap_surface_ids: readonly string[]
  readonly ungoverned_surface_ids: readonly string[]
  readonly closure_map_hash: string
}

export interface SurfaceClosureInput {
  readonly evidence_only: true
  readonly surfaces: readonly {
    readonly surface_id: string
    readonly sovereignty_tier?: string
    readonly gap_class?: string
    readonly required_action?: string
    readonly is_governed?: boolean
  }[]
}

// ── Internal helpers ───────────────────────────────────────────────────────────

function classifyClosure(
  sovereignty_tier: string,
  is_governed: boolean | undefined,
): SurfaceClosureState {
  const fromTier = TIER_TO_CLOSURE[sovereignty_tier]
  if (fromTier) return fromTier
  if (is_governed === true) return 'CLOSED'
  if (is_governed === false) return 'UNGOVERNED'
  return 'UNKNOWN'
}

function buildRecordHash(
  surface_id: string,
  sovereignty_tier: string,
  closure_state: SurfaceClosureState,
): string {
  return sha256Hex(canonicalize({ surface_id, sovereignty_tier, closure_state }))
}

// ── Null map builder ───────────────────────────────────────────────────────────

function buildNullClosureMap(): LegitimacySurfaceClosureMap {
  const fields: Record<string, unknown> = {
    artifact_type: 'LEGITIMACY_SURFACE_CLOSURE_MAP',
    evidence_only: true,
    creates_authority: false,
    mutates_state: false,
    result: CLOSURE_MAP_RESULTS.NULL,
    total_surface_count: 0,
    closed_count: 0,
    open_gap_count: 0,
    ungoverned_count: 0,
    unknown_count: 0,
    closure_percentage: 0,
    records: Object.freeze([]),
    open_gap_surface_ids: Object.freeze([]),
    ungoverned_surface_ids: Object.freeze([]),
  }
  return Object.freeze({
    ...fields,
    closure_map_hash: sha256Hex(canonicalize(fields)),
  }) as LegitimacySurfaceClosureMap
}

// ── Main builder ───────────────────────────────────────────────────────────────

/**
 * Builds a LEGITIMACY_SURFACE_CLOSURE_MAP evidence artifact.
 *
 * Evidence only — maps surfaces to closure state without granting authority.
 * Fail-closed: returns NULL map on invalid or missing input.
 */
export function buildLegitimacySurfaceClosureMap(
  input: unknown,
): LegitimacySurfaceClosureMap {
  if (
    input === null ||
    input === undefined ||
    typeof input !== 'object' ||
    Array.isArray(input)
  ) {
    return buildNullClosureMap()
  }

  const obj = input as SurfaceClosureInput
  if (obj.evidence_only !== true) return buildNullClosureMap()
  if (!Array.isArray(obj.surfaces) || obj.surfaces.length === 0) {
    const emptyFields: Record<string, unknown> = {
      artifact_type: 'LEGITIMACY_SURFACE_CLOSURE_MAP',
      evidence_only: true,
      creates_authority: false,
      mutates_state: false,
      result: CLOSURE_MAP_RESULTS.EMPTY,
      total_surface_count: 0,
      closed_count: 0,
      open_gap_count: 0,
      ungoverned_count: 0,
      unknown_count: 0,
      closure_percentage: 0,
      records: Object.freeze([]),
      open_gap_surface_ids: Object.freeze([]),
      ungoverned_surface_ids: Object.freeze([]),
    }
    return Object.freeze({
      ...emptyFields,
      closure_map_hash: sha256Hex(canonicalize(emptyFields)),
    }) as LegitimacySurfaceClosureMap
  }

  const records: SurfaceClosureRecord[] = obj.surfaces
    .map((s) => {
      const surface_id = String(s.surface_id || '')
      const sovereignty_tier = String(s.sovereignty_tier || 'UNKNOWN').toUpperCase()
      const closure_state = classifyClosure(sovereignty_tier, s.is_governed)
      const gap_class = s.gap_class ? String(s.gap_class) : null
      const required_action = s.required_action ? String(s.required_action) : null
      return Object.freeze({
        surface_id,
        sovereignty_tier,
        closure_state,
        gap_class,
        required_action,
        evidence_hash: buildRecordHash(surface_id, sovereignty_tier, closure_state),
      }) as SurfaceClosureRecord
    })
    .sort((a, b) => a.surface_id.localeCompare(b.surface_id))

  const total_surface_count = records.length
  const closed_count = records.filter((r) => r.closure_state === 'CLOSED').length
  const open_gap_count = records.filter((r) => r.closure_state === 'OPEN_GAP').length
  const ungoverned_count = records.filter((r) => r.closure_state === 'UNGOVERNED').length
  const unknown_count = records.filter((r) => r.closure_state === 'UNKNOWN').length
  const closure_percentage =
    total_surface_count > 0
      ? Number(((closed_count / total_surface_count) * 100).toFixed(2))
      : 0

  const open_gap_surface_ids = Object.freeze(
    records.filter((r) => r.closure_state === 'OPEN_GAP').map((r) => r.surface_id),
  )
  const ungoverned_surface_ids = Object.freeze(
    records.filter((r) => r.closure_state === 'UNGOVERNED').map((r) => r.surface_id),
  )

  const fields: Record<string, unknown> = {
    artifact_type: 'LEGITIMACY_SURFACE_CLOSURE_MAP',
    evidence_only: true,
    creates_authority: false,
    mutates_state: false,
    result: CLOSURE_MAP_RESULTS.MAPPED,
    total_surface_count,
    closed_count,
    open_gap_count,
    ungoverned_count,
    unknown_count,
    closure_percentage,
    records: Object.freeze(records),
    open_gap_surface_ids,
    ungoverned_surface_ids,
  }

  return Object.freeze({
    ...fields,
    closure_map_hash: sha256Hex(canonicalize(fields)),
  }) as LegitimacySurfaceClosureMap
}
