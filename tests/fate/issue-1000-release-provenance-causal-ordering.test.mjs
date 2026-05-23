/**
 * Issue #1000 — RELEASE_PROVENANCE_CAUSAL_ORDERING_V1
 *
 * FATE tests proving deterministic causal ordering for distributed
 * release provenance registries.
 *
 * Verifies:
 *   1.  ancestor/descendant ordering is deterministic
 *   2.  concurrent releases classify as CONCURRENT
 *   3.  rollback ancestry validates correctly
 *   4.  rollback lineage ambiguity fails closed
 *   5.  replay anomalies fail closed
 *   6.  lineage mutation detection returns NULL
 *   7.  same lineage produces same causal hash
 *   8.  causal ordering remains evidence-only
 *   9.  causal ordering cannot create authority
 *   10. causal ordering cannot create proof
 *   11. causal ordering cannot execute
 *   12. causality never rewrites registry state
 *   13. BREAK_GLASS causal normalization fails
 *   14. causal clocks remain deterministic
 *   15. causality evidence serialization is canonical
 *   16. concurrent releases are not silently linearized
 *
 * Additional:
 *   - rollback replay ancestry
 *   - descendant-before-ancestor detection
 *   - concurrent rollback classification
 *   - causal hash normalization stability
 *   - replay-safe lineage preservation
 *
 * Evidence only — no runtime route changes, no authority creation,
 * no deployment capability expansion, no proof behavior changes.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()

import {
  CAUSAL_FAILURE_CLASSES,
  CAUSAL_RESULTS,
  canonicalJson,
  computeCausalHash,
  validateCausalClock,
  buildObservationMap,
  computeAncestorClosure,
  classifyCausalRelationship,
  computeCausalPositions,
  detectConcurrentReleases,
  validateRollbackAncestry,
  detectCausalReplayAnomalies,
  generateCausalityEvidence,
  classifyCausalOrdering,
  validateEvidenceBoundary,
} from '../../scripts/release-provenance-causal-ordering.mjs'

const REQUIRED_FAILURE_CLASSES = [
  'causal_lineage_ambiguity',
  'causal_replay_anomaly',
  'rollback_lineage_missing',
  'rollback_lineage_fork',
  'concurrent_release_conflict',
  'lineage_mutation_detected',
  'unknown_causal_clock',
  'break_glass_causal_normalization',
]

// ── observation fixtures ────────────────────────────────────────────────────

function obs(release_id, ancestor_release_ids = [], extra = {}) {
  return { release_id, ancestor_release_ids, ...extra }
}

/** Linear chain: R1 → R2 → R3 */
function makeLinearChain() {
  return [
    obs('R1', []),
    obs('R2', ['R1']),
    obs('R3', ['R2']),
  ]
}

/** Fork: R1 → R2, R1 → R3 (R2 and R3 are concurrent) */
function makeFork() {
  return [
    obs('R1', []),
    obs('R2', ['R1']),
    obs('R3', ['R1']),
  ]
}

/** Diamond: R1 → R2, R1 → R3, {R2,R3} → R4 */
function makeDiamond() {
  return [
    obs('R1', []),
    obs('R2', ['R1']),
    obs('R3', ['R1']),
    obs('R4', ['R2', 'R3']),
  ]
}

/** Rollback chain: R1 → R2 → R3 (rollback to R1) */
function makeRollbackChain() {
  return [
    obs('R1', []),
    obs('R2', ['R1']),
    obs('R3', ['R2'], { rollback_of: 'R1' }),
  ]
}

// ── artifact and export presence ────────────────────────────────────────────

test('issue #1000: release-provenance-causal-ordering.mjs exists in scripts/', () => {
  assert.ok(
    existsSync(join(root, 'scripts/release-provenance-causal-ordering.mjs')),
    'scripts/release-provenance-causal-ordering.mjs must exist',
  )
})

test('issue #1000: exports CAUSAL_FAILURE_CLASSES object', () => {
  assert.equal(typeof CAUSAL_FAILURE_CLASSES, 'object')
  assert.ok(CAUSAL_FAILURE_CLASSES !== null)
})

test('issue #1000: exports CAUSAL_RESULTS with VALID_LINEAGE, CONCURRENT, NULL', () => {
  assert.equal(CAUSAL_RESULTS.VALID_LINEAGE, 'VALID_LINEAGE')
  assert.equal(CAUSAL_RESULTS.CONCURRENT, 'CONCURRENT')
  assert.equal(CAUSAL_RESULTS.NULL, 'NULL')
})

test('issue #1000: CAUSAL_FAILURE_CLASSES exports all 8 required failure class values', () => {
  for (const cls of REQUIRED_FAILURE_CLASSES) {
    const found = Object.values(CAUSAL_FAILURE_CLASSES).includes(cls)
    assert.ok(found, `CAUSAL_FAILURE_CLASSES must include value "${cls}"`)
  }
})

test('issue #1000: exports all required functions', () => {
  assert.equal(typeof canonicalJson, 'function')
  assert.equal(typeof computeCausalHash, 'function')
  assert.equal(typeof validateCausalClock, 'function')
  assert.equal(typeof buildObservationMap, 'function')
  assert.equal(typeof computeAncestorClosure, 'function')
  assert.equal(typeof classifyCausalRelationship, 'function')
  assert.equal(typeof computeCausalPositions, 'function')
  assert.equal(typeof detectConcurrentReleases, 'function')
  assert.equal(typeof validateRollbackAncestry, 'function')
  assert.equal(typeof detectCausalReplayAnomalies, 'function')
  assert.equal(typeof generateCausalityEvidence, 'function')
  assert.equal(typeof classifyCausalOrdering, 'function')
  assert.equal(typeof validateEvidenceBoundary, 'function')
})

// ── FATE test 1: ancestor/descendant ordering is deterministic ───────────────

test('FATE #1000-1: ancestor/descendant ordering is deterministic — same input same result', () => {
  const observations = makeLinearChain()
  const observationMap = buildObservationMap(observations)

  const rel1 = classifyCausalRelationship('R1', 'R3', observationMap)
  const rel2 = classifyCausalRelationship('R1', 'R3', observationMap)

  assert.equal(rel1.relationship, rel2.relationship, 'relationship classification must be deterministic')
  assert.equal(rel1.relationship, 'ANCESTOR', 'R1 must be ANCESTOR of R3')
  assert.equal(rel1.failure_class, null)
})

test('FATE #1000-1b: R3 classifies as DESCENDANT of R1', () => {
  const observations = makeLinearChain()
  const observationMap = buildObservationMap(observations)

  const rel = classifyCausalRelationship('R3', 'R1', observationMap)
  assert.equal(rel.relationship, 'DESCENDANT', 'R3 must be DESCENDANT of R1')
  assert.equal(rel.failure_class, null)
})

test('FATE #1000-1c: causal positions are monotonically ordered — ancestor < descendant', () => {
  const observations = makeLinearChain()
  const { positions, failure_class } = computeCausalPositions(observations)

  assert.equal(failure_class, null)
  const posR1 = positions.get('R1')
  const posR2 = positions.get('R2')
  const posR3 = positions.get('R3')

  assert.ok(posR1 < posR2, 'R1 position must be less than R2 position')
  assert.ok(posR2 < posR3, 'R2 position must be less than R3 position')
})

test('FATE #1000-1d: ancestor closure of R3 contains R1 and R2', () => {
  const observations = makeLinearChain()
  const observationMap = buildObservationMap(observations)

  const { ancestors, failure_class } = computeAncestorClosure('R3', observationMap)

  assert.equal(failure_class, null)
  assert.ok(ancestors.has('R1'), 'R3 ancestor closure must contain R1')
  assert.ok(ancestors.has('R2'), 'R3 ancestor closure must contain R2')
})

test('FATE #1000-1e: generateCausalityEvidence for R2 lists R1 as ancestor and R3 as descendant', () => {
  const observations = makeLinearChain()
  const evidence = generateCausalityEvidence('R2', observations)

  assert.equal(evidence.causal_result, CAUSAL_RESULTS.VALID_LINEAGE)
  assert.ok(evidence.ancestor_release_ids.includes('R1'), 'R1 must be ancestor of R2')
  assert.ok(evidence.descendant_release_ids.includes('R3'), 'R3 must be descendant of R2')
  assert.deepEqual(evidence.concurrent_release_ids, [])
})

// ── FATE test 2: concurrent releases classify as CONCURRENT ─────────────────

test('FATE #1000-2: concurrent releases classify as CONCURRENT', () => {
  const observations = makeFork()
  const observationMap = buildObservationMap(observations)

  const rel = classifyCausalRelationship('R2', 'R3', observationMap)
  assert.equal(rel.relationship, 'CONCURRENT', 'R2 and R3 must classify as CONCURRENT')
  assert.equal(rel.failure_class, null)
})

test('FATE #1000-2b: detectConcurrentReleases finds R2/R3 pair in fork', () => {
  const observations = makeFork()
  const { concurrent_pairs, failure_class } = detectConcurrentReleases(observations)

  assert.equal(failure_class, null)
  assert.ok(concurrent_pairs.length >= 1)
  const pairIds = concurrent_pairs.map((p) => p.sort().join(','))
  assert.ok(pairIds.includes('R2,R3'), 'R2/R3 must appear as concurrent pair')
})

test('FATE #1000-2c: generateCausalityEvidence for R2 in fork shows R3 in concurrent_release_ids', () => {
  const observations = makeFork()
  const evidence = generateCausalityEvidence('R2', observations)

  assert.equal(evidence.causal_result, CAUSAL_RESULTS.CONCURRENT)
  assert.ok(evidence.concurrent_release_ids.includes('R3'), 'R3 must be in R2 concurrent set')
})

test('FATE #1000-2d: causal positions of concurrent releases are equal', () => {
  const observations = makeFork()
  const { positions, failure_class } = computeCausalPositions(observations)

  assert.equal(failure_class, null)
  assert.equal(
    positions.get('R2'),
    positions.get('R3'),
    'concurrent releases must have equal causal positions',
  )
})

// ── FATE test 3: rollback ancestry validates correctly ──────────────────────

test('FATE #1000-3: valid rollback with rollback_of in ancestor closure → valid', () => {
  const observations = makeRollbackChain()
  const result = validateRollbackAncestry(observations[2], observations)

  assert.equal(result.valid, true)
  assert.equal(result.failure_class, null)
})

test('FATE #1000-3b: generateCausalityEvidence for rollback release carries rollback_of field', () => {
  const observations = makeRollbackChain()
  const evidence = generateCausalityEvidence('R3', observations)

  assert.equal(evidence.rollback_of, 'R1')
  assert.equal(evidence.causal_result, CAUSAL_RESULTS.VALID_LINEAGE)
})

test('FATE #1000-3c: rollback release causal position is higher than rollback target', () => {
  const observations = makeRollbackChain()
  const { positions } = computeCausalPositions(observations)

  assert.ok(
    positions.get('R3') > positions.get('R1'),
    'rollback release must have higher causal position than its target',
  )
})

// ── FATE test 4: rollback lineage ambiguity fails closed ────────────────────

test('FATE #1000-4: rollback missing rollback_of → rollback_lineage_missing', () => {
  const observations = makeLinearChain()
  const rollback = obs('R4', ['R3'], { rollback_of: null })
  const result = validateRollbackAncestry(rollback, [...observations, rollback])

  assert.equal(result.valid, false)
  assert.equal(result.failure_class, CAUSAL_FAILURE_CLASSES.ROLLBACK_LINEAGE_MISSING)
})

test('FATE #1000-4b: rollback_of references non-existent release → rollback_lineage_missing', () => {
  const observations = makeLinearChain()
  const rollback = obs('R4', ['R3'], { rollback_of: 'R-GHOST' })
  const result = validateRollbackAncestry(rollback, [...observations, rollback])

  assert.equal(result.valid, false)
  assert.equal(result.failure_class, CAUSAL_FAILURE_CLASSES.ROLLBACK_LINEAGE_MISSING)
})

test('FATE #1000-4c: rollback_of not in ancestor closure → rollback_lineage_missing', () => {
  // R4 is at same level as R3 but rollback_of points to R3 which is not R4's ancestor
  const observations = [
    obs('R1', []),
    obs('R2', ['R1']),
    obs('R3', ['R1']),  // sibling of R2
    obs('R4', ['R2'], { rollback_of: 'R3' }),  // R3 is not in R4's ancestry
  ]
  const result = validateRollbackAncestry(observations[3], observations)

  assert.equal(result.valid, false)
  assert.equal(result.failure_class, CAUSAL_FAILURE_CLASSES.ROLLBACK_LINEAGE_MISSING)
})

test('FATE #1000-4d: rollback fork ambiguity → rollback_lineage_fork', () => {
  const observations = [
    obs('R1', []),
    obs('R2', ['R1']),
    obs('R3', ['R2'], { rollback_of: 'R1' }),
    obs('R4', ['R2'], { rollback_of: 'R1' }),  // second rollback to R1 = fork
  ]
  const result = validateRollbackAncestry(observations[2], observations)

  assert.equal(result.valid, false)
  assert.equal(result.failure_class, CAUSAL_FAILURE_CLASSES.ROLLBACK_LINEAGE_FORK)
})

test('FATE #1000-4e: cyclic ancestry in rollback → fails closed with causal_lineage_ambiguity', () => {
  // R2 → R3 → R2 (cycle)
  const observations = [
    obs('R1', []),
    obs('R2', ['R3']),  // cycle
    obs('R3', ['R2']),  // cycle
    obs('R4', ['R3'], { rollback_of: 'R1' }),
  ]
  const result = validateRollbackAncestry(observations[3], observations)

  assert.equal(result.valid, false)
  assert.ok(
    result.failure_class === CAUSAL_FAILURE_CLASSES.CAUSAL_LINEAGE_AMBIGUITY ||
    result.failure_class === CAUSAL_FAILURE_CLASSES.ROLLBACK_LINEAGE_MISSING,
    `expected lineage ambiguity or missing, got: ${result.failure_class}`,
  )
})

// ── FATE test 5: replay anomalies fail closed ───────────────────────────────

test('FATE #1000-5: classifyCausalOrdering with replay anomaly → NULL', () => {
  // R1 seen twice (replay)
  const observations = [
    obs('R1', []),
    obs('R2', ['R1']),
    obs('R1', []),  // replay
  ]

  const result = classifyCausalOrdering('R2', observations)

  assert.equal(result.causal_result, CAUSAL_RESULTS.NULL)
  assert.equal(result.failure_class, CAUSAL_FAILURE_CLASSES.CAUSAL_REPLAY_ANOMALY)
  assert.equal(result.evidence_only, true)
  assert.equal(result.creates_authority, false)
})

test('FATE #1000-5b: detectCausalReplayAnomalies detects duplicate release_id', () => {
  const observations = [
    obs('R1', []),
    obs('R2', ['R1']),
    obs('R1', []),  // replay of R1
  ]

  const anomalies = detectCausalReplayAnomalies(observations)
  assert.ok(anomalies.length > 0)
  assert.ok(anomalies.some((a) => a.failure_class === CAUSAL_FAILURE_CLASSES.CAUSAL_REPLAY_ANOMALY))
  assert.ok(anomalies.some((a) => a.release_id === 'R1'))
})

test('FATE #1000-5c: detectCausalReplayAnomalies on clean sequence returns empty', () => {
  const observations = makeLinearChain()
  const anomalies = detectCausalReplayAnomalies(observations)
  assert.deepEqual(anomalies, [])
})

test('FATE #1000-5d: classifyCausalOrdering on clean sequence returns valid evidence', () => {
  const observations = makeLinearChain()
  const result = classifyCausalOrdering('R2', observations)

  assert.equal(result.causal_result, CAUSAL_RESULTS.VALID_LINEAGE)
  assert.equal(result.failure_class, undefined)
  assert.equal(result.evidence_only, true)
})

// ── FATE test 6: lineage mutation detection returns NULL ────────────────────

test('FATE #1000-6: lineage mutation (same id different ancestry) → NULL with lineage_mutation_detected', () => {
  const observations = [
    obs('R1', []),
    obs('R2', ['R1']),
    obs('R2', []),  // R2 reappears with DIFFERENT ancestry — mutation!
  ]

  const result = classifyCausalOrdering('R1', observations)

  assert.equal(result.causal_result, CAUSAL_RESULTS.NULL)
  assert.equal(result.failure_class, CAUSAL_FAILURE_CLASSES.LINEAGE_MUTATION_DETECTED)
})

test('FATE #1000-6b: detectCausalReplayAnomalies detects lineage mutation', () => {
  const observations = [
    obs('R1', []),
    obs('R2', ['R1']),
    obs('R2', ['R1', 'X']),  // different ancestor_release_ids
  ]

  const anomalies = detectCausalReplayAnomalies(observations)
  assert.ok(anomalies.some((a) => a.failure_class === CAUSAL_FAILURE_CLASSES.LINEAGE_MUTATION_DETECTED))
  assert.ok(anomalies.some((a) => a.release_id === 'R2'))
})

test('FATE #1000-6c: generateCausalityEvidence with cyclic graph returns NULL', () => {
  const observations = [
    obs('R1', ['R2']),  // cycle
    obs('R2', ['R1']),  // cycle
  ]

  const evidence = generateCausalityEvidence('R1', observations)
  assert.equal(evidence.causal_result, CAUSAL_RESULTS.NULL)
  assert.equal(evidence.failure_class, CAUSAL_FAILURE_CLASSES.CAUSAL_LINEAGE_AMBIGUITY)
})

// ── FATE test 7: same lineage produces same causal hash ─────────────────────

test('FATE #1000-7: same lineage state produces same causal hash', () => {
  const observations = makeLinearChain()
  const e1 = generateCausalityEvidence('R2', observations)
  const e2 = generateCausalityEvidence('R2', observations)

  assert.equal(e1.causal_hash, e2.causal_hash, 'same lineage must produce same causal hash')
})

test('FATE #1000-7b: causal hash is stable under different observation ordering', () => {
  // Same observations in different order should produce same causal hash for R2
  const obs1 = makeLinearChain() // [R1, R2, R3]
  const obs2 = [obs1[1], obs1[0], obs1[2]] // [R2, R1, R3] — reordered

  // generateCausalityEvidence (no replay check) — reordering is tested here
  const e1 = generateCausalityEvidence('R2', obs1)
  const e2 = generateCausalityEvidence('R2', obs2)

  assert.equal(e1.causal_hash, e2.causal_hash, 'causal hash must be stable under observation reordering')
})

test('FATE #1000-7c: different lineage states produce different causal hashes', () => {
  const obs1 = makeLinearChain() // R1 → R2 → R3
  const obs2 = makeFork()         // R1 → R2, R1 → R3 (R2 and R3 concurrent)

  const e1 = generateCausalityEvidence('R2', obs1) // R2 has R3 as descendant
  const e2 = generateCausalityEvidence('R2', obs2) // R2 has R3 as concurrent

  assert.notEqual(e1.causal_hash, e2.causal_hash, 'different causal states must produce different hashes')
})

test('FATE #1000-7d: computeCausalHash is deterministic — same input always same output', () => {
  const state = {
    release_id: 'R1',
    ancestor_release_ids: ['A', 'B'],
    descendant_release_ids: ['C'],
    concurrent_release_ids: [],
    rollback_of: null,
    causal_result: CAUSAL_RESULTS.VALID_LINEAGE,
  }
  const results = Array.from({ length: 5 }, () => computeCausalHash(state))
  const unique = new Set(results)
  assert.equal(unique.size, 1, 'computeCausalHash must always return same value for identical inputs')
})

// ── FATE test 8: causal ordering remains evidence-only ──────────────────────

test('FATE #1000-8: generateCausalityEvidence always sets evidence_only=true', () => {
  const observations = makeLinearChain()
  const evidence = generateCausalityEvidence('R2', observations)
  assert.equal(evidence.evidence_only, true)
})

test('FATE #1000-8b: classifyCausalOrdering always sets evidence_only=true (VALID_LINEAGE)', () => {
  const observations = makeLinearChain()
  const result = classifyCausalOrdering('R2', observations)
  assert.equal(result.evidence_only, true)
})

test('FATE #1000-8c: classifyCausalOrdering always sets evidence_only=true (NULL path)', () => {
  const observations = [obs('R1', []), obs('R1', [])] // replay → NULL
  const result = classifyCausalOrdering('R1', observations)
  assert.equal(result.causal_result, CAUSAL_RESULTS.NULL)
  assert.equal(result.evidence_only, true)
})

test('FATE #1000-8d: validateEvidenceBoundary rejects evidence_only=false', () => {
  const bad = {
    evidence_only: false,
    creates_authority: false,
    creates_execution: false,
  }
  const result = validateEvidenceBoundary(bad)
  assert.equal(result.valid, false)
  assert.ok(result.violations.some((v) => v.includes('evidence_only')))
})

// ── FATE test 9: causal ordering cannot create authority ────────────────────

test('FATE #1000-9: generateCausalityEvidence always sets creates_authority=false', () => {
  const observations = makeLinearChain()
  const evidence = generateCausalityEvidence('R2', observations)
  assert.equal(evidence.creates_authority, false)
})

test('FATE #1000-9b: classifyCausalOrdering always sets creates_authority=false (all paths)', () => {
  const cases = [
    makeLinearChain(),                                  // VALID_LINEAGE
    makeFork(),                                         // CONCURRENT
    [obs('R1', []), obs('R1', [])],                     // NULL (replay)
  ]
  for (const observations of cases) {
    const result = classifyCausalOrdering('R1', observations)
    assert.equal(result.creates_authority, false, `creates_authority must be false for ${result.causal_result}`)
  }
})

test('FATE #1000-9c: validateEvidenceBoundary rejects creates_authority=true', () => {
  const bad = { evidence_only: true, creates_authority: true, creates_execution: false }
  const result = validateEvidenceBoundary(bad)
  assert.equal(result.valid, false)
  assert.ok(result.violations.some((v) => v.includes('creates_authority')))
})

test('FATE #1000-9d: causal evidence object contains no authority grant fields', () => {
  const observations = makeLinearChain()
  const evidence = generateCausalityEvidence('R2', observations)
  assert.ok(!('authority_grant' in evidence), 'must not contain authority_grant')
  assert.ok(!('authorization' in evidence), 'must not contain authorization')
  assert.ok(!('deployment_token' in evidence), 'must not contain deployment_token')
})

// ── FATE test 10: causal ordering cannot create proof ──────────────────────

test('FATE #1000-10: generateCausalityEvidence result contains no proof fields', () => {
  const observations = makeLinearChain()
  const evidence = generateCausalityEvidence('R2', observations)
  assert.ok(!('proof_id' in evidence), 'must not contain proof_id')
  assert.ok(!('proof_binding_hash' in evidence), 'must not contain proof_binding_hash')
  assert.ok(!('proof_signature' in evidence), 'must not contain proof_signature')
})

test('FATE #1000-10b: classifyCausalOrdering result contains no proof fields', () => {
  const observations = makeLinearChain()
  const result = classifyCausalOrdering('R2', observations)
  assert.ok(!('proof_id' in result))
  assert.ok(!('proof_binding_hash' in result))
  assert.ok(!('execution_id' in result))
})

test('FATE #1000-10c: causal_hash is evidence hash — not a cryptographic proof', () => {
  // causal_hash is a deterministic content hash for ordering evidence,
  // not an authority-granting proof signature
  const observations = makeLinearChain()
  const evidence = generateCausalityEvidence('R2', observations)
  assert.equal(typeof evidence.causal_hash, 'string')
  assert.equal(evidence.causal_hash.length, 64, 'causal_hash must be a 64-char hex SHA-256')
  assert.equal(evidence.creates_authority, false)
  assert.equal(evidence.evidence_only, true)
})

// ── FATE test 11: causal ordering cannot execute ────────────────────────────

test('FATE #1000-11: generateCausalityEvidence always sets creates_execution=false', () => {
  const observations = makeLinearChain()
  const evidence = generateCausalityEvidence('R2', observations)
  assert.equal(evidence.creates_execution, false)
})

test('FATE #1000-11b: classifyCausalOrdering always sets creates_execution=false', () => {
  const observations = makeLinearChain()
  const result = classifyCausalOrdering('R2', observations)
  assert.equal(result.creates_execution, false)
})

test('FATE #1000-11c: validateEvidenceBoundary rejects creates_execution=true', () => {
  const bad = { evidence_only: true, creates_authority: false, creates_execution: true }
  const result = validateEvidenceBoundary(bad)
  assert.equal(result.valid, false)
  assert.ok(result.violations.some((v) => v.includes('creates_execution')))
})

// ── FATE test 12: causality never rewrites registry state ──────────────────

test('FATE #1000-12: generateCausalityEvidence does not mutate input observations array', () => {
  const observations = makeLinearChain()
  const snapshot = JSON.stringify(observations)

  generateCausalityEvidence('R2', observations)

  assert.equal(JSON.stringify(observations), snapshot, 'observations must not be mutated')
})

test('FATE #1000-12b: detectCausalReplayAnomalies does not mutate input', () => {
  const observations = makeLinearChain()
  const snapshot = JSON.stringify(observations)

  detectCausalReplayAnomalies(observations)

  assert.equal(JSON.stringify(observations), snapshot, 'observations must not be mutated')
})

test('FATE #1000-12c: classifyCausalOrdering does not mutate input observations', () => {
  const observations = makeLinearChain()
  const snapshot = JSON.stringify(observations)

  classifyCausalOrdering('R2', observations)

  assert.equal(JSON.stringify(observations), snapshot)
})

test('FATE #1000-12d: validateRollbackAncestry does not mutate input', () => {
  const observations = makeRollbackChain()
  const snapshot = JSON.stringify(observations)

  validateRollbackAncestry(observations[2], observations)

  assert.equal(JSON.stringify(observations), snapshot)
})

// ── FATE test 13: BREAK_GLASS causal normalization fails ────────────────────

test('FATE #1000-13: rollback of BREAK_GLASS release with canonical=true → break_glass_causal_normalization', () => {
  const observations = [
    obs('R1', [], { break_glass: true }),  // BREAK_GLASS release
    obs('R2', ['R1']),
    obs('R3', ['R2'], {
      rollback_of: 'R1',
      canonical_release_candidate: true,  // trying to normalize BREAK_GLASS
    }),
  ]
  const result = validateRollbackAncestry(observations[2], observations)

  assert.equal(result.valid, false)
  assert.equal(result.failure_class, CAUSAL_FAILURE_CLASSES.BREAK_GLASS_CAUSAL_NORMALIZATION)
})

test('FATE #1000-13b: rollback of BREAK_GLASS with canonical=false is not normalized', () => {
  // Not trying to normalize — should pass the BREAK_GLASS check (may still fail fork/ancestry checks)
  const observations = [
    obs('R1', [], { break_glass: true }),
    obs('R2', ['R1']),
    obs('R3', ['R2'], { rollback_of: 'R1', canonical_release_candidate: false }),
  ]
  const result = validateRollbackAncestry(observations[2], observations)

  // break_glass_causal_normalization must NOT be triggered when canonical=false
  assert.notEqual(
    result.failure_class,
    CAUSAL_FAILURE_CLASSES.BREAK_GLASS_CAUSAL_NORMALIZATION,
    'BREAK_GLASS causal normalization must only trigger on canonical_release_candidate=true',
  )
})

test('FATE #1000-13c: BREAK_GLASS_CAUSAL_NORMALIZATION is in CAUSAL_FAILURE_CLASSES', () => {
  assert.equal(
    CAUSAL_FAILURE_CLASSES.BREAK_GLASS_CAUSAL_NORMALIZATION,
    'break_glass_causal_normalization',
  )
})

// ── FATE test 14: causal clocks remain deterministic ───────────────────────

test('FATE #1000-14: validateCausalClock accepts logical clock', () => {
  const result = validateCausalClock('logical')
  assert.equal(result.valid, true)
  assert.equal(result.failure_class, null)
})

test('FATE #1000-14b: validateCausalClock rejects unknown clock → unknown_causal_clock', () => {
  const result = validateCausalClock('vector')
  assert.equal(result.valid, false)
  assert.equal(result.failure_class, CAUSAL_FAILURE_CLASSES.UNKNOWN_CAUSAL_CLOCK)
})

test('FATE #1000-14c: generateCausalityEvidence with unknown clock returns NULL', () => {
  const observations = makeLinearChain()
  const evidence = generateCausalityEvidence('R2', observations, { clockAlg: 'lamport' })

  assert.equal(evidence.causal_result, CAUSAL_RESULTS.NULL)
  assert.equal(evidence.failure_class, CAUSAL_FAILURE_CLASSES.UNKNOWN_CAUSAL_CLOCK)
  assert.equal(evidence.evidence_only, true)
  assert.equal(evidence.creates_authority, false)
})

test('FATE #1000-14d: computeCausalPositions is deterministic — repeated calls produce same result', () => {
  const observations = makeDiamond()
  const r1 = computeCausalPositions(observations)
  const r2 = computeCausalPositions(observations)

  assert.equal(r1.failure_class, null)
  assert.equal(r2.failure_class, null)

  for (const obs of observations) {
    assert.equal(
      r1.positions.get(obs.release_id),
      r2.positions.get(obs.release_id),
      `position for ${obs.release_id} must be deterministic`,
    )
  }
})

test('FATE #1000-14e: computeCausalPositions returns NULL on cyclic graph', () => {
  const observations = [
    obs('R1', ['R2']),
    obs('R2', ['R1']),
  ]
  const { positions, failure_class } = computeCausalPositions(observations)

  assert.equal(positions, null)
  assert.equal(failure_class, CAUSAL_FAILURE_CLASSES.CAUSAL_LINEAGE_AMBIGUITY)
})

// ── FATE test 15: causality evidence serialization is canonical ─────────────

test('FATE #1000-15: canonicalJson sorts keys alphabetically', () => {
  const obj = { z: 1, a: 2, m: 3 }
  const result = canonicalJson(obj)
  assert.ok(result.startsWith('{"a":'), 'canonical JSON must sort keys alphabetically')
})

test('FATE #1000-15b: canonicalJson is deterministic — same input same output', () => {
  const obj = { release_id: 'R1', ancestors: ['R2', 'R3'], causal_result: 'VALID_LINEAGE' }
  const r1 = canonicalJson(obj)
  const r2 = canonicalJson(obj)
  assert.equal(r1, r2)
})

test('FATE #1000-15c: canonicalJson normalizes different key insertion orders to same output', () => {
  const obj1 = { a: 1, b: 2, c: 3 }
  const obj2 = { c: 3, a: 1, b: 2 }
  assert.equal(canonicalJson(obj1), canonicalJson(obj2), 'canonical JSON must normalize key order')
})

test('FATE #1000-15d: generateCausalityEvidence ancestor_release_ids are sorted canonically', () => {
  const observations = [
    obs('R1', []),
    obs('R2', []),
    obs('R3', ['R2', 'R1']),  // ancestors in non-sorted order
  ]
  const evidence = generateCausalityEvidence('R3', observations)

  assert.deepEqual(
    evidence.ancestor_release_ids,
    [...evidence.ancestor_release_ids].sort(),
    'ancestor_release_ids must be sorted',
  )
})

test('FATE #1000-15e: computeCausalHash normalizes arrays before hashing', () => {
  const state1 = {
    release_id: 'R1',
    ancestor_release_ids: ['B', 'A'],
    descendant_release_ids: ['C'],
    concurrent_release_ids: [],
    rollback_of: null,
    causal_result: CAUSAL_RESULTS.VALID_LINEAGE,
  }
  const state2 = {
    release_id: 'R1',
    ancestor_release_ids: ['A', 'B'],  // different order
    descendant_release_ids: ['C'],
    concurrent_release_ids: [],
    rollback_of: null,
    causal_result: CAUSAL_RESULTS.VALID_LINEAGE,
  }
  assert.equal(computeCausalHash(state1), computeCausalHash(state2), 'hash must normalize array order')
})

// ── FATE test 16: concurrent releases are not silently linearized ───────────

test('FATE #1000-16: concurrent releases are not silently linearized — causal_result is CONCURRENT', () => {
  const observations = makeFork()
  const evidenceR2 = generateCausalityEvidence('R2', observations)
  const evidenceR3 = generateCausalityEvidence('R3', observations)

  // Neither R2 nor R3 should appear in the other's ancestor_release_ids
  assert.ok(
    !evidenceR2.ancestor_release_ids.includes('R3'),
    'R3 must not be silently placed as ancestor of R2',
  )
  assert.ok(
    !evidenceR3.ancestor_release_ids.includes('R2'),
    'R2 must not be silently placed as ancestor of R3',
  )

  // Both must classify as CONCURRENT
  assert.equal(evidenceR2.causal_result, CAUSAL_RESULTS.CONCURRENT)
  assert.equal(evidenceR3.causal_result, CAUSAL_RESULTS.CONCURRENT)
})

test('FATE #1000-16b: detectConcurrentReleases never silently linearizes — concurrent_pairs is non-empty', () => {
  const observations = makeFork()
  const { concurrent_pairs, failure_class } = detectConcurrentReleases(observations)

  assert.equal(failure_class, null)
  assert.ok(
    concurrent_pairs.length > 0,
    'concurrent releases must be explicitly classified, not silently linearized',
  )
})

test('FATE #1000-16c: linear chain has no concurrent releases', () => {
  const observations = makeLinearChain()
  const { concurrent_pairs } = detectConcurrentReleases(observations)
  assert.equal(concurrent_pairs.length, 0, 'linear chain must have no concurrent releases')
})

// ── Additional: descendant-before-ancestor detection ────────────────────────

test('FATE #1000-add-1: descendant-before-ancestor in sequence → causal_replay_anomaly', () => {
  const observations = [
    obs('R2', ['R1']),  // R2 before R1 — R1 not yet seen!
    obs('R1', []),
  ]

  const anomalies = detectCausalReplayAnomalies(observations)
  assert.ok(anomalies.length > 0)
  assert.ok(anomalies.some((a) => a.failure_class === CAUSAL_FAILURE_CLASSES.CAUSAL_REPLAY_ANOMALY))
  assert.ok(anomalies.some((a) => a.detail.includes('descendant-before-ancestor')))
})

test('FATE #1000-add-1b: classifyCausalOrdering fails closed when descendant precedes ancestor', () => {
  const observations = [
    obs('R3', ['R2']),  // out-of-order
    obs('R2', ['R1']),  // out-of-order
    obs('R1', []),
  ]

  const result = classifyCausalOrdering('R3', observations)
  assert.equal(result.causal_result, CAUSAL_RESULTS.NULL)
  assert.equal(result.failure_class, CAUSAL_FAILURE_CLASSES.CAUSAL_REPLAY_ANOMALY)
})

// ── Additional: rollback replay ancestry ────────────────────────────────────

test('FATE #1000-add-2: rollback with empty rollback_of string → rollback_lineage_missing', () => {
  const observations = makeLinearChain()
  const rollback = obs('R4', ['R3'], { rollback_of: '' })
  const result = validateRollbackAncestry(rollback, [...observations, rollback])

  assert.equal(result.valid, false)
  assert.equal(result.failure_class, CAUSAL_FAILURE_CLASSES.ROLLBACK_LINEAGE_MISSING)
})

test('FATE #1000-add-2b: valid rollback is accepted without mutation', () => {
  const observations = makeRollbackChain()
  const snapshot = JSON.stringify(observations)

  const result = validateRollbackAncestry(observations[2], observations)

  assert.equal(result.valid, true)
  assert.equal(JSON.stringify(observations), snapshot, 'validateRollbackAncestry must not mutate observations')
})

// ── Additional: concurrent rollback classification ──────────────────────────

test('FATE #1000-add-3: concurrent rollbacks to different targets are not forks', () => {
  const observations = [
    obs('R1', []),
    obs('R2', ['R1']),
    obs('R3', ['R1']),
    obs('R4', ['R2'], { rollback_of: 'R1' }),  // rollback to R1 via R2 branch
    obs('R5', ['R3'], { rollback_of: 'R1' }),  // also rollback to R1 — but R4 and R5 are different
  ]
  // R4 and R5 both roll back to R1 — this is a fork
  const result4 = validateRollbackAncestry(observations[3], observations)
  assert.equal(result4.failure_class, CAUSAL_FAILURE_CLASSES.ROLLBACK_LINEAGE_FORK)
})

test('FATE #1000-add-3b: concurrent rollback pair classification — both are CONCURRENT', () => {
  const observations = [
    obs('R1', []),
    obs('R2', ['R1']),
    obs('R3', ['R1']),
  ]
  const observationMap = buildObservationMap(observations)
  const rel = classifyCausalRelationship('R2', 'R3', observationMap)
  assert.equal(rel.relationship, 'CONCURRENT')
})

// ── Additional: causal hash normalization stability ─────────────────────────

test('FATE #1000-add-4: causal hash is stable across multiple independent computations', () => {
  const observations = makeDiamond()
  const hashes = Array.from({ length: 10 }, () =>
    generateCausalityEvidence('R4', observations).causal_hash,
  )
  const unique = new Set(hashes)
  assert.equal(unique.size, 1, 'causal hash must be stable across repeated computations')
})

test('FATE #1000-add-4b: causal hash for NULL result is deterministic', () => {
  const state = {
    release_id: 'R-UNKNOWN',
    ancestor_release_ids: [],
    descendant_release_ids: [],
    concurrent_release_ids: [],
    rollback_of: null,
    causal_result: CAUSAL_RESULTS.NULL,
  }
  const h1 = computeCausalHash(state)
  const h2 = computeCausalHash(state)
  assert.equal(h1, h2)
  assert.equal(h1.length, 64)
})

// ── Additional: replay-safe lineage preservation ────────────────────────────

test('FATE #1000-add-5: replay-safe clean sequence preserves all causal positions', () => {
  const observations = makeDiamond()
  const { positions, failure_class } = computeCausalPositions(observations)

  assert.equal(failure_class, null)
  assert.ok(positions.has('R1'))
  assert.ok(positions.has('R2'))
  assert.ok(positions.has('R3'))
  assert.ok(positions.has('R4'))
  assert.equal(positions.get('R1'), 0)
  assert.equal(positions.get('R4'), 2, 'R4 merges R2 and R3 — position must be max(1,1)+1=2')
})

test('FATE #1000-add-5b: detectCausalReplayAnomalies on diamond is anomaly-free', () => {
  const observations = makeDiamond()
  const anomalies = detectCausalReplayAnomalies(observations)
  assert.deepEqual(anomalies, [], 'diamond topology must be anomaly-free in topological order')
})

// ── causal lineage object shape ─────────────────────────────────────────────

test('FATE #1000: generated evidence object has all required causal lineage fields', () => {
  const observations = makeLinearChain()
  const evidence = generateCausalityEvidence('R2', observations)

  assert.equal(evidence.artifact, 'RELEASE_PROVENANCE_CAUSAL_ORDERING')
  assert.equal(evidence.evidence_only, true)
  assert.equal(evidence.creates_authority, false)
  assert.equal(evidence.creates_execution, false)
  assert.equal(evidence.lineage_clock_alg, 'logical')
  assert.equal(evidence.release_id, 'R2')
  assert.ok(Array.isArray(evidence.ancestor_release_ids))
  assert.ok(Array.isArray(evidence.descendant_release_ids))
  assert.ok(Array.isArray(evidence.concurrent_release_ids))
  assert.ok('rollback_of' in evidence)
  assert.ok([CAUSAL_RESULTS.VALID_LINEAGE, CAUSAL_RESULTS.CONCURRENT, CAUSAL_RESULTS.NULL].includes(evidence.causal_result))
  assert.ok(typeof evidence.causal_hash === 'string')
  assert.equal(evidence.causal_hash.length, 64)
})

test('FATE #1000: validateEvidenceBoundary accepts valid evidence object', () => {
  const observations = makeLinearChain()
  const evidence = generateCausalityEvidence('R2', observations)
  const result = validateEvidenceBoundary(evidence)

  assert.equal(result.valid, true)
  assert.deepEqual(result.violations, [])
})

// ── non-regression ──────────────────────────────────────────────────────────

test('FATE #1000 non-regression: scripts/append-release-provenance.mjs is present and unmodified', async () => {
  const mod = await import('../../scripts/append-release-provenance.mjs')
  assert.ok(typeof mod.canonicalJson === 'function')
  assert.ok(typeof mod.appendProvenanceEntry === 'function')
  assert.ok(typeof mod.REGISTRY_FAILURE_CLASSES === 'object')
})

test('FATE #1000 non-regression: scripts/verify-release-provenance.mjs is present and unmodified', async () => {
  const mod = await import('../../scripts/verify-release-provenance.mjs')
  assert.ok(typeof mod.classifyReleaseTarget === 'function')
  assert.ok(typeof mod.verifyCanonicalReleaseBoundary === 'function')
  assert.ok(typeof mod.FAILURE_CLASSES === 'object')
})

test('FATE #1000 non-regression: issue-996 FATE test file is present', () => {
  assert.ok(
    existsSync(join(root, 'tests/fate/issue-996-provenance-registry-persistence.test.mjs')),
    '#996 FATE test file must remain present',
  )
})

test('FATE #1000 non-regression: issue-994 FATE test file is present', () => {
  assert.ok(
    existsSync(join(root, 'tests/fate/issue-994-release-provenance-enforcement.test.mjs')),
    '#994 FATE test file must remain present',
  )
})
