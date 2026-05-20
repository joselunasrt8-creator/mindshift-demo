import test from 'node:test';
import assert from 'node:assert/strict';

import classification from '../../governance/CAPABILITY_RISK_CLASSIFICATION_V1.json' with { type: 'json' };
import registry from '../../governance/SKILL_SURFACES_REGISTRY_V1.json' with { type: 'json' };
import revocationSchema from '../../schemas/skill_provenance_revocation_v1.json' with { type: 'json' };

import { validateSkillMetadata, hashSkillMetadataProvenancePayload } from '../../src/skill-metadata/validator.mjs';
import { validateSkillSurfaceEntry } from '../../src/skill-surfaces/registry-validator.mjs';
import { validateSkillProvenanceRevocationLineage } from '../../src/lib/skill-provenance-revocation.js';

const binding = {
  skill_id: 'production.deploy.workflow',
  skill_version: '2.4.1',
  canonical_payload_hash: 'sha256:' + '1'.repeat(64),
  provenance_envelope_hash: 'sha256:' + '2'.repeat(64)
};

function lineage(status) {
  return {
    schema_version: 'SKILL_PROVENANCE_REVOCATION_V1',
    ...binding,
    status,
    reason: 'bounded fate fixture',
    effective_at: '2026-05-20T00:00:00.000Z'
  };
}

function makeSignedSkill() {
  const base = {
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
      digest: 'sha256:' + 'a'.repeat(64),
      signature_required: true
    },
    replay_semantics: {
      replay_domain: 'production_deploy',
      max_executions: 1
    }
  };

  const payloadHash = hashSkillMetadataProvenancePayload(base);
  return {
    ...base,
    provenance: {
      ...base.provenance,
      dsse_envelope: {
        schema_version: 'DSSE_SKILL_PROVENANCE_SCHEMA_V1',
        payload_type: 'SKILL_METADATA_SCHEMA_V1',
        payload_hash: `sha256:${payloadHash}`,
        signatures: [{ keyid: 'root-prod', sig: 'abc_DEF-123' }]
      }
    }
  };
}

test('revoked provenance invalidates future eligibility', () => {
  assert.equal(validateSkillProvenanceRevocationLineage(binding, lineage('REVOKED')), 'REVOKED');
});

test('quarantined provenance does not execute remediation', () => {
  assert.equal(validateSkillProvenanceRevocationLineage(binding, lineage('QUARANTINED')), 'QUARANTINED');
  const quarantineProps = revocationSchema.properties.quarantined_surfaces.items.properties;
  assert.equal(quarantineProps.automatic_remediation.const, false);
  assert.equal(quarantineProps.execution_permission.const, false);
});

test('dependent skill surfaces can be marked stale/quarantined without authority creation', () => {
  const dependentSurface = {
    skill_id: 'production.deploy.workflow',
    surface_type: 'other',
    risk_class: null,
    mutation_capable: false,
    allowed_targets: ['quarantined_dependency_stale'],
    required_validator_layers: [],
    proof_requirements: [],
    replay_domain: 'dependency_quarantine_stale'
  };

  const result = validateSkillSurfaceEntry(dependentSurface);
  assert.equal(result.status, 'VALID');
  assert.equal(result.valid, true);
  assert.equal(registry.registry_semantics.authority_creation, false);
  assert.equal(registry.registry_semantics.execution_path_creation, false);
});

test('unknown revocation lineage returns NULL', () => {
  assert.equal(validateSkillProvenanceRevocationLineage(binding, { ...lineage('ACTIVE'), status: 'UNKNOWN' }), null);
});

test('malformed dependency propagation returns NULL', () => {
  const malformed = {
    ...binding,
    canonical_payload_hash: 'sha256:not-a-valid-hash'
  };
  assert.equal(validateSkillProvenanceRevocationLineage(malformed, lineage('ACTIVE')), null);
});

test('signed provenance still does not create authority', () => {
  const signed = makeSignedSkill();
  const result = validateSkillMetadata(signed);
  assert.equal(result.status, 'VALID');
  assert.equal(result.valid, true);
  assert.equal(signed.required_authority.includes('deploy_production'), true);
  assert.equal(classification.classifications.P3.creates_authority, false);
  assert.equal(classification.classifications.P3.grants_execution_permission, false);
});

test('registry visibility does not create permission', () => {
  assert.equal(registry.registry_semantics.observability_only, true);
  assert.equal(registry.registry_semantics.grants_execution_permission, false);
  assert.equal(registry.registry_semantics.runtime_route_expansion, false);
  assert.equal(registry.registry_semantics.validator_bypass, false);
  assert.equal(registry.registry_semantics.fail_closed, true);
});
