import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const runtimeDir = join(process.cwd(), 'governance', 'runtime');
const readJson = (name) => JSON.parse(readFileSync(join(runtimeDir, name), 'utf8'));

const preo = readJson('PREO_REQUIREMENTS.json');
const sco = readJson('SCO_REQUIREMENTS.json');
const deployAudit = readJson('DEPLOY_BYPASS_AUDIT.json');
const branchPolicy = readJson('BRANCH_PROTECTION_POLICY.json');
const mergeRules = readJson('MERGE_GOVERNANCE_RULES.json');

test('PREO enforcement declares canonical review legitimacy boundary', () => {
  for (const field of [
    'pr_number',
    'repo',
    'head_sha',
    'base_sha',
    'reviewers',
    'review_state',
    'review_hash',
    'required_checks',
    'evidence_hash',
    'issued_at',
    'expires_at',
  ]) {
    assert.ok(preo.required_fields.includes(field), `PREO missing required field: ${field}`);
  }

  assert.equal(preo.target_invariant, 'mergeable == validated_PREO');

  for (const validation of [
    'PR SHA immutable',
    'required reviewers present',
    'review not stale',
    'checks passed',
    'PREO hash valid',
    'PREO unused',
    'branch protected',
  ]) {
    assert.ok(preo.validation_requirements.includes(validation), `PREO missing validation: ${validation}`);
  }
});

test('SCO enforcement declares non-null classification for governed mutations', () => {
  for (const field of [
    'mutation_type',
    'surface',
    'risk_class',
    'changed_files',
    'required_review_tier',
    'policy_impact',
    'runtime_impact',
    'proof_requirement',
    'rollback_requirement',
  ]) {
    assert.ok(sco.required_fields.includes(field), `SCO missing required field: ${field}`);
  }

  assert.equal(sco.target_invariant, 'unclassified mutation == NULL');
  assert.equal(sco.mutation_classes.P3, 'execution boundary mutation');
  assert.ok(sco.rules.includes('execution boundary mutation requires P3 highest governance threshold'));
});

test('deploy bypass audit proves all canonical deploy-capable surfaces are governed', () => {
  const requiredSurfaces = [
    'GitHub Actions',
    'Wrangler',
    'npm scripts',
    'curl',
    'Cloudflare APIs',
    'branch push deploys',
    'manual maintainer deploys',
    'worker publish flows',
  ];

  for (const surface of requiredSurfaces) {
    const record = deployAudit.surfaces.find((entry) => entry.surface === surface);
    assert.ok(record, `missing deploy audit surface: ${surface}`);
    assert.equal(record.proof_required, true, `${surface} must require proof`);
    assert.equal(record.governed, true, `${surface} must be governed`);
    assert.equal(record.bypassable, false, `${surface} must not be bypassable`);
  }

  assert.equal(deployAudit.target_invariant, 'single canonical deploy boundary');
});

test('branch protection and governed merge closure declare non-bypassable merge proof controls', () => {
  for (const check of [
    'FATE',
    'PREO validation',
    'SCO validation',
    'governed merge validation',
    'deploy proof validation',
  ]) {
    assert.ok(branchPolicy.required_controls.required_status_checks.includes(check), `missing required check: ${check}`);
  }

  assert.equal(branchPolicy.required_controls.restrict_admin_bypass, true);
  assert.equal(branchPolicy.required_controls.require_linear_history, true);
  assert.equal(branchPolicy.admin_bypass_policy.allow_admin_bypass, false);

  for (const field of ['merge_sha', 'head_sha', 'preo_hash', 'sco_hash', 'validator_hash', 'merged_by', 'merged_at']) {
    assert.ok(mergeRules.required_proof_fields.includes(field), `merge proof missing field: ${field}`);
  }

  assert.equal(mergeRules.target_invariant, 'merged_object == reviewed_object');
  assert.ok(mergeRules.rules.includes('governed merge authority required before deploy eligibility'));
});
