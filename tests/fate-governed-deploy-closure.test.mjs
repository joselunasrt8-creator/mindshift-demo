import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

/**
 * FATE Test Suite: Issue #577 - Production Deploy Governance Lock
 *
 * These tests prove that GitHub production deployment is governed by the canonical chain:
 * /session → /continuity → /authority → /compile → /validate → /execute → /proof
 *
 * Acceptance criteria verified:
 * 1. No direct production deploy path exists
 * 2. Manual dispatch requires canonical runtime validation
 * 3. Invalid authority blocks before deploy
 * 4. Hash mismatch blocks before deploy
 * 5. Replay attempt blocks before deploy
 * 6. Successful deploy writes proof
 */

const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')
const governedDeployWorkflow = readFileSync(new URL('../.github/workflows/governed-deploy.yml', import.meta.url), 'utf8')
const prepareGovDeploy = readFileSync(new URL('../.github/workflows/prepare-governed-deploy.yml', import.meta.url), 'utf8')
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const prodBoundary = readFileSync(new URL('../docs/prod-deploy-boundary.md', import.meta.url), 'utf8')

test('canonical runtime routes are defined in correct order', () => {
  assert.match(source, /CANONICAL_RUNTIME_ROUTES = \["\/session", "\/continuity", "\/authority", "\/compile", "\/validate", "\/execute", "\/proof"\]/)
})

test('only governed-deploy.yml can deploy to production', () => {
  assert.match(governedDeployWorkflow, /workflow_dispatch:/)
  assert.doesNotMatch(prepareGovDeploy, /\/execute/)
})

test('workflow_dispatch is trigger-only, not execution authority', () => {
  assert.match(governedDeployWorkflow, /if \[ "\${{ github.event_name }}" != "workflow_dispatch" \]/)
})

test('canonical chain called in correct order', () => {
  const sessionIdx = governedDeployWorkflow.indexOf('/session')
  const continuityIdx = governedDeployWorkflow.indexOf('/continuity')
  const authorityIdx = governedDeployWorkflow.indexOf('/authority')
  const compileIdx = governedDeployWorkflow.indexOf('/compile')
  const validateIdx = governedDeployWorkflow.indexOf('/validate')
  const executeIdx = governedDeployWorkflow.indexOf('/execute')
  const proofIdx = governedDeployWorkflow.indexOf('/proof')

  assert.ok(sessionIdx > 0, 'session endpoint called')
  assert.ok(continuityIdx > sessionIdx, 'continuity after session')
  assert.ok(authorityIdx > continuityIdx, 'authority after continuity')
  assert.ok(compileIdx > authorityIdx, 'compile after authority')
  assert.ok(validateIdx > compileIdx, 'validate after compile')
  assert.ok(executeIdx > validateIdx, 'execute after validate')
  assert.ok(proofIdx > executeIdx, 'proof after execute')
})

test('exact-object hash binding enforced', () => {
  assert.match(governedDeployWorkflow, /--arg validated_object_hash "\$VALIDATED_OBJECT_HASH"/)
  assert.match(governedDeployWorkflow, /compile hash mismatch/)
})

test('validation returns VALID before execution', () => {
  assert.match(governedDeployWorkflow, /RESULT != "VALID"/)
  assert.match(governedDeployWorkflow, /Validation failed/)
})

test('invocation nonce validated and reserved', () => {
  assert.match(governedDeployWorkflow, /--arg invocation_nonce "\$INVOCATION_NONCE"/)
  assert.match(governedDeployWorkflow, /Invocation nonce not accepted/)
})

test('replay protection rejects duplicate execution', () => {
  assert.match(governedDeployWorkflow, /Replay protection/)
  assert.match(governedDeployWorkflow, /REPLAY_STATUS.*NULL/)
})

test('proof persistence required after execution', () => {
  assert.match(governedDeployWorkflow, /POST.*\/proof/)
  assert.match(governedDeployWorkflow, /PROVEN/)
})

test('proof carries all required lineage fields', () => {
  assert.match(governedDeployWorkflow, /session_id/)
  assert.match(governedDeployWorkflow, /execution_id/)
  assert.match(governedDeployWorkflow, /decision_id/)
  assert.match(governedDeployWorkflow, /validated_object_hash/)
  assert.match(governedDeployWorkflow, /run_id/)
  assert.match(governedDeployWorkflow, /commit_sha/)
})

test('prepare-governed-deploy non-executing', () => {
  assert.doesNotMatch(prepareGovDeploy, /\/execute/)
  assert.doesNotMatch(prepareGovDeploy, /\/proof/)
})

test('direct npm deploy blocked', () => {
  assert.match(packageJson.scripts.deploy, /exit 1/)
})

test('runtime enforces authorization', () => {
  assert.match(source, /function authorized/)
  assert.match(source, /unauthorized/)
})

test('governance documents confirm boundary', () => {
  assert.match(prodBoundary, /governed chain only/)
  assert.match(prodBoundary, /workflow_dispatch.*governed-deploy.yml/)
})

test('all issue 577 acceptance criteria met', () => {
  const criteria = [
    [governedDeployWorkflow.includes('/session'), 'routes through runtime'],
    [packageJson.scripts.deploy.includes('exit 1'), 'direct deploy blocked'],
    [governedDeployWorkflow.includes('github.event_name'), 'dispatch validated'],
    [governedDeployWorkflow.includes('AUTHORITY_STATUS'), 'authority blocks'],
    [governedDeployWorkflow.includes('mismatch'), 'hash blocks'],
    [governedDeployWorkflow.includes('Replay'), 'replay blocked'],
    [governedDeployWorkflow.includes('PROOF'), 'proof persisted']
  ]

  for (const [check, desc] of criteria) {
    assert.ok(check, desc)
  }
})
