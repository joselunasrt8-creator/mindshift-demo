/**
 * Issue #1004 — RELEASE_PROVENANCE_CONSUMPTION_BOUNDARY_V1
 *
 * FATE tests proving deterministic downstream consumption boundaries for
 * release provenance finality checkpoints.
 *
 * Verifies:
 *   1.  FINALIZED checkpoint becomes CONSUMABLE_EVIDENCE
 *   2.  NOT_FINAL checkpoint becomes REJECTED
 *   3.  NULL checkpoint becomes NULL
 *   4.  missing checkpoint hash becomes NULL
 *   5.  malformed checkpoint hash becomes NULL
 *   6.  authority field attempts become NULL
 *   7.  proof field attempts become NULL
 *   8.  execution field attempts become NULL
 *   9.  deployment field attempts become NULL
 *   10. BREAK_GLASS normalization becomes NULL
 *   11. consumption evidence remains evidence-only
 *   12. consumption cannot create authority
 *   13. consumption cannot create proof
 *   14. consumption cannot execute
 *   15. consumption cannot trigger deployment
 *   16. same consumption state produces same consumption hash
 *   17. reordered consumption classes preserve hash stability
 *   18. downstream consumer mode cannot upgrade evidence into permission
 *
 * Additional:
 *   - invalid checkpoint_hash length
 *   - invalid checkpoint_hash encoding
 *   - consumer mode downgrade behavior
 *   - REJECTED determinism
 *   - NULL fail-closed determinism
 *   - no runtime route expansion
 *   - no deployment capability expansion
 *   - no lineage rewriting
 *   - no registry mutation
 *   - no implicit authority upgrade
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
  CONSUMPTION_RESULTS,
  CONSUMPTION_CLASSES,
  canonicalJson,
  computeConsumptionHash,
  classifyConsumptionBoundary,
  validateCheckpointConsumptionBoundary,
  isValidCheckpointHash,
} from '../../scripts/release-provenance-consumption-boundary.mjs'

import {
  classifyFinalityCheckpoint,
} from '../../scripts/release-provenance-finality-checkpoints.mjs'

const REQUIRED_CONSUMPTION_CLASSES = [
  'consumption_checkpoint_accepted',
  'consumption_checkpoint_not_final',
  'consumption_checkpoint_null',
  'consumption_boundary_violation',
  'consumption_authority_attempt',
  'consumption_proof_attempt',
  'consumption_execution_attempt',
  'consumption_deployment_attempt',
  'consumption_hash_invalid',
  'consumption_break_glass_normalization',
]

const VALID_CAUSAL_HASH = 'c'.repeat(64)
const VALID_CHECKPOINT_HASH = 'a'.repeat(64)

// ── finality checkpoint fixture helpers ─────────────────────────────────────

function makeCausalEvidence(causalResult, extra = {}) {
  return {
    artifact: 'RELEASE_PROVENANCE_CAUSAL_ORDERING',
    evidence_only: true,
    creates_authority: false,
    creates_execution: false,
    lineage_clock_alg: 'logical',
    release_id: 'R1',
    ancestor_release_ids: [],
    descendant_release_ids: [],
    concurrent_release_ids: [],
    rollback_of: null,
    causal_result: causalResult,
    causal_hash: VALID_CAUSAL_HASH,
    ...extra,
  }
}

function makeFinalizedCheckpoint(extra = {}) {
  const causal = makeCausalEvidence('VALID_LINEAGE')
  const checkpoint = classifyFinalityCheckpoint(causal)
  return { ...checkpoint, ...extra }
}

function makeNotFinalCheckpoint(extra = {}) {
  const causal = makeCausalEvidence('CONCURRENT', { concurrent_release_ids: ['R2'] })
  const checkpoint = classifyFinalityCheckpoint(causal)
  return { ...checkpoint, ...extra }
}

function makeNullCheckpoint(failureClass = null, extra = {}) {
  const causal = makeCausalEvidence('NULL', {
    causal_hash: '0'.repeat(64),
    ...(failureClass ? { failure_class: failureClass } : {}),
  })
  const checkpoint = classifyFinalityCheckpoint(causal)
  return { ...checkpoint, ...extra }
}

// ── artifact and export presence ────────────────────────────────────────────

test('issue #1004: release-provenance-consumption-boundary.mjs exists in scripts/', () => {
  assert.ok(
    existsSync(join(root, 'scripts/release-provenance-consumption-boundary.mjs')),
    'scripts/release-provenance-consumption-boundary.mjs must exist',
  )
})

test('issue #1004: exports CONSUMPTION_RESULTS with CONSUMABLE_EVIDENCE, REJECTED, NULL', () => {
  assert.equal(CONSUMPTION_RESULTS.CONSUMABLE_EVIDENCE, 'CONSUMABLE_EVIDENCE')
  assert.equal(CONSUMPTION_RESULTS.REJECTED, 'REJECTED')
  assert.equal(CONSUMPTION_RESULTS.NULL, 'NULL')
})

test('issue #1004: exports CONSUMPTION_CLASSES with all 10 required values', () => {
  for (const cls of REQUIRED_CONSUMPTION_CLASSES) {
    const found = Object.values(CONSUMPTION_CLASSES).includes(cls)
    assert.ok(found, `CONSUMPTION_CLASSES must include value "${cls}"`)
  }
})

test('issue #1004: exports all required functions', () => {
  assert.equal(typeof canonicalJson, 'function')
  assert.equal(typeof computeConsumptionHash, 'function')
  assert.equal(typeof classifyConsumptionBoundary, 'function')
  assert.equal(typeof validateCheckpointConsumptionBoundary, 'function')
  assert.equal(typeof isValidCheckpointHash, 'function')
})

// ── FATE test 1: FINALIZED checkpoint becomes CONSUMABLE_EVIDENCE ────────────

test('FATE #1004-1: FINALIZED checkpoint → CONSUMABLE_EVIDENCE', () => {
  const checkpoint = makeFinalizedCheckpoint()
  const result = classifyConsumptionBoundary(checkpoint)

  assert.equal(result.consumption_result, CONSUMPTION_RESULTS.CONSUMABLE_EVIDENCE)
  assert.ok(result.consumption_classes.includes(CONSUMPTION_CLASSES.CONSUMPTION_CHECKPOINT_ACCEPTED))
  assert.equal(result.evidence_only, true)
  assert.equal(result.creates_authority, false)
  assert.equal(result.creates_execution, false)
  assert.equal(result.creates_proof, false)
})

test('FATE #1004-1b: CONSUMABLE_EVIDENCE has all required output fields', () => {
  const checkpoint = makeFinalizedCheckpoint()
  const result = classifyConsumptionBoundary(checkpoint)

  assert.equal(result.artifact, 'RELEASE_PROVENANCE_CONSUMPTION_BOUNDARY')
  assert.equal(result.evidence_only, true)
  assert.equal(result.creates_authority, false)
  assert.equal(result.creates_execution, false)
  assert.equal(result.creates_proof, false)
  assert.equal(result.release_id, 'R1')
  assert.equal(result.checkpoint_hash, checkpoint.checkpoint_hash)
  assert.equal(result.consumption_result, CONSUMPTION_RESULTS.CONSUMABLE_EVIDENCE)
  assert.ok(Array.isArray(result.consumption_classes))
  assert.equal(result.consumption_hash_alg, 'sha256')
  assert.equal(typeof result.consumption_hash, 'string')
  assert.equal(result.consumption_hash.length, 64)
})

test('FATE #1004-1c: CONSUMABLE_EVIDENCE is deterministic — same input same result', () => {
  const checkpoint = makeFinalizedCheckpoint()
  const r1 = classifyConsumptionBoundary(checkpoint)
  const r2 = classifyConsumptionBoundary(checkpoint)

  assert.equal(r1.consumption_result, r2.consumption_result)
  assert.equal(r1.consumption_hash, r2.consumption_hash)
  assert.deepEqual(r1.consumption_classes, r2.consumption_classes)
})

// ── FATE test 2: NOT_FINAL checkpoint becomes REJECTED ───────────────────────

test('FATE #1004-2: NOT_FINAL checkpoint → REJECTED', () => {
  const checkpoint = makeNotFinalCheckpoint()
  const result = classifyConsumptionBoundary(checkpoint)

  assert.equal(result.consumption_result, CONSUMPTION_RESULTS.REJECTED)
  assert.ok(result.consumption_classes.includes(CONSUMPTION_CLASSES.CONSUMPTION_CHECKPOINT_NOT_FINAL))
  assert.equal(result.evidence_only, true)
  assert.equal(result.creates_authority, false)
})

test('FATE #1004-2b: REJECTED checkpoint is never upgraded to CONSUMABLE_EVIDENCE', () => {
  const checkpoint = makeNotFinalCheckpoint()
  const r1 = classifyConsumptionBoundary(checkpoint)
  const r2 = classifyConsumptionBoundary(checkpoint, { requireExternalPolicy: false })

  assert.equal(r1.consumption_result, CONSUMPTION_RESULTS.REJECTED)
  assert.equal(r2.consumption_result, CONSUMPTION_RESULTS.REJECTED)
  assert.notEqual(r1.consumption_result, CONSUMPTION_RESULTS.CONSUMABLE_EVIDENCE)
})

test('FATE #1004-2c: REJECTED result is deterministic', () => {
  const checkpoint = makeNotFinalCheckpoint()
  const r1 = classifyConsumptionBoundary(checkpoint)
  const r2 = classifyConsumptionBoundary(checkpoint)

  assert.equal(r1.consumption_result, r2.consumption_result)
  assert.equal(r1.consumption_hash, r2.consumption_hash)
  assert.deepEqual(r1.consumption_classes, r2.consumption_classes)
})

// ── FATE test 3: NULL checkpoint becomes NULL ─────────────────────────────────

test('FATE #1004-3: NULL checkpoint → NULL consumption', () => {
  const checkpoint = makeNullCheckpoint()
  const result = classifyConsumptionBoundary(checkpoint)

  assert.equal(result.consumption_result, CONSUMPTION_RESULTS.NULL)
  assert.ok(result.consumption_classes.includes(CONSUMPTION_CLASSES.CONSUMPTION_CHECKPOINT_NULL))
})

test('FATE #1004-3b: absent checkpoint → NULL consumption', () => {
  const result = classifyConsumptionBoundary(null)
  assert.equal(result.consumption_result, CONSUMPTION_RESULTS.NULL)
  assert.ok(result.consumption_classes.includes(CONSUMPTION_CLASSES.CONSUMPTION_CHECKPOINT_NULL))
})

test('FATE #1004-3c: undefined checkpoint → NULL consumption', () => {
  const result = classifyConsumptionBoundary(undefined)
  assert.equal(result.consumption_result, CONSUMPTION_RESULTS.NULL)
})

test('FATE #1004-3d: NULL fail-closed — NULL is never upgraded by consumer mode flags', () => {
  const checkpoint = makeNullCheckpoint()
  // Even with no consumer mode restrictions, NULL cannot be upgraded
  const r1 = classifyConsumptionBoundary(checkpoint)
  const r2 = classifyConsumptionBoundary(null, { requireExternalPolicy: false })

  assert.equal(r1.consumption_result, CONSUMPTION_RESULTS.NULL)
  assert.equal(r2.consumption_result, CONSUMPTION_RESULTS.NULL)
})

test('FATE #1004-3e: NULL fail-closed determinism — same NULL state same consumption hash', () => {
  const checkpoint = makeNullCheckpoint()
  const r1 = classifyConsumptionBoundary(checkpoint)
  const r2 = classifyConsumptionBoundary(checkpoint)

  assert.equal(r1.consumption_hash, r2.consumption_hash)
  assert.deepEqual(r1.consumption_classes, r2.consumption_classes)
})

// ── FATE test 4: missing checkpoint hash becomes NULL ────────────────────────

test('FATE #1004-4: FINALIZED checkpoint with missing checkpoint_hash → NULL', () => {
  const checkpoint = makeFinalizedCheckpoint({ checkpoint_hash: null })
  const result = classifyConsumptionBoundary(checkpoint)

  assert.equal(result.consumption_result, CONSUMPTION_RESULTS.NULL)
  assert.ok(result.consumption_classes.includes(CONSUMPTION_CLASSES.CONSUMPTION_HASH_INVALID))
})

test('FATE #1004-4b: FINALIZED checkpoint with undefined checkpoint_hash → NULL', () => {
  const base = makeFinalizedCheckpoint()
  const { checkpoint_hash: _removed, ...checkpoint } = base
  const result = classifyConsumptionBoundary(checkpoint)

  assert.equal(result.consumption_result, CONSUMPTION_RESULTS.NULL)
  assert.ok(result.consumption_classes.includes(CONSUMPTION_CLASSES.CONSUMPTION_HASH_INVALID))
})

// ── FATE test 5: malformed checkpoint hash becomes NULL ──────────────────────

test('FATE #1004-5: FINALIZED checkpoint with wrong-length hash → NULL', () => {
  const checkpoint = makeFinalizedCheckpoint({ checkpoint_hash: 'a'.repeat(32) })
  const result = classifyConsumptionBoundary(checkpoint)

  assert.equal(result.consumption_result, CONSUMPTION_RESULTS.NULL)
  assert.ok(result.consumption_classes.includes(CONSUMPTION_CLASSES.CONSUMPTION_HASH_INVALID))
})

test('FATE #1004-5b: FINALIZED checkpoint with non-hex hash → NULL', () => {
  const checkpoint = makeFinalizedCheckpoint({ checkpoint_hash: 'Z'.repeat(64) })
  const result = classifyConsumptionBoundary(checkpoint)

  assert.equal(result.consumption_result, CONSUMPTION_RESULTS.NULL)
  assert.ok(result.consumption_classes.includes(CONSUMPTION_CLASSES.CONSUMPTION_HASH_INVALID))
})

test('FATE #1004-5c: FINALIZED checkpoint with uppercase hex hash → NULL (must be lowercase)', () => {
  const checkpoint = makeFinalizedCheckpoint({ checkpoint_hash: 'A'.repeat(64) })
  const result = classifyConsumptionBoundary(checkpoint)

  assert.equal(result.consumption_result, CONSUMPTION_RESULTS.NULL)
  assert.ok(result.consumption_classes.includes(CONSUMPTION_CLASSES.CONSUMPTION_HASH_INVALID))
})

test('FATE #1004-5d: invalid checkpoint_hash encoding — numeric string not hex → NULL', () => {
  const checkpoint = makeFinalizedCheckpoint({ checkpoint_hash: '1234567890'.repeat(7) })
  const result = classifyConsumptionBoundary(checkpoint)

  // 70 chars, not 64 → invalid length
  assert.equal(result.consumption_result, CONSUMPTION_RESULTS.NULL)
  assert.ok(result.consumption_classes.includes(CONSUMPTION_CLASSES.CONSUMPTION_HASH_INVALID))
})

test('FATE #1004-5e: isValidCheckpointHash validates correctly', () => {
  assert.equal(isValidCheckpointHash('a'.repeat(64)), true)
  assert.equal(isValidCheckpointHash('0'.repeat(64)), true)
  assert.equal(isValidCheckpointHash('f'.repeat(64)), true)
  assert.equal(isValidCheckpointHash('A'.repeat(64)), false, 'uppercase hex is invalid')
  assert.equal(isValidCheckpointHash('a'.repeat(63)), false, 'wrong length')
  assert.equal(isValidCheckpointHash('a'.repeat(65)), false, 'wrong length')
  assert.equal(isValidCheckpointHash(null), false)
  assert.equal(isValidCheckpointHash(undefined), false)
  assert.equal(isValidCheckpointHash(42), false)
  assert.equal(isValidCheckpointHash(''), false)
})

// ── FATE test 6: authority field attempts become NULL ────────────────────────

test('FATE #1004-6: FINALIZED checkpoint with creates_authority=true → NULL', () => {
  const checkpoint = makeFinalizedCheckpoint({ creates_authority: true })
  const result = classifyConsumptionBoundary(checkpoint)

  assert.equal(result.consumption_result, CONSUMPTION_RESULTS.NULL)
  assert.ok(result.consumption_classes.includes(CONSUMPTION_CLASSES.CONSUMPTION_AUTHORITY_ATTEMPT))
})

test('FATE #1004-6b: FINALIZED checkpoint with authority_grant field → NULL', () => {
  const checkpoint = makeFinalizedCheckpoint({ authority_grant: 'grant-001' })
  const result = classifyConsumptionBoundary(checkpoint)

  assert.equal(result.consumption_result, CONSUMPTION_RESULTS.NULL)
  assert.ok(result.consumption_classes.includes(CONSUMPTION_CLASSES.CONSUMPTION_AUTHORITY_ATTEMPT))
})

test('FATE #1004-6c: FINALIZED checkpoint with authorization field → NULL', () => {
  const checkpoint = makeFinalizedCheckpoint({ authorization: 'auth-token' })
  const result = classifyConsumptionBoundary(checkpoint)

  assert.equal(result.consumption_result, CONSUMPTION_RESULTS.NULL)
  assert.ok(result.consumption_classes.includes(CONSUMPTION_CLASSES.CONSUMPTION_AUTHORITY_ATTEMPT))
})

test('FATE #1004-6d: validateCheckpointConsumptionBoundary rejects creates_authority=true', () => {
  const bad = { evidence_only: true, creates_authority: true, creates_execution: false }
  const check = validateCheckpointConsumptionBoundary(bad)
  assert.equal(check.valid, false)
  assert.ok(check.consumption_classes.includes(CONSUMPTION_CLASSES.CONSUMPTION_AUTHORITY_ATTEMPT))
})

// ── FATE test 7: proof field attempts become NULL ────────────────────────────

test('FATE #1004-7: FINALIZED checkpoint with creates_proof=true → NULL', () => {
  const checkpoint = makeFinalizedCheckpoint({ creates_proof: true })
  const result = classifyConsumptionBoundary(checkpoint)

  assert.equal(result.consumption_result, CONSUMPTION_RESULTS.NULL)
  assert.ok(result.consumption_classes.includes(CONSUMPTION_CLASSES.CONSUMPTION_PROOF_ATTEMPT))
})

test('FATE #1004-7b: FINALIZED checkpoint with proof_id field → NULL', () => {
  const checkpoint = makeFinalizedCheckpoint({ proof_id: 'prf-001' })
  const result = classifyConsumptionBoundary(checkpoint)

  assert.equal(result.consumption_result, CONSUMPTION_RESULTS.NULL)
  assert.ok(result.consumption_classes.includes(CONSUMPTION_CLASSES.CONSUMPTION_PROOF_ATTEMPT))
})

test('FATE #1004-7c: FINALIZED checkpoint with proof_signature field → NULL', () => {
  const checkpoint = makeFinalizedCheckpoint({ proof_signature: 'sig-abc' })
  const result = classifyConsumptionBoundary(checkpoint)

  assert.equal(result.consumption_result, CONSUMPTION_RESULTS.NULL)
  assert.ok(result.consumption_classes.includes(CONSUMPTION_CLASSES.CONSUMPTION_PROOF_ATTEMPT))
})

test('FATE #1004-7d: FINALIZED checkpoint with proof_binding_hash field → NULL', () => {
  const checkpoint = makeFinalizedCheckpoint({ proof_binding_hash: 'abc'.repeat(21) })
  const result = classifyConsumptionBoundary(checkpoint)

  assert.equal(result.consumption_result, CONSUMPTION_RESULTS.NULL)
  assert.ok(result.consumption_classes.includes(CONSUMPTION_CLASSES.CONSUMPTION_PROOF_ATTEMPT))
})

test('FATE #1004-7e: validateCheckpointConsumptionBoundary rejects proof_id field', () => {
  const bad = {
    evidence_only: true,
    creates_authority: false,
    creates_execution: false,
    proof_id: 'prf-001',
  }
  const check = validateCheckpointConsumptionBoundary(bad)
  assert.equal(check.valid, false)
  assert.ok(check.consumption_classes.includes(CONSUMPTION_CLASSES.CONSUMPTION_PROOF_ATTEMPT))
})

// ── FATE test 8: execution field attempts become NULL ────────────────────────

test('FATE #1004-8: FINALIZED checkpoint with creates_execution=true → NULL', () => {
  const checkpoint = makeFinalizedCheckpoint({ creates_execution: true })
  const result = classifyConsumptionBoundary(checkpoint)

  assert.equal(result.consumption_result, CONSUMPTION_RESULTS.NULL)
  assert.ok(result.consumption_classes.includes(CONSUMPTION_CLASSES.CONSUMPTION_EXECUTION_ATTEMPT))
})

test('FATE #1004-8b: FINALIZED checkpoint with execution_token field → NULL', () => {
  const checkpoint = makeFinalizedCheckpoint({ execution_token: 'exec-tok' })
  const result = classifyConsumptionBoundary(checkpoint)

  assert.equal(result.consumption_result, CONSUMPTION_RESULTS.NULL)
  assert.ok(result.consumption_classes.includes(CONSUMPTION_CLASSES.CONSUMPTION_EXECUTION_ATTEMPT))
})

test('FATE #1004-8c: FINALIZED checkpoint with execution_id field → NULL', () => {
  const checkpoint = makeFinalizedCheckpoint({ execution_id: 'exec-001' })
  const result = classifyConsumptionBoundary(checkpoint)

  assert.equal(result.consumption_result, CONSUMPTION_RESULTS.NULL)
  assert.ok(result.consumption_classes.includes(CONSUMPTION_CLASSES.CONSUMPTION_EXECUTION_ATTEMPT))
})

test('FATE #1004-8d: validateCheckpointConsumptionBoundary rejects creates_execution=true', () => {
  const bad = { evidence_only: true, creates_authority: false, creates_execution: true }
  const check = validateCheckpointConsumptionBoundary(bad)
  assert.equal(check.valid, false)
  assert.ok(check.consumption_classes.includes(CONSUMPTION_CLASSES.CONSUMPTION_EXECUTION_ATTEMPT))
})

// ── FATE test 9: deployment field attempts become NULL ───────────────────────

test('FATE #1004-9: FINALIZED checkpoint with deployment_trigger field → NULL', () => {
  const checkpoint = makeFinalizedCheckpoint({ deployment_trigger: true })
  const result = classifyConsumptionBoundary(checkpoint)

  assert.equal(result.consumption_result, CONSUMPTION_RESULTS.NULL)
  assert.ok(result.consumption_classes.includes(CONSUMPTION_CLASSES.CONSUMPTION_DEPLOYMENT_ATTEMPT))
})

test('FATE #1004-9b: FINALIZED checkpoint with deployment_token field → NULL', () => {
  const checkpoint = makeFinalizedCheckpoint({ deployment_token: 'dep-tok' })
  const result = classifyConsumptionBoundary(checkpoint)

  assert.equal(result.consumption_result, CONSUMPTION_RESULTS.NULL)
  assert.ok(result.consumption_classes.includes(CONSUMPTION_CLASSES.CONSUMPTION_DEPLOYMENT_ATTEMPT))
})

test('FATE #1004-9c: FINALIZED checkpoint with release_authorization field → NULL', () => {
  const checkpoint = makeFinalizedCheckpoint({ release_authorization: 'rel-auth' })
  const result = classifyConsumptionBoundary(checkpoint)

  assert.equal(result.consumption_result, CONSUMPTION_RESULTS.NULL)
  assert.ok(result.consumption_classes.includes(CONSUMPTION_CLASSES.CONSUMPTION_DEPLOYMENT_ATTEMPT))
})

test('FATE #1004-9d: validateCheckpointConsumptionBoundary rejects deployment_trigger', () => {
  const bad = {
    evidence_only: true,
    creates_authority: false,
    creates_execution: false,
    deployment_trigger: true,
  }
  const check = validateCheckpointConsumptionBoundary(bad)
  assert.equal(check.valid, false)
  assert.ok(check.consumption_classes.includes(CONSUMPTION_CLASSES.CONSUMPTION_DEPLOYMENT_ATTEMPT))
})

// ── FATE test 10: BREAK_GLASS normalization becomes NULL ─────────────────────

test('FATE #1004-10: NULL checkpoint with BREAK_GLASS normalization → NULL + break_glass class', () => {
  const checkpoint = makeNullCheckpoint('break_glass_causal_normalization')
  const result = classifyConsumptionBoundary(checkpoint)

  assert.equal(result.consumption_result, CONSUMPTION_RESULTS.NULL)
  assert.ok(result.consumption_classes.includes(CONSUMPTION_CLASSES.CONSUMPTION_BREAK_GLASS_NORMALIZATION))
})

test('FATE #1004-10b: FINALIZED checkpoint with break_glass class in finality_classes → NULL', () => {
  const base = makeFinalizedCheckpoint()
  const crafted = {
    ...base,
    finality_classes: [...base.finality_classes, 'finality_break_glass_normalization'],
  }
  const result = classifyConsumptionBoundary(crafted)

  assert.equal(result.consumption_result, CONSUMPTION_RESULTS.NULL)
  assert.ok(result.consumption_classes.includes(CONSUMPTION_CLASSES.CONSUMPTION_BREAK_GLASS_NORMALIZATION))
})

test('FATE #1004-10c: BREAK_GLASS normalization class is in CONSUMPTION_CLASSES export', () => {
  assert.equal(
    CONSUMPTION_CLASSES.CONSUMPTION_BREAK_GLASS_NORMALIZATION,
    'consumption_break_glass_normalization',
  )
})

test('FATE #1004-10d: BREAK_GLASS normalization cannot be bypassed by consumer mode flags', () => {
  const checkpoint = makeNullCheckpoint('break_glass_causal_normalization')
  // No consumer mode flags should bypass NULL from BREAK_GLASS
  const result = classifyConsumptionBoundary(checkpoint, {
    requireExternalPolicy: false,
    requireHumanApproval: false,
    requireDeploymentAuthority: false,
  })
  assert.equal(result.consumption_result, CONSUMPTION_RESULTS.NULL)
})

// ── FATE test 11: consumption evidence remains evidence-only ─────────────────

test('FATE #1004-11: classifyConsumptionBoundary always sets evidence_only=true (CONSUMABLE)', () => {
  const checkpoint = makeFinalizedCheckpoint()
  const result = classifyConsumptionBoundary(checkpoint)
  assert.equal(result.evidence_only, true)
})

test('FATE #1004-11b: classifyConsumptionBoundary always sets evidence_only=true (REJECTED)', () => {
  const checkpoint = makeNotFinalCheckpoint()
  const result = classifyConsumptionBoundary(checkpoint)
  assert.equal(result.evidence_only, true)
})

test('FATE #1004-11c: classifyConsumptionBoundary always sets evidence_only=true (NULL)', () => {
  const checkpoint = makeNullCheckpoint()
  const result = classifyConsumptionBoundary(checkpoint)
  assert.equal(result.evidence_only, true)
})

test('FATE #1004-11d: classifyConsumptionBoundary evidence_only on all paths including absent', () => {
  const cases = [
    makeFinalizedCheckpoint(),
    makeNotFinalCheckpoint(),
    makeNullCheckpoint(),
    null,
    undefined,
  ]
  for (const checkpoint of cases) {
    const result = classifyConsumptionBoundary(checkpoint)
    assert.equal(
      result.evidence_only,
      true,
      `evidence_only must be true for consumption_result=${result.consumption_result}`,
    )
  }
})

// ── FATE test 12: consumption cannot create authority ────────────────────────

test('FATE #1004-12: classifyConsumptionBoundary always sets creates_authority=false (all paths)', () => {
  const cases = [
    makeFinalizedCheckpoint(),
    makeNotFinalCheckpoint(),
    makeNullCheckpoint(),
    null,
  ]
  for (const checkpoint of cases) {
    const result = classifyConsumptionBoundary(checkpoint)
    assert.equal(
      result.creates_authority,
      false,
      `creates_authority must be false for consumption_result=${result.consumption_result}`,
    )
  }
})

test('FATE #1004-12b: consumption evidence contains no authority grant fields', () => {
  const checkpoint = makeFinalizedCheckpoint()
  const result = classifyConsumptionBoundary(checkpoint)
  assert.ok(!('authority_grant' in result), 'must not contain authority_grant')
  assert.ok(!('authorization' in result), 'must not contain authorization')
  assert.ok(!('deployment_token' in result), 'must not contain deployment_token')
})

test('FATE #1004-12c: no implicit authority upgrade — consumption_result is not authority', () => {
  const checkpoint = makeFinalizedCheckpoint()
  const result = classifyConsumptionBoundary(checkpoint)
  // consumption_result must remain a classification string, not an authority object
  assert.equal(typeof result.consumption_result, 'string')
  assert.equal(result.creates_authority, false)
  assert.notEqual(result.consumption_result, 'AUTHORIZED')
  assert.notEqual(result.consumption_result, 'GRANTED')
})

// ── FATE test 13: consumption cannot create proof ────────────────────────────

test('FATE #1004-13: classifyConsumptionBoundary always sets creates_proof=false (all paths)', () => {
  const cases = [
    makeFinalizedCheckpoint(),
    makeNotFinalCheckpoint(),
    makeNullCheckpoint(),
    null,
  ]
  for (const checkpoint of cases) {
    const result = classifyConsumptionBoundary(checkpoint)
    assert.equal(
      result.creates_proof,
      false,
      `creates_proof must be false for consumption_result=${result.consumption_result}`,
    )
  }
})

test('FATE #1004-13b: consumption evidence contains no proof fields', () => {
  const checkpoint = makeFinalizedCheckpoint()
  const result = classifyConsumptionBoundary(checkpoint)
  assert.ok(!('proof_id' in result), 'must not contain proof_id')
  assert.ok(!('proof_binding_hash' in result), 'must not contain proof_binding_hash')
  assert.ok(!('proof_signature' in result), 'must not contain proof_signature')
})

test('FATE #1004-13c: consumption_hash is an evidence hash — not a cryptographic proof', () => {
  const checkpoint = makeFinalizedCheckpoint()
  const result = classifyConsumptionBoundary(checkpoint)
  assert.equal(typeof result.consumption_hash, 'string')
  assert.equal(result.consumption_hash.length, 64)
  assert.equal(result.creates_proof, false)
  assert.equal(result.evidence_only, true)
})

// ── FATE test 14: consumption cannot execute ─────────────────────────────────

test('FATE #1004-14: classifyConsumptionBoundary always sets creates_execution=false (all paths)', () => {
  const cases = [
    makeFinalizedCheckpoint(),
    makeNotFinalCheckpoint(),
    makeNullCheckpoint(),
    null,
  ]
  for (const checkpoint of cases) {
    const result = classifyConsumptionBoundary(checkpoint)
    assert.equal(
      result.creates_execution,
      false,
      `creates_execution must be false for consumption_result=${result.consumption_result}`,
    )
  }
})

test('FATE #1004-14b: consumption evidence contains no execution fields', () => {
  const checkpoint = makeFinalizedCheckpoint()
  const result = classifyConsumptionBoundary(checkpoint)
  assert.ok(!('execution_id' in result), 'must not contain execution_id')
  assert.ok(!('execution_token' in result), 'must not contain execution_token')
  assert.ok(!('deployment_trigger' in result), 'must not contain deployment_trigger')
})

// ── FATE test 15: consumption cannot trigger deployment ──────────────────────

test('FATE #1004-15: consumption evidence contains no deployment-related fields', () => {
  const checkpoint = makeFinalizedCheckpoint()
  const result = classifyConsumptionBoundary(checkpoint)
  assert.ok(!('deployment_trigger' in result), 'must not contain deployment_trigger')
  assert.ok(!('deployment_capability' in result), 'must not contain deployment_capability')
  assert.ok(!('deploy_token' in result), 'must not contain deploy_token')
  assert.ok(!('release_authorization' in result), 'must not contain release_authorization')
  assert.ok(!('deployment_authorization' in result), 'must not contain deployment_authorization')
})

test('FATE #1004-15b: no deployment capability expansion (all paths)', () => {
  const cases = [
    makeFinalizedCheckpoint(),
    makeNotFinalCheckpoint(),
    makeNullCheckpoint(),
    null,
  ]
  for (const checkpoint of cases) {
    const result = classifyConsumptionBoundary(checkpoint)
    assert.ok(!('deployment_trigger' in result))
    assert.ok(!('deployment_capability' in result))
    assert.ok(!('runtime_route' in result))
    assert.ok(!('execution_surface' in result))
  }
})

// ── FATE test 16: same consumption state produces same consumption hash ───────

test('FATE #1004-16: same consumption state produces same consumption hash', () => {
  const checkpoint = makeFinalizedCheckpoint()
  const r1 = classifyConsumptionBoundary(checkpoint)
  const r2 = classifyConsumptionBoundary(checkpoint)

  assert.equal(r1.consumption_hash, r2.consumption_hash, 'same state must produce same consumption hash')
})

test('FATE #1004-16b: computeConsumptionHash is deterministic — repeated calls same result', () => {
  const state = {
    release_id: 'R1',
    checkpoint_hash: VALID_CHECKPOINT_HASH,
    consumption_result: CONSUMPTION_RESULTS.CONSUMABLE_EVIDENCE,
    consumption_classes: [CONSUMPTION_CLASSES.CONSUMPTION_CHECKPOINT_ACCEPTED],
  }
  const results = Array.from({ length: 5 }, () => computeConsumptionHash(state))
  const unique = new Set(results)
  assert.equal(unique.size, 1, 'computeConsumptionHash must always return same value for identical inputs')
})

test('FATE #1004-16c: different consumption states produce different consumption hashes', () => {
  const finalized = makeFinalizedCheckpoint()
  const notFinal = makeNotFinalCheckpoint()

  const r1 = classifyConsumptionBoundary(finalized)
  const r2 = classifyConsumptionBoundary(notFinal)

  assert.notEqual(r1.consumption_hash, r2.consumption_hash, 'different states must produce different hashes')
})

test('FATE #1004-16d: consumption_hash is 64-char lowercase hex SHA-256', () => {
  const checkpoint = makeFinalizedCheckpoint()
  const result = classifyConsumptionBoundary(checkpoint)

  assert.equal(result.consumption_hash.length, 64, 'consumption_hash must be 64-char hex')
  assert.ok(/^[0-9a-f]{64}$/.test(result.consumption_hash), 'consumption_hash must be lowercase hex')
})

test('FATE #1004-16e: consumption_hash does not include consumption_hash itself in payload', () => {
  const checkpoint = makeFinalizedCheckpoint()
  const result = classifyConsumptionBoundary(checkpoint)
  const recomputed = computeConsumptionHash({
    release_id: result.release_id,
    checkpoint_hash: result.checkpoint_hash,
    consumption_result: result.consumption_result,
    consumption_classes: result.consumption_classes,
  })
  assert.equal(result.consumption_hash, recomputed, 'consumption_hash must be recomputable without including itself')
})

// ── FATE test 17: reordered consumption classes preserve hash stability ───────

test('FATE #1004-17: reordered consumption classes produce the same consumption hash', () => {
  const state1 = {
    release_id: 'R1',
    checkpoint_hash: VALID_CHECKPOINT_HASH,
    consumption_result: CONSUMPTION_RESULTS.NULL,
    consumption_classes: [
      CONSUMPTION_CLASSES.CONSUMPTION_CHECKPOINT_NULL,
      CONSUMPTION_CLASSES.CONSUMPTION_BREAK_GLASS_NORMALIZATION,
    ],
  }
  const state2 = {
    ...state1,
    consumption_classes: [
      CONSUMPTION_CLASSES.CONSUMPTION_BREAK_GLASS_NORMALIZATION,
      CONSUMPTION_CLASSES.CONSUMPTION_CHECKPOINT_NULL,
    ],
  }
  assert.equal(
    computeConsumptionHash(state1),
    computeConsumptionHash(state2),
    'consumption hash must be stable under reordered consumption_classes',
  )
})

test('FATE #1004-17b: canonicalJson sorts keys alphabetically', () => {
  const obj = { z: 1, a: 2, m: 3 }
  const result = canonicalJson(obj)
  assert.ok(result.startsWith('{"a":'), 'canonical JSON must sort keys alphabetically')
})

test('FATE #1004-17c: canonicalJson normalizes different key insertion orders to same output', () => {
  const obj1 = { release_id: 'R1', consumption_result: 'CONSUMABLE_EVIDENCE', checkpoint_hash: 'abc' }
  const obj2 = { consumption_result: 'CONSUMABLE_EVIDENCE', checkpoint_hash: 'abc', release_id: 'R1' }
  assert.equal(canonicalJson(obj1), canonicalJson(obj2))
})

// ── FATE test 18: consumer mode cannot upgrade evidence into permission ───────

test('FATE #1004-18: consumer mode flags cannot upgrade NOT_FINAL into consumable', () => {
  const checkpoint = makeNotFinalCheckpoint()

  // Even with all flags false (most permissive consumer mode), NOT_FINAL is REJECTED
  const result = classifyConsumptionBoundary(checkpoint, {
    requireExternalPolicy: false,
    requireHumanApproval: false,
    requireDeploymentAuthority: false,
  })
  assert.notEqual(result.consumption_result, CONSUMPTION_RESULTS.CONSUMABLE_EVIDENCE)
  assert.equal(result.consumption_result, CONSUMPTION_RESULTS.REJECTED)
})

test('FATE #1004-18b: consumer mode requireExternalPolicy converts CONSUMABLE_EVIDENCE → REJECTED', () => {
  const checkpoint = makeFinalizedCheckpoint()
  const result = classifyConsumptionBoundary(checkpoint, { requireExternalPolicy: true })

  assert.equal(result.consumption_result, CONSUMPTION_RESULTS.REJECTED)
  assert.ok(result.consumption_classes.includes(CONSUMPTION_CLASSES.CONSUMPTION_CHECKPOINT_NOT_FINAL))
})

test('FATE #1004-18c: consumer mode requireHumanApproval converts CONSUMABLE_EVIDENCE → REJECTED', () => {
  const checkpoint = makeFinalizedCheckpoint()
  const result = classifyConsumptionBoundary(checkpoint, { requireHumanApproval: true })

  assert.equal(result.consumption_result, CONSUMPTION_RESULTS.REJECTED)
})

test('FATE #1004-18d: consumer mode requireDeploymentAuthority converts CONSUMABLE_EVIDENCE → REJECTED', () => {
  const checkpoint = makeFinalizedCheckpoint()
  const result = classifyConsumptionBoundary(checkpoint, { requireDeploymentAuthority: true })

  assert.equal(result.consumption_result, CONSUMPTION_RESULTS.REJECTED)
})

test('FATE #1004-18e: consumer mode downgrade behavior — REJECTED stays REJECTED', () => {
  const checkpoint = makeNotFinalCheckpoint()
  // Adding consumer mode flags cannot further degrade REJECTED into a different state
  const result = classifyConsumptionBoundary(checkpoint, {
    requireExternalPolicy: true,
    requireHumanApproval: true,
  })
  assert.equal(result.consumption_result, CONSUMPTION_RESULTS.REJECTED)
  assert.equal(result.evidence_only, true)
  assert.equal(result.creates_authority, false)
})

test('FATE #1004-18f: consumer mode cannot bypass NULL', () => {
  const checkpoint = makeNullCheckpoint()
  const result = classifyConsumptionBoundary(checkpoint, {
    requireExternalPolicy: false,
    requireHumanApproval: false,
    requireDeploymentAuthority: false,
  })
  assert.equal(result.consumption_result, CONSUMPTION_RESULTS.NULL)
})

// ── Additional: no lineage rewriting ─────────────────────────────────────────

test('FATE #1004-add-1: consumption evidence contains no lineage rewrite fields', () => {
  const checkpoint = makeFinalizedCheckpoint()
  const result = classifyConsumptionBoundary(checkpoint)
  assert.ok(!('lineage_repair' in result), 'must not contain lineage_repair')
  assert.ok(!('ancestor_release_ids' in result), 'must not rewrite ancestor_release_ids')
  assert.ok(!('registry_mutation' in result), 'must not contain registry_mutation')
})

test('FATE #1004-add-1b: validateCheckpointConsumptionBoundary rejects lineage_repair field', () => {
  const bad = {
    evidence_only: true,
    creates_authority: false,
    creates_execution: false,
    lineage_repair: true,
  }
  const check = validateCheckpointConsumptionBoundary(bad)
  assert.equal(check.valid, false)
  assert.ok(check.consumption_classes.includes(CONSUMPTION_CLASSES.CONSUMPTION_BOUNDARY_VIOLATION))
})

test('FATE #1004-add-1c: validateCheckpointConsumptionBoundary rejects registry_mutation field', () => {
  const bad = {
    evidence_only: true,
    creates_authority: false,
    creates_execution: false,
    registry_mutation: true,
  }
  const check = validateCheckpointConsumptionBoundary(bad)
  assert.equal(check.valid, false)
  assert.ok(check.consumption_classes.includes(CONSUMPTION_CLASSES.CONSUMPTION_BOUNDARY_VIOLATION))
})

test('FATE #1004-add-1d: FINALIZED checkpoint with lineage_repair → NULL', () => {
  const checkpoint = makeFinalizedCheckpoint({ lineage_repair: true })
  const result = classifyConsumptionBoundary(checkpoint)

  assert.equal(result.consumption_result, CONSUMPTION_RESULTS.NULL)
  assert.ok(result.consumption_classes.includes(CONSUMPTION_CLASSES.CONSUMPTION_BOUNDARY_VIOLATION))
})

// ── Additional: no registry mutation ─────────────────────────────────────────

test('FATE #1004-add-2: FINALIZED checkpoint with registry_mutation → NULL', () => {
  const checkpoint = makeFinalizedCheckpoint({ registry_mutation: true })
  const result = classifyConsumptionBoundary(checkpoint)

  assert.equal(result.consumption_result, CONSUMPTION_RESULTS.NULL)
  assert.ok(result.consumption_classes.includes(CONSUMPTION_CLASSES.CONSUMPTION_BOUNDARY_VIOLATION))
})

// ── Additional: no runtime route expansion ────────────────────────────────────

test('FATE #1004-add-3: consumption evidence does not expand runtime routes', () => {
  const checkpoint = makeFinalizedCheckpoint()
  const result = classifyConsumptionBoundary(checkpoint)
  assert.ok(!('runtime_routes' in result))
  assert.ok(!('route_expansion' in result))
  assert.ok(!('execution_surface' in result))
  assert.ok(!('runtime_route' in result))
})

// ── Additional: evidence_only=false in checkpoint → NULL ─────────────────────

test('FATE #1004-add-4: FINALIZED checkpoint with evidence_only=false → NULL + boundary_violation', () => {
  const checkpoint = makeFinalizedCheckpoint({ evidence_only: false })
  const result = classifyConsumptionBoundary(checkpoint)

  assert.equal(result.consumption_result, CONSUMPTION_RESULTS.NULL)
  assert.ok(result.consumption_classes.includes(CONSUMPTION_CLASSES.CONSUMPTION_BOUNDARY_VIOLATION))
})

test('FATE #1004-add-4b: validateCheckpointConsumptionBoundary rejects evidence_only=false', () => {
  const bad = { evidence_only: false, creates_authority: false, creates_execution: false }
  const check = validateCheckpointConsumptionBoundary(bad)
  assert.equal(check.valid, false)
  assert.ok(check.consumption_classes.includes(CONSUMPTION_CLASSES.CONSUMPTION_BOUNDARY_VIOLATION))
})

test('FATE #1004-add-4c: validateCheckpointConsumptionBoundary accepts valid FINALIZED checkpoint shape', () => {
  const checkpoint = makeFinalizedCheckpoint()
  const check = validateCheckpointConsumptionBoundary(checkpoint)
  assert.equal(check.valid, true)
  assert.deepEqual(check.violations, [])
  assert.deepEqual(check.consumption_classes, [])
})

// ── Additional: input mutation guard ─────────────────────────────────────────

test('FATE #1004-add-5: classifyConsumptionBoundary does not mutate the finality checkpoint', () => {
  const checkpoint = makeFinalizedCheckpoint()
  const snapshot = JSON.stringify(checkpoint)
  classifyConsumptionBoundary(checkpoint)
  assert.equal(JSON.stringify(checkpoint), snapshot, 'finality checkpoint must not be mutated')
})

test('FATE #1004-add-5b: classifyConsumptionBoundary with NOT_FINAL does not mutate checkpoint', () => {
  const checkpoint = makeNotFinalCheckpoint()
  const snapshot = JSON.stringify(checkpoint)
  classifyConsumptionBoundary(checkpoint)
  assert.equal(JSON.stringify(checkpoint), snapshot)
})

// ── Consumption object shape validation ───────────────────────────────────────

test('FATE #1004: CONSUMABLE_EVIDENCE object has correct artifact and shape', () => {
  const checkpoint = makeFinalizedCheckpoint()
  const result = classifyConsumptionBoundary(checkpoint)

  assert.equal(result.artifact, 'RELEASE_PROVENANCE_CONSUMPTION_BOUNDARY')
  assert.equal(result.evidence_only, true)
  assert.equal(result.creates_authority, false)
  assert.equal(result.creates_execution, false)
  assert.equal(result.creates_proof, false)
  assert.equal(typeof result.release_id, 'string')
  assert.equal(typeof result.checkpoint_hash, 'string')
  assert.ok(
    [CONSUMPTION_RESULTS.CONSUMABLE_EVIDENCE, CONSUMPTION_RESULTS.REJECTED, CONSUMPTION_RESULTS.NULL].includes(
      result.consumption_result,
    ),
  )
  assert.ok(Array.isArray(result.consumption_classes))
  assert.equal(result.consumption_hash_alg, 'sha256')
  assert.equal(typeof result.consumption_hash, 'string')
  assert.equal(result.consumption_hash.length, 64)
})

test('FATE #1004: NULL consumption object from absent checkpoint has correct shape', () => {
  const result = classifyConsumptionBoundary(null)

  assert.equal(result.artifact, 'RELEASE_PROVENANCE_CONSUMPTION_BOUNDARY')
  assert.equal(result.evidence_only, true)
  assert.equal(result.creates_authority, false)
  assert.equal(result.creates_execution, false)
  assert.equal(result.creates_proof, false)
  assert.equal(result.release_id, null)
  assert.equal(result.checkpoint_hash, null)
  assert.equal(result.consumption_result, CONSUMPTION_RESULTS.NULL)
  assert.ok(Array.isArray(result.consumption_classes))
  assert.equal(result.consumption_hash_alg, 'sha256')
  assert.equal(typeof result.consumption_hash, 'string')
  assert.equal(result.consumption_hash.length, 64)
})

// ── Non-regression: prior provenance scripts remain intact ───────────────────

test('FATE #1004 non-regression: release-provenance-finality-checkpoints.mjs is present', async () => {
  const mod = await import('../../scripts/release-provenance-finality-checkpoints.mjs')
  assert.ok(typeof mod.classifyFinalityCheckpoint === 'function')
  assert.ok(typeof mod.FINALITY_RESULTS === 'object')
  assert.ok(typeof mod.FINALITY_CLASSES === 'object')
})

test('FATE #1004 non-regression: release-provenance-causal-ordering.mjs is present', async () => {
  const mod = await import('../../scripts/release-provenance-causal-ordering.mjs')
  assert.ok(typeof mod.classifyCausalOrdering === 'function')
  assert.ok(typeof mod.CAUSAL_RESULTS === 'object')
})

test('FATE #1004 non-regression: issue-1002 FATE test file is present', () => {
  assert.ok(
    existsSync(join(root, 'tests/fate/issue-1002-release-provenance-finality-checkpoints.test.mjs')),
    '#1002 FATE test file must remain present',
  )
})

test('FATE #1004 non-regression: issue-1000 FATE test file is present', () => {
  assert.ok(
    existsSync(join(root, 'tests/fate/issue-1000-release-provenance-causal-ordering.test.mjs')),
    '#1000 FATE test file must remain present',
  )
})

test('FATE #1004 non-regression: issue-994 FATE test file is present', () => {
  assert.ok(
    existsSync(join(root, 'tests/fate/issue-994-release-provenance-enforcement.test.mjs')),
    '#994 FATE test file must remain present',
  )
})
