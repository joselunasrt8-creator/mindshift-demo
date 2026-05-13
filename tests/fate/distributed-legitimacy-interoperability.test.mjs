import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../../migrations/0018_distributed_legitimacy_interoperability.sql', import.meta.url), 'utf8')

function between(start, end) {
  const startIndex = source.indexOf(start)
  const endIndex = source.indexOf(end, startIndex)
  assert.notEqual(startIndex, -1, `missing start marker: ${start}`)
  assert.notEqual(endIndex, -1, `missing end marker: ${end}`)
  return source.slice(startIndex, endIndex)
}

const interoperabilitySource = between('type InteroperabilityDriftClassification', 'function canonicalIdentifiersForRegistry')
const routeSource = between('url.pathname === "/federation/interoperability/checkpoint"', 'if (NON_EXECUTABLE_OBSERVABILITY_ROUTES')

test('portable interoperability envelope types deny remote authority', () => {
  for (const typeName of ['DistributedLegitimacyEnvelope', 'FederatedCheckpointEnvelope', 'FederatedLineageEnvelope', 'PortableLegitimacyProjection']) {
    assert.match(interoperabilitySource, new RegExp(`type ${typeName}`), `${typeName} must exist`)
  }
  for (const field of ['canonical_hash', 'lineage_root', 'continuity_id', 'reconciliation_id', 'generated_at', 'replay_indicators', 'federation_classification']) {
    assert.match(interoperabilitySource, new RegExp(field), `interoperability structures must include ${field}`)
  }
  assert.match(interoperabilitySource, /evidence_only: true/)
  assert.match(interoperabilitySource, /remote_authority_denied: true/)
  assert.match(interoperabilitySource, /local_execution_authority: false/)
  assert.match(interoperabilitySource, /remote_execution_legitimacy: false/)
})

test('checkpoint hashing is deterministic and timestamp-independent', () => {
  assert.match(interoperabilitySource, /function deterministicInteroperabilityGeneratedAt/)
  assert.match(interoperabilitySource, /DETERMINISTIC_INTEROPERABILITY_CHECKPOINT/)
  assert.match(interoperabilitySource, /async function buildFederatedCheckpoint/)
  assert.match(source, /created_at is observational metadata and MUST NEVER participate in checkpoint identity hashing/)
  assert.doesNotMatch(interoperabilitySource, /new Date\(/, 'interoperability checkpoint helpers must not derive identity from mutable timestamps')
  assert.match(interoperabilitySource, /canonicalize\(core\)/, 'envelope canonical hashes must be built from canonical cores')
})

test('distributed reconciliation helpers fail closed and quarantine invalid lineage', () => {
  for (const fn of ['deriveDistributedLegitimacyProjection', 'buildFederatedCheckpoint', 'verifyDistributedLineageCompatibility', 'detectFederatedCheckpointDrift']) {
    assert.match(interoperabilitySource, new RegExp(`function ${fn}|function ${fn}|async function ${fn}`), `${fn} must exist`)
  }
  assert.match(interoperabilitySource, /return null/)
  assert.match(interoperabilitySource, /quarantined: true/)
  assert.match(interoperabilitySource, /remote_authority_claim/)
  assert.match(interoperabilitySource, /interoperability_replay_attempt/)
  assert.match(interoperabilitySource, /distributed_lineage_divergence/)
})

test('observability route is read-only and non-authoritative', () => {
  assert.match(source, /"\/federation\/interoperability\/checkpoint"/)
  assert.match(routeSource, /distributed_legitimacy_envelope/)
  assert.match(routeSource, /checkpoint_envelope/)
  assert.match(routeSource, /drift_indicators/)
  assert.match(routeSource, /replay_indicators/)
  assert.match(routeSource, /evidence_only: true/)
  assert.match(routeSource, /remote_authority_denied: true/)
  assert.match(routeSource, /read_only: true/)
  assert.match(routeSource, /mutation_capable: false/)
  assert.match(routeSource, /replay_neutral: true/)
  assert.doesNotMatch(routeSource, /INSERT\b|UPDATE\b|DELETE\b|\.run\(|env\.DB\.batch/i)
})

test('interoperability drift taxonomy is observable only', () => {
  for (const drift of ['distributed_lineage_divergence', 'checkpoint_hash_instability', 'federated_projection_corruption', 'remote_authority_claim', 'interoperability_replay_attempt']) {
    assert.match(source, new RegExp(`"${drift}"`), `${drift} must be in runtime taxonomy`)
    assert.match(interoperabilitySource, new RegExp(drift), `${drift} must be classified by interoperability helpers`)
  }
  assert.match(routeSource, /observability_only/)
  assert.match(routeSource, /remote_authority_inherited: false/)
})

test('interoperability registries are append-only evidence stores', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS distributed_legitimacy_registry/)
  assert.match(migration, /CREATE TABLE IF NOT EXISTS federated_checkpoint_registry/)
  assert.match(migration, /CHECK \(evidence_only='true'\)/)
  assert.match(migration, /CHECK \(remote_authority_denied='true'\)/)
  assert.match(migration, /CHECK \(mutation_capable='false'\)/)
  assert.match(migration, /BEFORE UPDATE ON distributed_legitimacy_registry/)
  assert.match(migration, /BEFORE DELETE ON distributed_legitimacy_registry/)
  assert.match(migration, /BEFORE UPDATE ON federated_checkpoint_registry/)
  assert.match(migration, /BEFORE DELETE ON federated_checkpoint_registry/)
})
