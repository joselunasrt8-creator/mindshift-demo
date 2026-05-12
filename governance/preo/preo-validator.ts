import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const VALID_RESULT = 'PREO_VALID';
const INVALID_RESULT = 'PREO_INVALID';
const SUCCESSFUL_CHECK_CONCLUSIONS = new Set(['success', 'neutral', 'skipped']);
const REQUIRED_FIELDS = [
  'preo_id',
  'repo',
  'pr_number',
  'head_sha',
  'base_sha',
  'reviewers',
  'review_state',
  'required_checks',
  'changed_files',
  'workflow_results',
  'evidence_hash',
  'issued_at',
  'expires_at',
];

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function canonicalize(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(',')}]`;
  }

  if (isPlainObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
}

export function sha256Canonical(value) {
  return `sha256:${createHash('sha256').update(canonicalize(value)).digest('hex')}`;
}

export function normalizePreo(preo) {
  return {
    ...preo,
    reviewers: Array.isArray(preo?.reviewers) ? [...new Set(preo.reviewers)].sort() : preo?.reviewers,
    required_checks: Array.isArray(preo?.required_checks) ? [...new Set(preo.required_checks)].sort() : preo?.required_checks,
    changed_files: Array.isArray(preo?.changed_files) ? [...new Set(preo.changed_files)].sort() : preo?.changed_files,
    workflow_results: Array.isArray(preo?.workflow_results)
      ? [...preo.workflow_results].sort((left, right) => String(left?.name ?? '').localeCompare(String(right?.name ?? '')))
      : preo?.workflow_results,
  };
}

export function createEvidenceHash({ changed_files, reviewers, review_state, required_checks, workflow_results }) {
  return sha256Canonical(
    normalizePreo({
      changed_files,
      reviewers,
      review_state,
      required_checks,
      workflow_results,
    }),
  );
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function isSha(value) {
  return typeof value === 'string' && /^[a-fA-F0-9]{40}$/.test(value);
}

function parseTime(value) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function validatePreo(preo, options = {}) {
  const errors = [];
  const now = options.now ? parseTime(options.now) : Date.now();
  const normalizedPreo = normalizePreo(preo ?? {});

  if (!isPlainObject(preo)) {
    return {
      status: INVALID_RESULT,
      valid: false,
      merge_eligible: false,
      errors: ['preo must be an object'],
      preo_hash: sha256Canonical(null),
    };
  }

  for (const field of REQUIRED_FIELDS) {
    if (!Object.hasOwn(preo, field)) errors.push(`missing required field: ${field}`);
  }

  if (!isNonEmptyString(preo.preo_id)) errors.push('preo_id must be non-empty');
  if (!isNonEmptyString(preo.repo) || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(preo.repo)) errors.push('repo must be owner/name');
  if (!Number.isInteger(preo.pr_number) || preo.pr_number < 1) errors.push('pr_number must be a positive integer');
  if (!isSha(preo.head_sha)) errors.push('head_sha must be a 40 character SHA');
  if (!isSha(preo.base_sha)) errors.push('base_sha must be a 40 character SHA');

  if (!Array.isArray(preo.reviewers)) errors.push('reviewers must be an array');
  if (Array.isArray(preo.reviewers) && preo.reviewers.length === 0) errors.push('review present required');
  if (preo.review_state !== 'APPROVED_CURRENT_HEAD') errors.push('review_state must be APPROVED_CURRENT_HEAD');

  if (!Array.isArray(preo.required_checks)) errors.push('required_checks must be an array');
  if (!Array.isArray(preo.changed_files)) errors.push('changed_files must be an array');
  if (!Array.isArray(preo.workflow_results)) errors.push('workflow_results must be an array');

  const workflowResultsByName = new Map(
    Array.isArray(preo.workflow_results)
      ? preo.workflow_results.map((result) => [result?.name, result])
      : [],
  );

  if (Array.isArray(preo.required_checks)) {
    for (const checkName of preo.required_checks) {
      const result = workflowResultsByName.get(checkName);
      if (!result) {
        errors.push(`required check missing: ${checkName}`);
        continue;
      }
      if (result.status !== 'completed' || !SUCCESSFUL_CHECK_CONCLUSIONS.has(result.conclusion)) {
        errors.push(`required check not passing: ${checkName}`);
      }
    }
  }

  const expectedEvidenceHash = createEvidenceHash(normalizedPreo);
  if (preo.evidence_hash !== expectedEvidenceHash) {
    errors.push('evidence_hash mismatch');
  }

  if (options.expected_head_sha && preo.head_sha !== options.expected_head_sha) {
    errors.push('head SHA immutable violation');
  }

  if (options.merged_head_sha && preo.head_sha !== options.merged_head_sha) {
    errors.push('validated_preo.head_sha must equal merged_head_sha');
  }

  const issuedAt = parseTime(preo.issued_at);
  const expiresAt = parseTime(preo.expires_at);
  if (issuedAt === null) errors.push('issued_at must be a valid timestamp');
  if (expiresAt === null) errors.push('expires_at must be a valid timestamp');
  if (issuedAt !== null && expiresAt !== null && expiresAt <= issuedAt) errors.push('expires_at must be after issued_at');
  if (expiresAt !== null && now > expiresAt) errors.push('PREO expired');

  if (options.branch_protected !== true) {
    errors.push('branch protected required');
  }

  const preoHash = sha256Canonical(normalizedPreo);
  const valid = errors.length === 0;

  return {
    status: valid ? VALID_RESULT : INVALID_RESULT,
    valid,
    merge_eligible: valid,
    errors,
    preo_hash: preoHash,
  };
}

export function assertMergeEligibility(preoValidation) {
  return preoValidation?.status === VALID_RESULT && preoValidation?.merge_eligible === true
    ? VALID_RESULT
    : INVALID_RESULT;
}

export function createPreo(input) {
  const normalized = normalizePreo(input);
  return {
    ...normalized,
    evidence_hash: createEvidenceHash(normalized),
  };
}

if (process.argv[1] && (process.argv[1].endsWith('preo-validator.mjs') || process.argv[1].endsWith('preo-validator.ts'))) {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3] ?? 'PREO_VALIDATION_RESULT.json';
  const now = process.env.PREO_VALIDATION_NOW;
  const expectedHeadSha = process.env.EXPECTED_HEAD_SHA;
  const mergedHeadSha = process.env.MERGED_HEAD_SHA;
  const branchProtected = process.env.BRANCH_PROTECTED === 'true';

  const preo = JSON.parse(readFileSync(inputPath, 'utf8'));
  const validation = validatePreo(preo, {
    now,
    expected_head_sha: expectedHeadSha,
    merged_head_sha: mergedHeadSha,
    branch_protected: branchProtected,
  });

  writeFileSync(outputPath, `${JSON.stringify(validation, null, 2)}\n`);
  if (validation.status !== VALID_RESULT) process.exit(1);
}
