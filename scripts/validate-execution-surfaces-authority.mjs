import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const CANONICAL = 'EXECUTION_SURFACES.json'
const LINEAGE = 'EXECUTION_SURFACES_LINEAGE.json'
const NON_CANONICAL = [
  'governance/runtime/EXECUTION_SURFACES.json',
  'runtime/surfaces/EXECUTION_SURFACES.json',
  'runtime/execution_surfaces.json',
  'governance/execution_surfaces.json',
  'governance/mindshift-validation-bundle/governance/EXECUTION_SURFACES.json',
  'PHASE3_EXECUTION_SURFACE_INVENTORY.json',
]
const CODE_EXTENSIONS = /\.(?:[cm]?[jt]s|tsx?|ya?ml)$/

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

const canonical = JSON.parse(readFileSync(CANONICAL, 'utf8'))
assert.equal(canonical.canonical_source, true, `${CANONICAL} must declare canonical_source=true`)
assert.equal(canonical.canonical_source_path, CANONICAL)

const lineage = JSON.parse(readFileSync(LINEAGE, 'utf8'))
assert.equal(lineage.determination, 'ROOT_CANONICAL')
assert.equal(lineage.canonical_source, CANONICAL)
assert.deepEqual(lineage.derivatives.map(({ path }) => path).sort(), [...NON_CANONICAL].sort())

for (const derivative of lineage.derivatives) {
  assert.ok(['generated projection', 'compatibility copy', 'historical evidence', 'retired artifact'].includes(derivative.classification), `${derivative.path}: invalid classification`)
  assert.ok(derivative.source_version, `${derivative.path}: source_version is required`)
  assert.ok(derivative.generation_method, `${derivative.path}: generation_method is required`)
  assert.ok(derivative.freshness?.verified_at, `${derivative.path}: freshness.verified_at is required`)
  assert.equal(derivative.freshness.sha256, sha256(derivative.path), `${derivative.path}: stale lineage hash; refresh deliberately without changing inventory semantics`)
  if (derivative.classification !== 'historical evidence') assert.equal(derivative.derived_from, CANONICAL)
}

const projectionConsumers = new Set(lineage.allowed_projection_consumers)
const trackedFiles = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean)
const violations = []

for (const file of trackedFiles) {
  if (!CODE_EXTENSIONS.test(file) || file === 'scripts/validate-execution-surfaces-authority.mjs' || projectionConsumers.has(file)) continue
  const source = readFileSync(file, 'utf8')
  for (const path of NON_CANONICAL) {
    if (source.includes(path)) violations.push(`${file} -> ${path}`)
  }
}

assert.deepEqual(violations, [], `non-canonical EXECUTION_SURFACES enforcement consumers:\n${violations.join('\n')}`)
console.log(`EXECUTION_SURFACES authority valid: ROOT_CANONICAL (${CANONICAL}); ${lineage.derivatives.length} derivatives attributable; no non-canonical enforcement consumers`)
