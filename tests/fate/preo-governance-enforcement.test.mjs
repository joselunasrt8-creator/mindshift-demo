import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  assertMergeEligibility,
  createPreo,
  sha256Canonical,
  validatePreo,
} from '../../governance/preo/preo-validator.ts';

const HEAD_SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const BASE_SHA = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const NOW = '2026-05-12T00:00:00.000Z';
const FUTURE = '2026-05-12T01:00:00.000Z';
const PAST = '2026-05-11T23:00:00.000Z';

function validPreo(overrides = {}) {
  return createPreo({
    preo_id: `PREO-1-${HEAD_SHA}`,
    repo: 'mindshift/demo',
    pr_number: 1,
    head_sha: HEAD_SHA,
    base_sha: BASE_SHA,
    reviewers: ['reviewer-a'],
    review_state: 'APPROVED_CURRENT_HEAD',
    required_checks: ['FATE', 'SCO validation'],
    changed_files: ['governance/preo/preo-validator.ts'],
    workflow_results: [
      { name: 'FATE', status: 'completed', conclusion: 'success' },
      { name: 'SCO validation', status: 'completed', conclusion: 'success' },
    ],
    evidence_hash: 'sha256:placeholder',
    issued_at: NOW,
    expires_at: FUTURE,
    ...overrides,
  });
}

function validate(preo, options = {}) {
  return validatePreo(preo, {
    now: NOW,
    expected_head_sha: HEAD_SHA,
    branch_protected: true,
    ...options,
  });
}

test('missing review approval returns PREO_INVALID / NULL merge eligibility', () => {
  const preo = validPreo({ reviewers: [], review_state: 'MISSING_REVIEW' });
  const result = validate(preo);

  assert.equal(result.status, 'PREO_INVALID');
  assert.equal(result.merge_eligible, false);
  assert.ok(result.errors.some((error) => error.includes('review present required')));
});

test('failed required check returns PREO_INVALID / NULL merge eligibility', () => {
  const preo = validPreo({
    workflow_results: [
      { name: 'FATE', status: 'completed', conclusion: 'failure' },
      { name: 'SCO validation', status: 'completed', conclusion: 'success' },
    ],
  });
  const result = validate(preo);

  assert.equal(result.status, 'PREO_INVALID');
  assert.equal(result.merge_eligible, false);
  assert.ok(result.errors.some((error) => error.includes('required check not passing: FATE')));
});

test('mutated head SHA returns PREO_INVALID and blocks stale reviewed object reuse', () => {
  const preo = validPreo();
  const result = validate(preo, {
    expected_head_sha: 'cccccccccccccccccccccccccccccccccccccccc',
    merged_head_sha: 'cccccccccccccccccccccccccccccccccccccccc',
  });

  assert.equal(result.status, 'PREO_INVALID');
  assert.equal(result.merge_eligible, false);
  assert.ok(result.errors.some((error) => error.includes('head SHA immutable violation')));
  assert.ok(result.errors.some((error) => error.includes('validated_preo.head_sha must equal merged_head_sha')));
});

test('stale PREO returns PREO_INVALID', () => {
  const preo = validPreo({ issued_at: '2026-05-11T21:00:00.000Z', expires_at: PAST });
  const result = validate(preo);

  assert.equal(result.status, 'PREO_INVALID');
  assert.equal(result.merge_eligible, false);
  assert.ok(result.errors.includes('PREO expired'));
});

test('PREO hash is deterministic under canonical serialization', () => {
  const preo = validPreo({
    reviewers: ['reviewer-b', 'reviewer-a', 'reviewer-a'],
    required_checks: ['SCO validation', 'FATE'],
    changed_files: ['z.ts', 'a.ts'],
  });

  const reorderedPreo = createPreo({
    expires_at: preo.expires_at,
    issued_at: preo.issued_at,
    evidence_hash: 'sha256:placeholder',
    workflow_results: [...preo.workflow_results].reverse(),
    changed_files: [...preo.changed_files].reverse(),
    required_checks: [...preo.required_checks].reverse(),
    review_state: preo.review_state,
    reviewers: [...preo.reviewers].reverse(),
    base_sha: preo.base_sha,
    head_sha: preo.head_sha,
    pr_number: preo.pr_number,
    repo: preo.repo,
    preo_id: preo.preo_id,
  });

  assert.equal(sha256Canonical(preo), sha256Canonical(reorderedPreo));
});

test('valid PREO returns PREO_VALID and merge eligibility', () => {
  const result = validate(validPreo(), { merged_head_sha: HEAD_SHA });

  assert.equal(result.status, 'PREO_VALID');
  assert.equal(result.merge_eligible, true);
  assert.deepEqual(result.errors, []);
});

test('merge eligibility requires PREO_VALID branch protection target', () => {
  const branchPolicy = JSON.parse(
    readFileSync(join(process.cwd(), 'governance', 'runtime', 'BRANCH_PROTECTION_POLICY.json'), 'utf8'),
  );

  assert.equal(assertMergeEligibility(validate(validPreo())), 'PREO_VALID');
  assert.equal(assertMergeEligibility(validate(validPreo({ reviewers: [], review_state: 'MISSING_REVIEW' }))), 'PREO_INVALID');
  assert.ok(branchPolicy.required_controls.required_status_checks.includes('PREO_VALID'));
});

test('no PREO artifact means no merge eligibility', () => {
  const result = validatePreo(null, { now: NOW, expected_head_sha: HEAD_SHA, branch_protected: true });

  assert.equal(result.status, 'PREO_INVALID');
  assert.equal(assertMergeEligibility(result), 'PREO_INVALID');
});

test('PREO_VALID workflow declares canonical PR trigger and registry artifact persistence', () => {
  const workflow = readFileSync(join(process.cwd(), '.github', 'workflows', 'preo-validation.yml'), 'utf8');

  for (const requiredSignal of [
    'name: PREO_VALID',
    'pull_request:',
    '- opened',
    '- synchronize',
    '- reopened',
    '- ready_for_review',
    'review-evidence.json',
    'workflow-evidence.json',
    'PREO_VALIDATION_RESULT.json',
    'PREO_INVALID — merge blocked',
  ]) {
    assert.ok(workflow.includes(requiredSignal), `PREO_VALID workflow missing signal: ${requiredSignal}`);
  }
});
