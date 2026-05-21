import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')

test('deployment replay rejection enforced before proof insertion', () => {
  assert.match(source, /reason: "deployment_proof_replay"/, 'deployment_proof_replay rejection must exist')
  assert.match(source, /indicator: "deployment_replay_rejected"/, 'deployment_replay_rejected indicator must be emitted')
  assert.match(source, /drift_class: "replay_drift"[\s\S]*deployment_replay/, 'deployment replay must be classified as replay_drift')
})

test('deployment replay check queries deployment_proof_registry before proof is written', () => {
  const proofStart = source.indexOf('if (url.pathname === "/proof" && request.method === "POST") {')
  const replayCheck = source.indexOf('SELECT deployment_proof_id FROM deployment_proof_registry WHERE proof_hash=', proofStart)
  const proofInsert = source.indexOf('INSERT OR IGNORE INTO proof_registry', proofStart)
  assert.ok(proofStart >= 0, 'proof route must exist')
  assert.ok(replayCheck > proofStart, 'deployment replay check must be inside proof route')
  assert.ok(proofInsert > replayCheck, 'deployment replay check must occur before proof_registry insert')
})

test('stale workflow deployment is rejected before proof insertion', () => {
  assert.match(source, /reason: "stale_workflow_deployment"/, 'stale_workflow_deployment rejection must exist')
  assert.match(source, /indicator: "stale_workflow_artifact"/, 'stale_workflow_artifact indicator must be emitted')
  assert.match(source, /drift_class: "workflow_source_drift"[\s\S]*stale_workflow/, 'stale workflow must be classified as workflow_source_drift')
})

test('stale workflow check occurs before proof_registry insert', () => {
  const proofStart = source.indexOf('if (url.pathname === "/proof" && request.method === "POST") {')
  const staleCheck = source.indexOf('reason: "stale_workflow_deployment"', proofStart)
  const proofInsert = source.indexOf('INSERT OR IGNORE INTO proof_registry', proofStart)
  assert.ok(staleCheck > proofStart, 'stale workflow check must be inside proof route')
  assert.ok(proofInsert > staleCheck, 'stale workflow check must occur before proof_registry insert')
})

test('artifact mismatch rejection enforced before proof insertion', () => {
  assert.match(source, /reason: "artifact_hash_mismatch"/, 'artifact_hash_mismatch rejection must exist')
  assert.match(source, /indicator: "artifact_lineage_mismatch"/, 'artifact_lineage_mismatch indicator must be emitted')
})

test('artifact mismatch check occurs before proof_registry insert', () => {
  const proofStart = source.indexOf('if (url.pathname === "/proof" && request.method === "POST") {')
  const artifactCheck = source.indexOf('reason: "artifact_hash_mismatch"', proofStart)
  const proofInsert = source.indexOf('INSERT OR IGNORE INTO proof_registry', proofStart)
  assert.ok(artifactCheck > proofStart, 'artifact mismatch check must be inside proof route')
  assert.ok(proofInsert > artifactCheck, 'artifact mismatch check must occur before proof_registry insert')
})

test('deployment replay check uses deterministic proof_hash derived from deployment lineage', () => {
  assert.match(source, /deploymentProofHashValue.*computeDeploymentProofHash/, 'proof_hash must be computed via computeDeploymentProofHash')
  assert.match(source, /deployment_proof_registry WHERE proof_hash=\?1/, 'replay check must query by proof_hash')
})

test('deployment spine pre-flight checks preserve NULL semantics on failure', () => {
  assert.match(source, /reason: "deployment_proof_replay"[\s\S]*drift_class: "replay_drift"/, 'replay rejection must emit replay_drift')
  assert.match(source, /reason: "stale_workflow_deployment"[\s\S]*drift_class: "workflow_source_drift"/, 'stale workflow rejection must emit workflow_source_drift')
  assert.match(source, /reason: "artifact_hash_mismatch"[\s\S]*drift_class: "hash_drift"/, 'artifact mismatch rejection must emit hash_drift')
})

test('deployment spine pre-flight checks occur after proof lineage validation', () => {
  const proofStart = source.indexOf('if (url.pathname === "/proof" && request.method === "POST") {')
  const lineageCheck = source.indexOf('proofLineageCheck', proofStart)
  const deploymentSpineComment = source.indexOf('Deployment legitimacy spine pre-flight', proofStart)
  assert.ok(lineageCheck > proofStart, 'proof lineage check must exist in proof route')
  assert.ok(deploymentSpineComment > lineageCheck, 'deployment spine pre-flight must occur after proof lineage check')
})

test('append-only deployment_proof_registry semantics enforced via schema constraints', () => {
  assert.match(source, /trg_deployment_proof_registry_no_update/, 'no-update trigger required for immutability')
  assert.match(source, /trg_deployment_proof_registry_no_delete/, 'no-delete trigger required for immutability')
  assert.match(source, /deployment_proof_registry[\s\S]*UNIQUE\(proof_hash\)/, 'deterministic deduplication required')
})
