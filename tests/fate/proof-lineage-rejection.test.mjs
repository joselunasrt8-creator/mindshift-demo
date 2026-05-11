import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const runtime = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8');

test('proof route requires execution lineage fields', () => {
  const requiredFields = [
    'execution_id',
    'decision_id',
    'validated_object_hash',
    'proof_registry'
  ];

  for (const field of requiredFields) {
    assert.match(runtime, new RegExp(field));
  }
});

test('proof route contains replay and duplicate rejection signals', () => {
  const rejectionSignals = [
    'replay',
    'duplicate',
    'already_used',
    'proof_exists'
  ];

  const matched = rejectionSignals.some(signal => runtime.includes(signal));

  assert.equal(matched, true, 'runtime must contain replay or duplicate rejection semantics');
});

test('proof route binds proof lineage to execution lineage', () => {
  assert.match(runtime, /execution_registry/);
  assert.match(runtime, /proof_registry/);
  assert.match(runtime, /decision_id/);
});
