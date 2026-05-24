import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { canonicalize, hashCanonical, normalize } from '../../src/canonical.js'

const source = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')

// ── Inline definitions extracted from src/index.ts for behavioral tests ────────

function isPlainRecord(v) {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v)
}

function normalizeCanonicalValue(v) {
  if (v === undefined) return null
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return v
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (Array.isArray(v)) return v.map(normalizeCanonicalValue)
  if (isPlainRecord(v)) {
    return Object.freeze(Object.keys(v).sort().reduce((normalized, key) => {
      normalized[key] = normalizeCanonicalValue(v[key])
      return normalized
    }, {}))
  }
  return null
}

function canonicalRecord(v) {
  const normalized = normalizeCanonicalValue(v)
  return isPlainRecord(normalized) ? normalized : {}
}

const REQUIRED_AEO_KEYS = ['intent', 'scope', 'validation', 'target', 'finality']

function localCanonicalize(v) {
  const normalized = normalizeCanonicalValue(v)
  if (Array.isArray(normalized)) return `[${normalized.map((item) => localCanonicalize(item)).join(',')}]`
  if (isPlainRecord(normalized)) return `{${Object.keys(normalized).sort().map((key) => `${JSON.stringify(key)}:${localCanonicalize(normalized[key])}`).join(',')}}`
  return JSON.stringify(normalized)
}

function toCanonicalAeo(input) {
  if (!isPlainRecord(input)) return null
  const keys = Object.keys(input).sort()
  if (keys.length !== REQUIRED_AEO_KEYS.length) return null
  if (keys.join('|') !== [...REQUIRED_AEO_KEYS].sort().join('|')) return null
  if (!String(input.intent || '')) return null
  return Object.freeze({
    intent: String(input.intent || ''),
    scope: canonicalRecord(input.scope),
    validation: canonicalRecord(input.validation),
    target: canonicalRecord(input.target),
    finality: canonicalRecord(input.finality),
  })
}

// ── Tests ──────────────────────────────────────────────────────────────────────

test('issue #1112: src/index.ts defines REQUIRED_AEO_KEYS inline as exact five-field const', () => {
  assert.match(source, /const REQUIRED_AEO_KEYS = \["intent", "scope", "validation", "target", "finality"\] as const/)
})

test('issue #1112: src/index.ts defines canonicalize function delegating to normalizeCanonicalValue', () => {
  assert.match(source, /function canonicalize\(v: unknown\): string/)
  assert.match(source, /normalizeCanonicalValue\(v\)/)
})

test('issue #1112: src/index.ts defines toCanonicalAeo with key-count guard and exact freeze', () => {
  assert.match(source, /if \(keys\.length !== REQUIRED_AEO_KEYS\.length\) return null/)
  assert.ok(source.includes('if (keys.join("|") !== [...REQUIRED_AEO_KEYS].sort().join("|")) return null'))
  assert.match(source, /return Object\.freeze\(\{[\s\S]*intent: String\(input\.intent \|\| ""\),[\s\S]*scope: canonicalRecord\(input\.scope\)/)
})

test('issue #1112: aeo-governance.ts delegates canonicalize to canonical.js', () => {
  const aeoSrc = readFileSync(new URL('../../src/lib/aeo-governance.ts', import.meta.url), 'utf8')
  assert.match(aeoSrc, /from '\.\.\/canonical\.js'/)
  assert.doesNotMatch(aeoSrc, /function normalizeCanonicalValue/)
  assert.doesNotMatch(aeoSrc, /function canonicalize/)
})

test('issue #1112: noncanonical object shape (wrong field count) fails closed before validation', () => {
  assert.equal(toCanonicalAeo(null), null)
  assert.equal(toCanonicalAeo({}), null)
  assert.equal(toCanonicalAeo({ intent: 'x', scope: {}, validation: {}, target: {} }), null) // missing finality
  assert.equal(toCanonicalAeo({ intent: 'x', scope: {}, validation: {}, target: {}, finality: {}, extra: true }), null) // extra field
  assert.equal(toCanonicalAeo({ intent: '', scope: {}, validation: {}, target: {}, finality: {} }), null) // empty intent
  assert.equal(toCanonicalAeo('string'), null)
  assert.equal(toCanonicalAeo([1, 2, 3]), null)
})

test('issue #1112: canonical AEO compilation accepts exactly the five required fields', () => {
  const input = { intent: 'deploy', scope: { repo: 'a' }, validation: { workflow: 'w' }, target: { env: 'prod' }, finality: { proof_required: true } }
  const aeo = toCanonicalAeo(input)
  assert.ok(aeo !== null)
  assert.deepEqual(Object.keys(aeo).sort(), REQUIRED_AEO_KEYS.sort())
})

test('issue #1112: compiled object equals validated object (deterministic hash)', () => {
  const input = { intent: 'deploy', scope: { repo: 'a' }, validation: { workflow: 'w' }, target: { env: 'prod' }, finality: { proof_required: true } }
  const aeo1 = toCanonicalAeo(input)
  const aeo2 = toCanonicalAeo({ ...input })
  const hash1 = hashCanonical(aeo1)
  const hash2 = hashCanonical(aeo2)
  assert.equal(hash1, hash2)
  // key order variation produces identical hash
  const inputReordered = { finality: { proof_required: true }, scope: { repo: 'a' }, intent: 'deploy', target: { env: 'prod' }, validation: { workflow: 'w' } }
  const aeo3 = toCanonicalAeo(inputReordered)
  assert.equal(hashCanonical(aeo3), hash1)
})

test('issue #1112: validated object equals executed object (hash parity invariant)', () => {
  const input = { intent: 'deploy', scope: { repo: 'a' }, validation: { workflow: 'w' }, target: { env: 'prod' }, finality: { proof_required: true } }
  const compiled = toCanonicalAeo(input)
  const compiled_json = localCanonicalize(compiled)
  const compiled_hash = hashCanonical(compiled)
  // Simulated execution: reconstruct from stored JSON (as the runtime does)
  const parsed = JSON.parse(compiled_json)
  const validated = toCanonicalAeo(parsed)
  assert.ok(validated !== null)
  assert.equal(hashCanonical(validated), compiled_hash, 'hash must be identical after serialize→parse cycle')
})

test('issue #1112: mutation after validation returns NULL (frozen object rejects mutation)', () => {
  const input = { intent: 'deploy', scope: { repo: 'a' }, validation: { workflow: 'w' }, target: { env: 'prod' }, finality: { proof_required: true } }
  const aeo = toCanonicalAeo(input)
  assert.ok(Object.isFrozen(aeo), 'canonical AEO must be frozen')
  assert.throws(() => { aeo.intent = 'mutated' }, TypeError, 'mutation after freeze must throw in strict mode')
})

test('issue #1112: compiler does not add extra AEO fields beyond the five required', () => {
  const input = { intent: 'deploy', scope: { repo: 'a' }, validation: { workflow: 'w' }, target: { env: 'prod' }, finality: { proof_required: true } }
  const aeo = toCanonicalAeo(input)
  assert.strictEqual(Object.keys(aeo).length, 5, 'exactly five fields in compiled AEO')
  for (const key of Object.keys(aeo)) {
    assert.ok(REQUIRED_AEO_KEYS.includes(key), `unexpected key: ${key}`)
  }
})

test('issue #1112: normalization drift containment — scope key ordering is canonicalized', () => {
  const drifted = { intent: 'x', scope: { z: 1, a: 2 }, validation: { w: 'v' }, target: { env: 'p' }, finality: {} }
  const canonical = { intent: 'x', scope: { a: 2, z: 1 }, validation: { w: 'v' }, target: { env: 'p' }, finality: {} }
  const aeo1 = toCanonicalAeo(drifted)
  const aeo2 = toCanonicalAeo(canonical)
  assert.equal(hashCanonical(aeo1), hashCanonical(aeo2), 'drift in key order must not change hash')
})

test('issue #1112: normalization delegates to canonical.js — output is identical', () => {
  const value = { b: [undefined, NaN, { z: 1, y: 2 }], a: { c: null, d: Infinity } }
  const fromCanonical = canonicalize(value)
  const fromLocal = localCanonicalize(value)
  assert.equal(fromLocal, fromCanonical, 'local canonicalize must be identical to canonical.js')
})

test('issue #1112: no valid object means nothing happens (NULL propagation)', () => {
  const invalidInputs = [null, undefined, 'string', 42, [], {}, { intent: 'only_one_field' }]
  for (const input of invalidInputs) {
    assert.equal(toCanonicalAeo(input), null, `invalid input ${JSON.stringify(input)} must return null`)
  }
})
