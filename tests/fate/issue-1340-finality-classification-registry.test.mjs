import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  buildFinClassId,
  evidenceFlagsFromPredicates,
  classifyFromPredicates,
  creates_authority,
} from '../../src/lib/finality-classification.js'

const migrationSql = readFileSync('migrations/0048_finality_classification_registry.sql', 'utf8')

// ── Migration structural assertions ────────────────────────────────────────

test('migration defines finality_classification_registry table', () => {
  assert.match(migrationSql, /CREATE TABLE IF NOT EXISTS finality_classification_registry/)
})

test('classification column enforces allowed state vocabulary', () => {
  assert.match(
    migrationSql,
    /CHECK\(classification IN \('LOCAL_VALID','GLOBAL_VALID','AMBIGUOUS','STALE_VISIBLE','PARTITION_SUSPENDED','NULL'\)\)/,
  )
})

test('append-only enforcement triggers are present', () => {
  assert.match(migrationSql, /fcr_no_update/)
  assert.match(migrationSql, /fcr_no_delete/)
  assert.match(migrationSql, /UPDATE is forbidden/)
  assert.match(migrationSql, /DELETE is forbidden/)
})

test('NULL is terminal — no_upgrade_from_null trigger present', () => {
  assert.match(migrationSql, /fcr_no_upgrade_from_null/)
  assert.match(migrationSql, /NULL classification is terminal/)
})

test('GLOBAL_VALID requires evidence flags — trigger present', () => {
  assert.match(migrationSql, /fcr_global_valid_requires_evidence/)
  assert.match(migrationSql, /has_quorum_evidence/)
  assert.match(migrationSql, /has_global_consensus_evidence/)
  assert.match(migrationSql, /GLOBAL_VALID classification requires has_quorum_evidence=1/)
})

test('proof linkage trigger enforces referential integrity against proof_registry', () => {
  assert.match(migrationSql, /fcr_proof_must_exist/)
  assert.match(migrationSql, /proof_registry/)
  assert.match(migrationSql, /status = 'COMPLETED'/)
})

test('raw_production_apply_path is DENIED', () => {
  assert.match(migrationSql, /raw_production_apply_path.*DEFAULT 'DENIED'/)
  assert.match(migrationSql, /raw_production_apply_path = 'DENIED'/)
})

test('supersedes_classification_id referential integrity trigger present', () => {
  assert.match(migrationSql, /fcr_supersedes_must_exist/)
  assert.match(migrationSql, /supersedes_classification_id references non-existent/)
})

test('epoch_id column is nullable forward-placeholder (no NOT NULL constraint)', () => {
  assert.match(migrationSql, /epoch_id\s+TEXT/)
  assert.doesNotMatch(migrationSql, /epoch_id\s+TEXT\s+NOT NULL/)
})

test('object_type CHECK covers all canonical object types', () => {
  assert.match(
    migrationSql,
    /object_type IN \('authority','aeo','execution','proof','session','continuity','validation'\)/,
  )
})

// ── TypeScript module — evidence-only discipline ────────────────────────────

test('finality-classification module is evidence-only (creates_authority: false)', () => {
  assert.equal(creates_authority, false)
})

// ── buildFinClassId ─────────────────────────────────────────────────────────

test('buildFinClassId returns deterministic fcr_-prefixed id', () => {
  const id1 = buildFinClassId('hash-abc', 'LOCAL_VALID', '2026-01-01T00:00:00Z')
  const id2 = buildFinClassId('hash-abc', 'LOCAL_VALID', '2026-01-01T00:00:00Z')
  assert.equal(id1, id2)
  assert.match(id1, /^fcr_[0-9a-f]{64}$/)
})

test('buildFinClassId produces distinct ids for different classifications', () => {
  const idLocal = buildFinClassId('hash-abc', 'LOCAL_VALID', '2026-01-01T00:00:00Z')
  const idGlobal = buildFinClassId('hash-abc', 'GLOBAL_VALID', '2026-01-01T00:00:00Z')
  assert.notEqual(idLocal, idGlobal)
})

// ── evidenceFlagsFromPredicates ─────────────────────────────────────────────

test('evidenceFlagsFromPredicates returns all 1 when Q/G/L/X are true', () => {
  const flags = evidenceFlagsFromPredicates({
    V: true, A: true, U: true, P: true, R: true, T: true, C: true,
    Q: true, G: true, L: true, X: true,
  })
  assert.equal(flags.has_quorum_evidence, 1)
  assert.equal(flags.has_global_consensus_evidence, 1)
  assert.equal(flags.has_lineage_freshness_evidence, 1)
  assert.equal(flags.has_cryptographic_integrity_evidence, 1)
})

test('evidenceFlagsFromPredicates returns 0 for absent distributed predicates', () => {
  const flags = evidenceFlagsFromPredicates({
    V: true, A: true, U: true, P: true, R: true, T: true, C: true,
    Q: false, G: false, L: false, X: false,
  })
  assert.equal(flags.has_quorum_evidence, 0)
  assert.equal(flags.has_global_consensus_evidence, 0)
  assert.equal(flags.has_lineage_freshness_evidence, 0)
  assert.equal(flags.has_cryptographic_integrity_evidence, 0)
})

// ── classifyFromPredicates — state machine ──────────────────────────────────

test('classifyFromPredicates: PARTITION_SUSPENDED when topology absent', () => {
  const result = classifyFromPredicates(
    { V: true, A: true, U: true, P: true, R: true, T: true, C: true, Q: false, G: false, L: true, X: false },
    false, // topologyPresent = false
  )
  assert.equal(result, 'PARTITION_SUSPENDED')
})

test('classifyFromPredicates: LOCAL_VALID when base predicates hold but Q/G/X absent', () => {
  const result = classifyFromPredicates(
    { V: true, A: true, U: true, P: true, R: true, T: true, C: true, Q: false, G: false, L: true, X: false },
    true,
  )
  assert.equal(result, 'LOCAL_VALID')
})

test('classifyFromPredicates: GLOBAL_VALID when all predicates satisfied', () => {
  const result = classifyFromPredicates(
    { V: true, A: true, U: true, P: true, R: true, T: true, C: true, Q: true, G: true, L: true, X: true },
    true,
  )
  assert.equal(result, 'GLOBAL_VALID')
})

test('classifyFromPredicates: STALE_VISIBLE when base holds but L absent and Q/G/X absent', () => {
  const result = classifyFromPredicates(
    { V: true, A: true, U: true, P: true, R: true, T: true, C: true, Q: false, G: false, L: false, X: false },
    true,
  )
  assert.equal(result, 'STALE_VISIBLE')
})

test('classifyFromPredicates: NULL when base predicate fails', () => {
  const result = classifyFromPredicates(
    { V: false, A: true, U: true, P: true, R: true, T: true, C: true, Q: false, G: false, L: true, X: false },
    true,
  )
  assert.equal(result, 'NULL')
})

// ── Replay invariant documentation assertions ───────────────────────────────

test('migration does not contain any mechanism to reset nonce consumption', () => {
  // Classification supersession must not touch invocation_registry or reset nonces
  assert.doesNotMatch(migrationSql, /invocation_registry/)
  assert.doesNotMatch(migrationSql, /nonce/)
})

test('migration does not create any execution surface', () => {
  assert.doesNotMatch(migrationSql, /execution_registry\s*INSERT/)
  assert.doesNotMatch(migrationSql, /authority_registry\s*INSERT/)
})
