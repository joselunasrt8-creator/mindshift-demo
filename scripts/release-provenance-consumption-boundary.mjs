/**
 * scripts/release-provenance-consumption-boundary.mjs
 * Issue #1004 — RELEASE_PROVENANCE_CONSUMPTION_BOUNDARY_V1
 *
 * Evidence only — constrains how downstream systems may consume
 * FINALIZED release provenance finality checkpoints.
 * Does not create authority, proof, execution, or deployment capability.
 * Does not mutate files. Does not create releases. Does not push tags.
 * Does not trigger deployment. Does not generate proof. Does not create authority.
 * Does not normalize BREAK_GLASS.
 *
 * Finality settles evidence.
 * Consumption constrains how settled evidence may be used.
 *
 * Exports pure functions for consumption boundary classification.
 * CLI: node scripts/release-provenance-consumption-boundary.mjs <finality_checkpoint.json> [--requireExternalPolicy] [--requireHumanApproval] [--requireDeploymentAuthority]
 */

import { createHash } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

export const CONSUMPTION_RESULTS = {
  CONSUMABLE_EVIDENCE: 'CONSUMABLE_EVIDENCE',
  REJECTED: 'REJECTED',
  NULL: 'NULL',
}

export const CONSUMPTION_CLASSES = {
  CONSUMPTION_CHECKPOINT_ACCEPTED: 'consumption_checkpoint_accepted',
  CONSUMPTION_CHECKPOINT_NOT_FINAL: 'consumption_checkpoint_not_final',
  CONSUMPTION_CHECKPOINT_NULL: 'consumption_checkpoint_null',
  CONSUMPTION_BOUNDARY_VIOLATION: 'consumption_boundary_violation',
  CONSUMPTION_AUTHORITY_ATTEMPT: 'consumption_authority_attempt',
  CONSUMPTION_PROOF_ATTEMPT: 'consumption_proof_attempt',
  CONSUMPTION_EXECUTION_ATTEMPT: 'consumption_execution_attempt',
  CONSUMPTION_DEPLOYMENT_ATTEMPT: 'consumption_deployment_attempt',
  CONSUMPTION_HASH_INVALID: 'consumption_hash_invalid',
  CONSUMPTION_BREAK_GLASS_NORMALIZATION: 'consumption_break_glass_normalization',
}

// Finality result values consumed from finality checkpoint evidence.
// Defined locally — consumption boundary does not call the finality script.
const FINALITY_RESULTS = {
  FINALIZED: 'FINALIZED',
  NOT_FINAL: 'NOT_FINAL',
  NULL: 'NULL',
}

// Finality class value that signals BREAK_GLASS normalization in a checkpoint.
const FINALITY_BREAK_GLASS_CLASS = 'finality_break_glass_normalization'

// Fields that, if present in a finality checkpoint, indicate authority creation.
const AUTHORITY_FIELDS = ['authority_grant', 'authorization']

// Fields that, if present in a finality checkpoint, indicate proof creation.
const PROOF_FIELDS = ['proof_id', 'proof_binding_hash', 'proof_signature']

// Fields that, if present in a finality checkpoint, indicate execution authorization.
const EXECUTION_FIELDS = ['execution_id', 'execution_token', 'execution_permit']

// Fields that, if present in a finality checkpoint, indicate deployment authorization.
const DEPLOYMENT_FIELDS = [
  'deployment_trigger',
  'deployment_token',
  'deployment_authorization',
  'release_authorization',
]

// Fields that, if present in a finality checkpoint, indicate lineage mutation.
const LINEAGE_FIELDS = ['lineage_repair', 'registry_mutation']

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
 * Computes a deterministic SHA-256 consumption hash over canonical fields.
 *
 * Hash covers: release_id, checkpoint_hash, consumption_result, sorted consumption_classes.
 *
 * Same consumption state always produces the same hash.
 * consumption_hash itself is excluded (avoids circularity).
 *
 * @param {object} consumptionState
 * @returns {string} hex SHA-256 digest
 */
export function computeConsumptionHash(consumptionState) {
  const payload = {
    checkpoint_hash: consumptionState.checkpoint_hash ?? null,
    consumption_classes: [...(consumptionState.consumption_classes ?? [])].sort(),
    consumption_result: consumptionState.consumption_result ?? CONSUMPTION_RESULTS.NULL,
    release_id: consumptionState.release_id ?? null,
  }
  return createHash('sha256').update(canonicalJson(payload), 'utf8').digest('hex')
}

/**
 * Returns true when hash is a well-formed 64-character lowercase hex SHA-256 string.
 *
 * @param {*} hash
 * @returns {boolean}
 */
export function isValidCheckpointHash(hash) {
  return typeof hash === 'string' && /^[0-9a-f]{64}$/.test(hash)
}

/**
 * Validates the evidence boundary invariants of a finality checkpoint object
 * for the purpose of consumption boundary classification.
 *
 * Checkpoint must preserve:
 *   - evidence_only: true
 *   - creates_authority: false
 *   - creates_execution: false
 *   - creates_proof must not be true
 *
 * Checkpoint must not contain fields implying authority creation, proof creation,
 * execution authorization, deployment triggers, registry mutation, or lineage repair.
 *
 * @param {object} checkpointObject
 * @returns {{ valid: boolean, violations: string[], consumption_classes: string[] }}
 */
export function validateCheckpointConsumptionBoundary(checkpointObject) {
  const violations = []
  const consumptionClasses = []

  if (checkpointObject.evidence_only !== true) {
    violations.push('evidence_only must be true')
    consumptionClasses.push(CONSUMPTION_CLASSES.CONSUMPTION_BOUNDARY_VIOLATION)
  }
  if (checkpointObject.creates_authority !== false) {
    violations.push('creates_authority must be false')
    consumptionClasses.push(CONSUMPTION_CLASSES.CONSUMPTION_AUTHORITY_ATTEMPT)
  }
  if (checkpointObject.creates_execution !== false) {
    violations.push('creates_execution must be false')
    consumptionClasses.push(CONSUMPTION_CLASSES.CONSUMPTION_EXECUTION_ATTEMPT)
  }
  if (checkpointObject.creates_proof === true) {
    violations.push('creates_proof must not be true')
    consumptionClasses.push(CONSUMPTION_CLASSES.CONSUMPTION_PROOF_ATTEMPT)
  }

  for (const field of AUTHORITY_FIELDS) {
    if (field in checkpointObject) {
      violations.push(`disallowed authority field present: ${field}`)
      consumptionClasses.push(CONSUMPTION_CLASSES.CONSUMPTION_AUTHORITY_ATTEMPT)
    }
  }
  for (const field of PROOF_FIELDS) {
    if (field in checkpointObject) {
      violations.push(`disallowed proof field present: ${field}`)
      consumptionClasses.push(CONSUMPTION_CLASSES.CONSUMPTION_PROOF_ATTEMPT)
    }
  }
  for (const field of EXECUTION_FIELDS) {
    if (field in checkpointObject) {
      violations.push(`disallowed execution field present: ${field}`)
      consumptionClasses.push(CONSUMPTION_CLASSES.CONSUMPTION_EXECUTION_ATTEMPT)
    }
  }
  for (const field of DEPLOYMENT_FIELDS) {
    if (field in checkpointObject) {
      violations.push(`disallowed deployment field present: ${field}`)
      consumptionClasses.push(CONSUMPTION_CLASSES.CONSUMPTION_DEPLOYMENT_ATTEMPT)
    }
  }
  for (const field of LINEAGE_FIELDS) {
    if (field in checkpointObject) {
      violations.push(`disallowed lineage field present: ${field}`)
      consumptionClasses.push(CONSUMPTION_CLASSES.CONSUMPTION_BOUNDARY_VIOLATION)
    }
  }

  return {
    valid: violations.length === 0,
    violations,
    consumption_classes: [...new Set(consumptionClasses)],
  }
}

/**
 * Builds a consumption evidence object.
 * Always sets evidence_only, creates_authority, creates_execution, creates_proof correctly.
 * Computes consumption_hash deterministically.
 *
 * @param {string|null} releaseId
 * @param {string|null} checkpointHash
 * @param {string} consumptionResult
 * @param {string[]} consumptionClasses
 * @returns {object} RELEASE_PROVENANCE_CONSUMPTION_BOUNDARY evidence object
 */
function buildConsumptionEvidence(releaseId, checkpointHash, consumptionResult, consumptionClasses) {
  const consumptionState = {
    release_id: releaseId,
    checkpoint_hash: checkpointHash,
    consumption_result: consumptionResult,
    consumption_classes: consumptionClasses,
  }
  return {
    artifact: 'RELEASE_PROVENANCE_CONSUMPTION_BOUNDARY',
    evidence_only: true,
    creates_authority: false,
    creates_execution: false,
    creates_proof: false,
    release_id: releaseId,
    checkpoint_hash: checkpointHash,
    consumption_result: consumptionResult,
    consumption_classes: consumptionClasses,
    consumption_hash_alg: 'sha256',
    consumption_hash: computeConsumptionHash(consumptionState),
  }
}

/**
 * Classifies whether a finality checkpoint may be consumed as evidence.
 *
 * Consumption results:
 *   CONSUMABLE_EVIDENCE — checkpoint is FINALIZED, evidence boundary is valid,
 *                         checkpoint_hash is well-formed, no authority/proof/execution/
 *                         deployment/lineage fields present, evidence_only semantics preserved,
 *                         no BREAK_GLASS normalization detected, no consumer mode restriction.
 *
 *   REJECTED            — checkpoint is NOT_FINAL, or a consumer mode flag requires
 *                         external authority not present in evidence. Never upgrades NULL.
 *                         Never upgrades evidence into authority.
 *
 *   NULL                — checkpoint is NULL, boundary violated, authority/proof/execution/
 *                         deployment attempt detected, checkpoint_hash missing or malformed,
 *                         BREAK_GLASS normalization detected, or evidence boundary invariants
 *                         violated. Fails closed. Cannot be bypassed by consumer mode flags.
 *
 * Consumer mode flags (requireExternalPolicy, requireHumanApproval, requireDeploymentAuthority)
 * may only further restrict consumption. They convert CONSUMABLE_EVIDENCE → REJECTED.
 * They never bypass NULL. They never bypass NOT_FINAL. They never upgrade evidence into authority.
 *
 * @param {object|null} finalityCheckpoint - output of classifyFinalityCheckpoint
 * @param {object} [options]
 * @param {boolean} [options.requireExternalPolicy]
 * @param {boolean} [options.requireHumanApproval]
 * @param {boolean} [options.requireDeploymentAuthority]
 * @returns {object} RELEASE_PROVENANCE_CONSUMPTION_BOUNDARY evidence object
 */
export function classifyConsumptionBoundary(finalityCheckpoint, options = {}) {
  const {
    requireExternalPolicy = false,
    requireHumanApproval = false,
    requireDeploymentAuthority = false,
  } = options

  // Absent checkpoint → NULL (fails closed)
  if (finalityCheckpoint === null || finalityCheckpoint === undefined) {
    return buildConsumptionEvidence(null, null, CONSUMPTION_RESULTS.NULL, [
      CONSUMPTION_CLASSES.CONSUMPTION_CHECKPOINT_NULL,
    ])
  }

  const releaseId = finalityCheckpoint.release_id ?? null
  const checkpointHash = finalityCheckpoint.checkpoint_hash ?? null
  const finalityResult = finalityCheckpoint.finality_result
  const finalityClasses = Array.isArray(finalityCheckpoint.finality_classes)
    ? finalityCheckpoint.finality_classes
    : []
  const hasBreakGlass = finalityClasses.includes(FINALITY_BREAK_GLASS_CLASS)

  // NULL finality → NULL consumption (fails closed)
  if (finalityResult === FINALITY_RESULTS.NULL || !finalityResult) {
    const classes = [CONSUMPTION_CLASSES.CONSUMPTION_CHECKPOINT_NULL]
    if (hasBreakGlass) classes.push(CONSUMPTION_CLASSES.CONSUMPTION_BREAK_GLASS_NORMALIZATION)
    return buildConsumptionEvidence(releaseId, checkpointHash, CONSUMPTION_RESULTS.NULL, classes)
  }

  // NOT_FINAL → REJECTED (never upgraded to consumable)
  if (finalityResult === FINALITY_RESULTS.NOT_FINAL) {
    return buildConsumptionEvidence(releaseId, checkpointHash, CONSUMPTION_RESULTS.REJECTED, [
      CONSUMPTION_CLASSES.CONSUMPTION_CHECKPOINT_NOT_FINAL,
    ])
  }

  // FINALIZED path — apply all boundary checks before accepting as CONSUMABLE_EVIDENCE.
  // Each check fails closed to NULL on violation.

  // BREAK_GLASS normalization in finality_classes → NULL (even if finality_result is FINALIZED)
  if (hasBreakGlass) {
    return buildConsumptionEvidence(releaseId, checkpointHash, CONSUMPTION_RESULTS.NULL, [
      CONSUMPTION_CLASSES.CONSUMPTION_BREAK_GLASS_NORMALIZATION,
    ])
  }

  // Validate evidence boundary invariants of the checkpoint being consumed
  const boundaryCheck = validateCheckpointConsumptionBoundary(finalityCheckpoint)
  if (!boundaryCheck.valid) {
    return buildConsumptionEvidence(
      releaseId,
      checkpointHash,
      CONSUMPTION_RESULTS.NULL,
      boundaryCheck.consumption_classes,
    )
  }

  // Validate checkpoint_hash format — must be 64-char lowercase hex SHA-256
  if (!isValidCheckpointHash(checkpointHash)) {
    return buildConsumptionEvidence(releaseId, checkpointHash, CONSUMPTION_RESULTS.NULL, [
      CONSUMPTION_CLASSES.CONSUMPTION_HASH_INVALID,
    ])
  }

  // All structural checks passed. Consumer mode flags may only downgrade, never upgrade.
  if (requireExternalPolicy || requireHumanApproval || requireDeploymentAuthority) {
    return buildConsumptionEvidence(releaseId, checkpointHash, CONSUMPTION_RESULTS.REJECTED, [
      CONSUMPTION_CLASSES.CONSUMPTION_CHECKPOINT_NOT_FINAL,
    ])
  }

  return buildConsumptionEvidence(releaseId, checkpointHash, CONSUMPTION_RESULTS.CONSUMABLE_EVIDENCE, [
    CONSUMPTION_CLASSES.CONSUMPTION_CHECKPOINT_ACCEPTED,
  ])
}

// ── CLI runner ──────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url)

if (resolve(process.argv[1] ?? '') === __filename) {
  const args = process.argv.slice(2)
  const requireExternalPolicy = args.includes('--requireExternalPolicy')
  const requireHumanApproval = args.includes('--requireHumanApproval')
  const requireDeploymentAuthority = args.includes('--requireDeploymentAuthority')
  const positional = args.filter((a) => !a.startsWith('--'))

  const [finalityCheckpointPath] = positional

  if (!finalityCheckpointPath) {
    console.error(
      'NULL — consumption_boundary_violation: usage: release-provenance-consumption-boundary.mjs <finality_checkpoint.json> [--requireExternalPolicy] [--requireHumanApproval] [--requireDeploymentAuthority]',
    )
    process.exit(1)
  }

  if (!existsSync(finalityCheckpointPath)) {
    console.error(
      `NULL — consumption_boundary_violation: finality checkpoint file not found: ${finalityCheckpointPath}`,
    )
    process.exit(1)
  }

  let finalityCheckpoint
  try {
    finalityCheckpoint = JSON.parse(readFileSync(finalityCheckpointPath, 'utf8'))
  } catch (e) {
    console.error(
      `NULL — consumption_boundary_violation: failed to parse finality checkpoint JSON: ${e.message}`,
    )
    process.exit(1)
  }

  const result = classifyConsumptionBoundary(finalityCheckpoint, {
    requireExternalPolicy,
    requireHumanApproval,
    requireDeploymentAuthority,
  })
  console.log(JSON.stringify(result, null, 2))

  if (result.consumption_result === CONSUMPTION_RESULTS.CONSUMABLE_EVIDENCE) {
    process.exit(0)
  } else if (result.consumption_result === CONSUMPTION_RESULTS.REJECTED) {
    process.exit(2)
  } else {
    process.exit(1)
  }
}
