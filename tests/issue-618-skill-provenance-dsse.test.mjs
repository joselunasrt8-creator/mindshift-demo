import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canonicalizeSkillMetadata,
  canonicalizeSkillMetadataProvenancePayload,
  hashSkillMetadata,
  hashSkillMetadataProvenancePayload,
  validateSkillMetadata
} from '../src/skill-metadata/validator.mjs';

const signedSkillBase = {
  schema_version: 'SKILL_METADATA_SCHEMA_V1',
  skill_id: 'production.deploy.workflow',
  skill_version: '2.4.1',
  capabilities: ['deploy_production', 'mutate_runtime'],
  allowed_targets: ['github_actions', 'cloudflare_workers'],
  risk_class: 'P3',
  required_authority: ['deploy_production'],
  proof_requirements: ['dsse', 'execution_receipt'],
  provenance: {
    source: 'ngc',
    digest: 'sha256:' + 'b'.repeat(64),
    signature_required: true
  },
  replay_semantics: {
    replay_domain: 'production_deploy',
    max_executions: 1
  }
};

function withSignedEnvelope(skill) {
  const payloadHash = hashSkillMetadataProvenancePayload(skill);
  return {
    ...skill,
    provenance: {
      ...skill.provenance,
      dsse_envelope: {
        schema_version: 'DSSE_SKILL_PROVENANCE_SCHEMA_V1',
        payload_type: 'SKILL_METADATA_SCHEMA_V1',
        payload_hash: `sha256:${payloadHash}`,
        signatures: [{ keyid: 'root-prod', sig: 'abc_DEF-123' }]
      }
    }
  };
}

test('canonical payload serialization and hash remain deterministic for DSSE provenance', () => {
  const signed = withSignedEnvelope(signedSkillBase);
  const reordered = {
    replay_semantics: signed.replay_semantics,
    provenance: signed.provenance,
    proof_requirements: signed.proof_requirements,
    required_authority: signed.required_authority,
    risk_class: signed.risk_class,
    allowed_targets: signed.allowed_targets,
    capabilities: signed.capabilities,
    skill_version: signed.skill_version,
    skill_id: signed.skill_id,
    schema_version: signed.schema_version
  };

  assert.equal(canonicalizeSkillMetadataProvenancePayload(signed), canonicalizeSkillMetadataProvenancePayload(reordered));
  assert.equal(hashSkillMetadataProvenancePayload(signed), hashSkillMetadataProvenancePayload(reordered));
  assert.equal(canonicalizeSkillMetadata(signed), canonicalizeSkillMetadata(reordered));
  assert.equal(hashSkillMetadata(signed), hashSkillMetadata(reordered));
});

test('valid DSSE-bound provenance validates without creating authority or runtime route expansion', () => {
  const signed = withSignedEnvelope(signedSkillBase);
  const result = validateSkillMetadata(signed);

  assert.equal(result.status, 'VALID');
  assert.equal(result.valid, true);
  assert.equal(signed.provenance.signature_required, true);
  assert.equal(signed.required_authority.includes('deploy_production'), true);
  assert.equal(signed.allowed_targets.includes('direct_terminal'), false);
});

test('invalid signature envelope fails closed to NULL', () => {
  const signed = withSignedEnvelope(signedSkillBase);
  signed.provenance.dsse_envelope.signatures[0].sig = 'not base64url +';

  const result = validateSkillMetadata(signed);
  assert.equal(result.status, 'NULL');
  assert.equal(result.valid, false);
});

test('payload mutation after signing fails closed to NULL', () => {
  const signed = withSignedEnvelope(signedSkillBase);
  signed.capabilities = [...signed.capabilities, 'deploy_shadow'];

  const result = validateSkillMetadata(signed);
  assert.equal(result.status, 'NULL');
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((entry) => entry.includes('canonical hash mismatch')));
});

test('canonical hash mismatch fails closed to NULL', () => {
  const signed = withSignedEnvelope(signedSkillBase);
  signed.provenance.dsse_envelope.payload_hash = 'sha256:' + 'c'.repeat(64);

  const result = validateSkillMetadata(signed);
  assert.equal(result.status, 'NULL');
  assert.equal(result.valid, false);
});
