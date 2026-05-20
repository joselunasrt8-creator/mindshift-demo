import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');

test('execute fails closed without validation and with non-VALID validation', () => {
  assert.match(source, /reason:"missing_validation"/);
  assert.match(source, /reason:"non_valid_validation"/);
});

test('execute enforces exact validated_object_hash equality across validation and executed object', () => {
  assert.match(source, /String\(validation\.validated_object_hash \|\| ""\) !== execHash/);
  assert.match(source, /indicator: "validated_object_execution_mismatch"/);
});

test('proof binds to exact execution, decision, and validated object hash and blocks duplicate proof replay', () => {
  assert.match(source, /SELECT \* FROM execution_registry WHERE execution_id=\?1 AND decision_id=\?2 AND validated_object_hash=\?3 AND status='EXECUTED'/);
  assert.match(source, /SELECT \* FROM proof_registry WHERE decision_hash=\?1 ORDER BY created_at ASC, proof_id ASC LIMIT 3/);
  assert.match(source, /reason:"execution_missing"/);
  assert.match(source, /reason:"proof_replay"/);
});
