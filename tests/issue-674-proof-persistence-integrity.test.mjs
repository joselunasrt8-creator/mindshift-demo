import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')

test('proof persistence uses atomic insert-or-ignore CAS semantics', () => {
  assert.match(source, /INSERT OR IGNORE INTO proof_registry/)
  assert.match(source, /if \(proofInserted === 0\) return rejectWithTelemetry\(env, \{ status:"NULL", result:"INVALID", reason:"proof_replay" \}/)
})

test('duplicate or concurrent proof persistence cannot consume authority', () => {
  assert.match(source, /UPDATE authority_registry SET status='CONSUMED'[\s\S]*EXISTS \(SELECT 1 FROM proof_registry p JOIN execution_registry e ON e\.execution_id=p\.execution_id WHERE p\.proof_id=\?3 AND p\.decision_id=\?1 AND p\.validated_object_hash=\?4 AND e\.invocation_nonce=\?6\)/)
  assert.match(source, /if \(proofInserted !== 1 \|\| authorityConsumed !== 1\) return rejectWithTelemetry\(env, \{ status:"NULL", result:"INVALID", reason:"authority_consumption_failed" \}/)
})

test('proof boundary keeps batch result available for post-batch guards', () => {
  assert.match(source, /let proofBoundary: any\[] = \[]/)
  assert.match(source, /proofBoundary = await env\.DB\.batch<any>\(proofStatements\)[\s\S]*const outboxQueued = proofBoundary\[2\]\?\.meta\?\.changes \|\| 0/)
})

test('executed object hash must exactly match validated object hash before proof insertion', () => {
  assert.match(source, /String\(execution\.validated_object_hash \|\| ""\) !== validated_object_hash \|\| String\(validation\?\.validated_object_hash \|\| ""\) !== validated_object_hash/)
  assert.match(source, /indicator: "validated_object_execution_mismatch"/)
})

test('proof insertion and outbox guards preserve invocation nonce binding without proof schema expansion', () => {
  assert.match(source, /EXISTS \(SELECT 1 FROM execution_registry WHERE execution_id=\?3 AND decision_id=\?4 AND validated_object_hash=\?5 AND invocation_nonce=\?25/)
  assert.match(source, /EXISTS \(SELECT 1 FROM validation_registry WHERE decision_id=\?4 AND validated_object_hash=\?5 AND invocation_nonce=\?25/)
  assert.match(source, /proof_propagation_outbox[\s\S]*JOIN execution_registry e ON e\.execution_id=p\.execution_id[\s\S]*e\.invocation_nonce=\?8/)
  assert.doesNotMatch(source, /CREATE TABLE IF NOT EXISTS proof_registry \([^`]*invocation_nonce TEXT/)
})

test('proof path remains fail-closed without alternate fallback execution', () => {
  assert.doesNotMatch(source, /retry/i)
  assert.match(source, /return json\(\{ status:"NULL", result:"INVALID", reason:"proof_replay"/)
})
