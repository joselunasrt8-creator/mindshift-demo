/**
 * scripts/release-provenance-causal-ordering.mjs
 * Issue #1000 — RELEASE_PROVENANCE_CAUSAL_ORDERING_V1
 *
 * Evidence only — computes deterministic causal lineage ordering for
 * distributed release provenance registries.
 * Does not create authority, proof, execution, or deployment capability.
 * Does not mutate source registries. Does not rewrite lineage.
 * Does not repair ancestry automatically. Does not normalize BREAK_GLASS.
 *
 * Exports pure functions for causal ordering analysis.
 * CLI: node scripts/release-provenance-causal-ordering.mjs <release_id> <observations.json>
 */

import { createHash } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

export const CAUSAL_FAILURE_CLASSES = {
  CAUSAL_LINEAGE_AMBIGUITY: 'causal_lineage_ambiguity',
  CAUSAL_REPLAY_ANOMALY: 'causal_replay_anomaly',
  ROLLBACK_LINEAGE_MISSING: 'rollback_lineage_missing',
  ROLLBACK_LINEAGE_FORK: 'rollback_lineage_fork',
  CONCURRENT_RELEASE_CONFLICT: 'concurrent_release_conflict',
  LINEAGE_MUTATION_DETECTED: 'lineage_mutation_detected',
  UNKNOWN_CAUSAL_CLOCK: 'unknown_causal_clock',
  BREAK_GLASS_CAUSAL_NORMALIZATION: 'break_glass_causal_normalization',
}

export const CAUSAL_RESULTS = {
  VALID_LINEAGE: 'VALID_LINEAGE',
  CONCURRENT: 'CONCURRENT',
  NULL: 'NULL',
}

const SUPPORTED_CLOCK_ALGS = new Set(['logical'])

/**
 * Produces a canonical deep-sorted JSON representation.
 * Keys sorted alphabetically at every nesting level.
 * Arrays preserve element order (only object keys are sorted).
 * Ensures deterministic serialization regardless of insertion order.
 */
export function canonicalJson(value) {
  if (value === null || value === undefined) return JSON.stringify(value)
  if (typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalJson).join(',') + ']'
  }
  const keys = Object.keys(value).sort()
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalJson(value[k])).join(',') + '}'
}

/**
 * Computes a deterministic SHA-256 causal hash for a lineage state.
 * Same causal state → same hash. Same lineage → same hash.
 * Reordered equivalent observations normalize canonically via sorted arrays.
 *
 * Hash covers: release_id, sorted ancestor/descendant/concurrent ids,
 * rollback_of, causal_result. Excludes causal_hash itself (avoids circularity).
 *
 * @param {object} lineageState
 * @returns {string} hex SHA-256 digest
 */
export function computeCausalHash(lineageState) {
  const payload = {
    ancestor_release_ids: [...(lineageState.ancestor_release_ids ?? [])].sort(),
    causal_result: lineageState.causal_result ?? CAUSAL_RESULTS.NULL,
    concurrent_release_ids: [...(lineageState.concurrent_release_ids ?? [])].sort(),
    descendant_release_ids: [...(lineageState.descendant_release_ids ?? [])].sort(),
    release_id: lineageState.release_id,
    rollback_of: lineageState.rollback_of ?? null,
  }
  return createHash('sha256').update(canonicalJson(payload), 'utf8').digest('hex')
}

/**
 * Validates the causal clock algorithm. Only 'logical' is supported.
 *
 * @param {string} clockAlg
 * @returns {{ valid: boolean, failure_class: string|null }}
 */
export function validateCausalClock(clockAlg) {
  if (!SUPPORTED_CLOCK_ALGS.has(clockAlg)) {
    return { valid: false, failure_class: CAUSAL_FAILURE_CLASSES.UNKNOWN_CAUSAL_CLOCK }
  }
  return { valid: true, failure_class: null }
}

/**
 * Builds a map from release_id to observation for O(1) lookup.
 *
 * @param {object[]} observations
 * @returns {Map<string, object>}
 */
export function buildObservationMap(observations) {
  const map = new Map()
  for (const obs of observations) {
    if (obs.release_id) map.set(obs.release_id, obs)
  }
  return map
}

/**
 * DFS helper for computing logical clock positions.
 * Uses gray/black coloring to detect cycles (gray = in-path, black = done).
 *
 * @param {string} releaseId
 * @param {Map<string, object>} observationMap
 * @param {Map<string, number>} cache - memoized positions (black nodes)
 * @param {Set<string>} inPath - current DFS call stack (gray nodes)
 * @returns {number|null} position, or null on cycle
 */
function computePositionDFS(releaseId, observationMap, cache, inPath) {
  if (cache.has(releaseId)) return cache.get(releaseId)
  if (inPath.has(releaseId)) return null // back edge = cycle

  inPath.add(releaseId)

  const obs = observationMap.get(releaseId)
  const parentIds = obs?.ancestor_release_ids ?? []

  let maxParentPos = -1
  for (const parentId of parentIds) {
    const parentPos = computePositionDFS(parentId, observationMap, cache, inPath)
    if (parentPos === null) {
      inPath.delete(releaseId)
      return null
    }
    if (parentPos > maxParentPos) maxParentPos = parentPos
  }

  inPath.delete(releaseId)
  const pos = maxParentPos + 1
  cache.set(releaseId, pos)
  return pos
}

/**
 * Computes logical clock causal positions for all observations.
 *
 * Ancestor releases always have lower positions than descendants:
 *   genesis releases → position 0
 *   each release → max(ancestor positions) + 1
 *
 * Fails closed on cycle detection (returns null positions with causal_lineage_ambiguity).
 *
 * @param {object[]} observations
 * @returns {{ positions: Map<string, number>|null, failure_class: string|null }}
 */
export function computeCausalPositions(observations) {
  const observationMap = buildObservationMap(observations)
  const cache = new Map()
  const positions = new Map()

  for (const obs of observations) {
    if (!obs.release_id) continue
    const inPath = new Set()
    const pos = computePositionDFS(obs.release_id, observationMap, cache, inPath)
    if (pos === null) {
      return { positions: null, failure_class: CAUSAL_FAILURE_CLASSES.CAUSAL_LINEAGE_AMBIGUITY }
    }
    positions.set(obs.release_id, cache.get(obs.release_id) ?? pos)
  }

  return { positions, failure_class: null }
}

/**
 * Computes the transitive ancestor closure of a release via DFS.
 * Detects all cycles reachable from the given release's ancestors.
 * Fails closed on any cycle (returns null ancestors with causal_lineage_ambiguity).
 *
 * @param {string} releaseId
 * @param {Map<string, object>} observationMap
 * @returns {{ ancestors: Set<string>|null, failure_class: string|null }}
 */
export function computeAncestorClosure(releaseId, observationMap) {
  const ancestors = new Set()
  const WHITE = 0, GRAY = 1, BLACK = 2
  const color = new Map()

  function dfs(nodeId) {
    const c = color.get(nodeId) ?? WHITE
    if (c === BLACK) return true
    if (c === GRAY) return false // back edge = cycle

    color.set(nodeId, GRAY)

    const obs = observationMap.get(nodeId)
    const parentIds = obs?.ancestor_release_ids ?? []

    for (const parentId of parentIds) {
      if (parentId === releaseId) {
        color.set(nodeId, WHITE)
        return false // root appears as ancestor = cycle
      }
      ancestors.add(parentId)
      if (!dfs(parentId)) return false
    }

    color.set(nodeId, BLACK)
    return true
  }

  const startObs = observationMap.get(releaseId)
  const directParents = startObs?.ancestor_release_ids ?? []

  for (const parentId of directParents) {
    if (parentId === releaseId) {
      return { ancestors: null, failure_class: CAUSAL_FAILURE_CLASSES.CAUSAL_LINEAGE_AMBIGUITY }
    }
    ancestors.add(parentId)
    if (!dfs(parentId)) {
      return { ancestors: null, failure_class: CAUSAL_FAILURE_CLASSES.CAUSAL_LINEAGE_AMBIGUITY }
    }
  }

  return { ancestors, failure_class: null }
}

/**
 * Classifies the pairwise causal relationship between two releases.
 *
 * Returns:
 *   'ANCESTOR'   — A causally precedes B (A is in B's ancestor closure)
 *   'DESCENDANT' — B causally precedes A (B is in A's ancestor closure)
 *   'CONCURRENT' — neither is an ancestor of the other
 *   'NULL'       — cycle detected or ambiguous ancestry
 *
 * @param {string} releaseIdA
 * @param {string} releaseIdB
 * @param {Map<string, object>} observationMap
 * @returns {{ relationship: string, failure_class: string|null }}
 */
export function classifyCausalRelationship(releaseIdA, releaseIdB, observationMap) {
  const closureA = computeAncestorClosure(releaseIdA, observationMap)
  if (closureA.failure_class) {
    return { relationship: CAUSAL_RESULTS.NULL, failure_class: closureA.failure_class }
  }

  const closureB = computeAncestorClosure(releaseIdB, observationMap)
  if (closureB.failure_class) {
    return { relationship: CAUSAL_RESULTS.NULL, failure_class: closureB.failure_class }
  }

  const aIsAncestorOfB = closureB.ancestors.has(releaseIdA)
  const bIsAncestorOfA = closureA.ancestors.has(releaseIdB)

  if (aIsAncestorOfB && bIsAncestorOfA) {
    return {
      relationship: CAUSAL_RESULTS.NULL,
      failure_class: CAUSAL_FAILURE_CLASSES.CAUSAL_LINEAGE_AMBIGUITY,
    }
  }

  if (aIsAncestorOfB) return { relationship: 'ANCESTOR', failure_class: null }
  if (bIsAncestorOfA) return { relationship: 'DESCENDANT', failure_class: null }
  return { relationship: 'CONCURRENT', failure_class: null }
}

/**
 * Detects concurrent releases in a set of observations.
 *
 * Two releases are concurrent iff neither is an ancestor of the other.
 * Same ancestry depth is the typical indicator but not the sole criterion.
 * Concurrent observations must classify explicitly — never silently linearized.
 *
 * @param {object[]} observations
 * @returns {{ concurrent_pairs: Array<[string, string]>, failure_class: string|null }}
 */
export function detectConcurrentReleases(observations) {
  const posResult = computeCausalPositions(observations)
  if (posResult.failure_class) {
    return { concurrent_pairs: [], failure_class: posResult.failure_class }
  }

  const observationMap = buildObservationMap(observations)
  const concurrent_pairs = []

  for (let i = 0; i < observations.length; i++) {
    for (let j = i + 1; j < observations.length; j++) {
      const idA = observations[i].release_id
      const idB = observations[j].release_id
      if (!idA || !idB) continue

      const rel = classifyCausalRelationship(idA, idB, observationMap)
      if (rel.relationship === 'CONCURRENT') {
        concurrent_pairs.push([idA, idB])
      }
    }
  }

  return { concurrent_pairs, failure_class: null }
}

/**
 * Validates rollback ancestry for a rollback observation.
 *
 * Rollback release must:
 *   - reference a prior canonical release via rollback_of
 *   - rollback_of release must exist in observations
 *   - rollback_of must be in the transitive ancestor closure of the rollback
 *   - no fork ambiguity (single rollback per target)
 *   - BREAK_GLASS release cannot be normalized into canonical causal ordering
 *   - fails closed on ambiguous ancestry, cycle, or missing lineage
 *
 * @param {object} rollbackObservation
 * @param {object[]} allObservations
 * @returns {{ valid: boolean, failure_class: string|null, detail: string|null }}
 */
export function validateRollbackAncestry(rollbackObservation, allObservations) {
  const rollbackOf = rollbackObservation.rollback_of

  if (!rollbackOf || String(rollbackOf).length === 0) {
    return {
      valid: false,
      failure_class: CAUSAL_FAILURE_CLASSES.ROLLBACK_LINEAGE_MISSING,
      detail: 'rollback_of field is missing or empty',
    }
  }

  const observationMap = buildObservationMap(allObservations)

  if (!observationMap.has(rollbackOf)) {
    return {
      valid: false,
      failure_class: CAUSAL_FAILURE_CLASSES.ROLLBACK_LINEAGE_MISSING,
      detail: `rollback_of release ${rollbackOf} not found in observations`,
    }
  }

  const targetObs = observationMap.get(rollbackOf)

  // BREAK_GLASS releases cannot be normalized into canonical causal ordering
  if (targetObs.break_glass === true && rollbackObservation.canonical_release_candidate === true) {
    return {
      valid: false,
      failure_class: CAUSAL_FAILURE_CLASSES.BREAK_GLASS_CAUSAL_NORMALIZATION,
      detail: `rollback of BREAK_GLASS release ${rollbackOf} cannot be normalized as canonical`,
    }
  }

  // Detect rollback fork ambiguity: multiple rollbacks targeting the same release
  const otherRollbacks = allObservations.filter(
    (obs) =>
      obs.rollback_of === rollbackOf &&
      obs.release_id !== rollbackObservation.release_id,
  )

  if (otherRollbacks.length > 0) {
    return {
      valid: false,
      failure_class: CAUSAL_FAILURE_CLASSES.ROLLBACK_LINEAGE_FORK,
      detail: `rollback fork: multiple rollbacks reference ${rollbackOf} (${otherRollbacks.map((o) => o.release_id).join(', ')})`,
    }
  }

  // The rollback_of release must be in the transitive ancestor closure
  const closure = computeAncestorClosure(rollbackObservation.release_id, observationMap)
  if (closure.failure_class) {
    return {
      valid: false,
      failure_class: closure.failure_class,
      detail: 'cycle detected in rollback ancestry chain — fails closed',
    }
  }

  if (!closure.ancestors.has(rollbackOf)) {
    return {
      valid: false,
      failure_class: CAUSAL_FAILURE_CLASSES.ROLLBACK_LINEAGE_MISSING,
      detail: `rollback_of ${rollbackOf} is not in the ancestor closure of ${rollbackObservation.release_id}`,
    }
  }

  return { valid: true, failure_class: null, detail: null }
}

/**
 * Detects causal replay anomalies in an ordered sequence of observations.
 *
 * Detects:
 *   - descendant-before-ancestor: release observed before its declared ancestors
 *   - lineage rewrite: same release_id with different ancestor_release_ids
 *   - causal replay: same release_id observed more than once
 *
 * Replay anomalies fail closed — any anomaly invalidates the ordering.
 *
 * @param {object[]} observations - ordered sequence (as received/replayed)
 * @returns {Array<{ failure_class: string, release_id: string, detail: string }>}
 */
export function detectCausalReplayAnomalies(observations) {
  const anomalies = []
  const seenReleaseIds = new Map()

  for (let i = 0; i < observations.length; i++) {
    const obs = observations[i]
    const releaseId = obs.release_id
    if (!releaseId) continue

    if (seenReleaseIds.has(releaseId)) {
      const prior = seenReleaseIds.get(releaseId)
      const priorAncestors = JSON.stringify([...(prior.obs.ancestor_release_ids ?? [])].sort())
      const currentAncestors = JSON.stringify([...(obs.ancestor_release_ids ?? [])].sort())

      if (priorAncestors !== currentAncestors) {
        anomalies.push({
          failure_class: CAUSAL_FAILURE_CLASSES.LINEAGE_MUTATION_DETECTED,
          release_id: releaseId,
          detail: `lineage rewrite detected: ${releaseId} observed with different ancestor_release_ids`,
        })
      } else {
        anomalies.push({
          failure_class: CAUSAL_FAILURE_CLASSES.CAUSAL_REPLAY_ANOMALY,
          release_id: releaseId,
          detail: `causal replay anomaly: ${releaseId} observed more than once`,
        })
      }
      continue
    }

    seenReleaseIds.set(releaseId, { index: i, obs })

    // Detect descendant-before-ancestor ordering conflict
    const parentIds = obs.ancestor_release_ids ?? []
    for (const parentId of parentIds) {
      if (!seenReleaseIds.has(parentId)) {
        anomalies.push({
          failure_class: CAUSAL_FAILURE_CLASSES.CAUSAL_REPLAY_ANOMALY,
          release_id: releaseId,
          detail: `descendant-before-ancestor: ${releaseId} observed before ancestor ${parentId}`,
        })
      }
    }
  }

  return anomalies
}

/**
 * Generates a causality evidence object for a specific release.
 *
 * Evidence object always preserves:
 *   - evidence_only: true
 *   - creates_authority: false
 *   - creates_execution: false
 *
 * Causality evidence must never authorize, validate, execute,
 * create proof, or mutate registry state.
 *
 * Does NOT check for replay anomalies — use classifyCausalOrdering for
 * the full pipeline including replay detection.
 *
 * @param {string} releaseId
 * @param {object[]} observations
 * @param {object} [options]
 * @param {string} [options.clockAlg]
 * @returns {object} causality evidence object
 */
export function generateCausalityEvidence(releaseId, observations, options = {}) {
  const clockAlg = options.clockAlg ?? 'logical'

  const base = {
    artifact: 'RELEASE_PROVENANCE_CAUSAL_ORDERING',
    evidence_only: true,
    creates_authority: false,
    creates_execution: false,
    lineage_clock_alg: clockAlg,
    release_id: releaseId,
  }

  const clockCheck = validateCausalClock(clockAlg)
  if (!clockCheck.valid) {
    const nullState = {
      release_id: releaseId,
      ancestor_release_ids: [],
      descendant_release_ids: [],
      concurrent_release_ids: [],
      rollback_of: null,
      causal_result: CAUSAL_RESULTS.NULL,
    }
    return {
      ...base,
      ...nullState,
      causal_hash: computeCausalHash(nullState),
      failure_class: CAUSAL_FAILURE_CLASSES.UNKNOWN_CAUSAL_CLOCK,
      failure_detail: `unsupported causal clock algorithm: ${clockAlg}`,
    }
  }

  const observationMap = buildObservationMap(observations)
  const targetObs = observationMap.get(releaseId)

  if (!targetObs) {
    const nullState = {
      release_id: releaseId,
      ancestor_release_ids: [],
      descendant_release_ids: [],
      concurrent_release_ids: [],
      rollback_of: null,
      causal_result: CAUSAL_RESULTS.NULL,
    }
    return {
      ...base,
      ...nullState,
      causal_hash: computeCausalHash(nullState),
      failure_class: CAUSAL_FAILURE_CLASSES.CAUSAL_LINEAGE_AMBIGUITY,
      failure_detail: `release ${releaseId} not found in observations`,
    }
  }

  const rollbackOf = targetObs.rollback_of ?? null

  // Compute transitive ancestor closure
  const ancestorClosure = computeAncestorClosure(releaseId, observationMap)
  if (ancestorClosure.failure_class) {
    const nullState = {
      release_id: releaseId,
      ancestor_release_ids: [],
      descendant_release_ids: [],
      concurrent_release_ids: [],
      rollback_of: rollbackOf,
      causal_result: CAUSAL_RESULTS.NULL,
    }
    return {
      ...base,
      ...nullState,
      causal_hash: computeCausalHash(nullState),
      failure_class: ancestorClosure.failure_class,
      failure_detail: 'cycle detected in ancestor closure — fails closed',
    }
  }

  // Compute descendant set: releases that have this release in their ancestor closure
  const descendantIds = []
  for (const obs of observations) {
    if (obs.release_id === releaseId || !obs.release_id) continue
    const closure = computeAncestorClosure(obs.release_id, observationMap)
    if (!closure.failure_class && closure.ancestors.has(releaseId)) {
      descendantIds.push(obs.release_id)
    }
  }

  // Compute concurrent set: not ancestor, not descendant
  const concurrentIds = []
  for (const obs of observations) {
    if (obs.release_id === releaseId || !obs.release_id) continue
    if (ancestorClosure.ancestors.has(obs.release_id)) continue
    if (descendantIds.includes(obs.release_id)) continue
    // Neither ancestor nor descendant — concurrent
    concurrentIds.push(obs.release_id)
  }

  const sortedAncestors = [...ancestorClosure.ancestors].sort()
  const sortedDescendants = [...descendantIds].sort()
  const sortedConcurrent = [...concurrentIds].sort()

  const causalResult = sortedConcurrent.length > 0
    ? CAUSAL_RESULTS.CONCURRENT
    : CAUSAL_RESULTS.VALID_LINEAGE

  const causalState = {
    release_id: releaseId,
    ancestor_release_ids: sortedAncestors,
    descendant_release_ids: sortedDescendants,
    concurrent_release_ids: sortedConcurrent,
    rollback_of: rollbackOf,
    causal_result: causalResult,
  }

  return {
    ...base,
    ancestor_release_ids: sortedAncestors,
    descendant_release_ids: sortedDescendants,
    concurrent_release_ids: sortedConcurrent,
    rollback_of: rollbackOf,
    causal_result: causalResult,
    causal_hash: computeCausalHash(causalState),
  }
}

/**
 * Full causal ordering pipeline: replay detection + evidence generation.
 *
 * Runs detectCausalReplayAnomalies first — if any anomaly is found,
 * returns NULL evidence with the failure class. Fails closed.
 *
 * CLI and consumers should call this rather than generateCausalityEvidence
 * directly when replay safety is required.
 *
 * @param {string} releaseId
 * @param {object[]} observations - ordered sequence (replay order matters)
 * @param {object} [options]
 * @param {string} [options.clockAlg]
 * @returns {object} causality evidence object
 */
export function classifyCausalOrdering(releaseId, observations, options = {}) {
  const clockAlg = options.clockAlg ?? 'logical'

  const anomalies = detectCausalReplayAnomalies(observations)
  if (anomalies.length > 0) {
    const first = anomalies[0]
    const nullState = {
      release_id: releaseId,
      ancestor_release_ids: [],
      descendant_release_ids: [],
      concurrent_release_ids: [],
      rollback_of: null,
      causal_result: CAUSAL_RESULTS.NULL,
    }
    return {
      artifact: 'RELEASE_PROVENANCE_CAUSAL_ORDERING',
      evidence_only: true,
      creates_authority: false,
      creates_execution: false,
      lineage_clock_alg: clockAlg,
      ...nullState,
      causal_hash: computeCausalHash(nullState),
      failure_class: first.failure_class,
      failure_detail: first.detail,
      anomalies,
    }
  }

  return generateCausalityEvidence(releaseId, observations, options)
}

/**
 * Validates the evidence boundary invariants of a causality evidence object.
 *
 * Evidence object must always preserve:
 *   - evidence_only: true
 *   - creates_authority: false
 *   - creates_execution: false
 *
 * @param {object} evidenceObject
 * @returns {{ valid: boolean, violations: string[] }}
 */
export function validateEvidenceBoundary(evidenceObject) {
  const violations = []

  if (evidenceObject.evidence_only !== true) {
    violations.push('evidence_only must be true')
  }
  if (evidenceObject.creates_authority !== false) {
    violations.push('creates_authority must be false')
  }
  if (evidenceObject.creates_execution !== false) {
    violations.push('creates_execution must be false')
  }

  return { valid: violations.length === 0, violations }
}

// ── CLI runner ──────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url)

if (resolve(process.argv[1] ?? '') === __filename) {
  const [, , releaseId, observationsPath] = process.argv

  if (!releaseId || !observationsPath) {
    console.error(
      'NULL — causal_lineage_ambiguity: usage: release-provenance-causal-ordering.mjs <release_id> <observations.json>',
    )
    process.exit(1)
  }

  if (!existsSync(observationsPath)) {
    console.error(
      `NULL — causal_lineage_ambiguity: observations file not found: ${observationsPath}`,
    )
    process.exit(1)
  }

  let parsed
  try {
    parsed = JSON.parse(readFileSync(observationsPath, 'utf8'))
  } catch (e) {
    console.error(`NULL — causal_lineage_ambiguity: failed to parse observations JSON: ${e.message}`)
    process.exit(1)
  }

  // Accept array or { observations: [...] } or { entries: [...] }
  let observations
  if (Array.isArray(parsed)) {
    observations = parsed
  } else if (Array.isArray(parsed.observations)) {
    observations = parsed.observations
  } else if (Array.isArray(parsed.entries)) {
    observations = parsed.entries
  } else {
    console.error('NULL — causal_lineage_ambiguity: observations must be an array or { observations: [...] }')
    process.exit(1)
  }

  const result = classifyCausalOrdering(releaseId, observations)
  console.log(JSON.stringify(result, null, 2))

  if (result.causal_result === CAUSAL_RESULTS.NULL) {
    process.exit(1)
  }

  process.exit(0)
}
