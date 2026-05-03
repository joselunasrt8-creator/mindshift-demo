import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')
const workflow = readFileSync(new URL('../.github/workflows/governed-deploy.yml', import.meta.url), 'utf8')
const prepareWorkflow = readFileSync(new URL('../.github/workflows/prepare-governed-deploy.yml', import.meta.url), 'utf8')
const pkg = readFileSync(new URL('../package.json', import.meta.url), 'utf8')
const workflowNames = readdirSync(new URL('../.github/workflows/', import.meta.url))

test('authority endpoint persists required fields including expiry and ACTIVE', () => {
  assert.match(source, /route\("\/authority"\)/)
  assert.match(source, /expiry: body\.expiry/)
  assert.match(source, /status: "ACTIVE"/)
  assert.match(source, /INSERT INTO authority_registry/)
})

test('compile emits exact AEO + canonical hash output', () => {
  assert.match(source, /function toAeoCore\(aeo: any\)/)
  assert.match(source, /const exactAeo = toAeoCore\(aeo\)/)
  assert.match(source, /validated_object_hash: compiledHash/)
})

test('validate returns only VALID or NULL and checks exact AEO keys', () => {
  assert.match(source, /requiredAeoKeys = \["intent", "scope", "validation", "target", "finality"\]/)
  assert.match(source, /keys\.length === requiredAeoKeys\.length/)
  assert.match(source, /return jsonResponse\(\{ status: "VALID" \}\)/)
  assert.match(source, /return jsonResponse\(\{ status: "NULL", reason: deriveValidateNullReason\(result\.payload\) \}\)/)
})

test('execute blocks without prior VALID reservation', () => {
  assert.match(source, /nonce_not_reserved_or_replayed/)
  assert.match(source, /No existing VALID validation found/)
})

test('direct deploy and webhook paths are fail closed', () => {
  assert.match(pkg, /Direct deploy disabled/)
  assert.match(source, /webhook_deploy_disabled/)
})

test('workflow routes through authority -> compile -> validate -> execute -> proof', () => {
  const order = ['COMPILE — Create exact AEO and canonical hash', 'VALIDATE — Fail closed unless exact VALID + exact hash + nonce reserved', 'EXECUTE — Require exact validated object hash', 'PROOF — Required for production completion']
  let last = -1
  for (const step of order) {
    const i = workflow.indexOf(step)
    assert.ok(i > last, `${step} must appear in order`)
    last = i
  }
})

test('proof response persists proof and hashes', () => {
  assert.match(source, /proof_id: proof\.proof_id/)
  assert.match(source, /execution_id: proof\.execution_id/)
  assert.match(source, /validated_object_hash/)
  assert.match(source, /consumeAuthority\(env, body\.decision_id\)/)
})


test('execute is locked to governed workflow and deploy_production action', () => {
  assert.match(source, /wrong_workflow_or_action/)
  assert.match(source, /canonicalWorkflowName\(authorityTarget\?\.workflow\) !== CANONICAL_GOVERNED_WORKFLOW/)
  assert.match(source, /authorityTarget\?\.action !== "deploy_production"/)
})

test('proof response includes persisted decision, run, commit, result, and timestamp fields', () => {
  assert.match(source, /decision_id: proof\.decision_id/)
  assert.match(source, /run_id: proof\.run_id/)
  assert.match(source, /commit_sha: proof\.commit_sha/)
  assert.match(source, /result: proof\.result/)
  assert.match(source, /timestamp: proof\.timestamp/)
})


test('governed deploy recognizes workflow_mismatch as a known NULL validation reason', () => {
  assert.match(workflow, /workflow_mismatch/)
})

test('prepare-governed-deploy only prepares authority triple and does not deploy', () => {
  assert.match(prepareWorkflow, /name: prepare-governed-deploy/)
  assert.match(prepareWorkflow, /AUTHORITY — Create deploy authority and decision/)
  assert.match(prepareWorkflow, /COMPILE — Resolve validated object hash/)
  assert.match(prepareWorkflow, /GENERATE NONCE — Prepare invocation_nonce/)
  assert.doesNotMatch(prepareWorkflow, /\/execute/)
  assert.doesNotMatch(prepareWorkflow, /\/proof/)
  assert.doesNotMatch(prepareWorkflow, /workflow_dispatches/)
})

test('workflow surface audit: single PR validation workflow and single governed production deploy workflow', () => {
  const prValidationWorkflows = workflowNames.filter((name) => name === 'mindshift-validate-pr.yml')
  const productionDeployWorkflows = workflowNames.filter((name) => name === 'governed-deploy.yml')
  assert.equal(prValidationWorkflows.length, 1)
  assert.equal(productionDeployWorkflows.length, 1)
})
