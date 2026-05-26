import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const allowedRelations = new Set(["CALLS","VALIDATES","WRITES_PROOF","CONSUMES_NONCE","DEPENDS_ON_AUTHORITY","DEPENDS_ON_CONTINUITY","RECONCILES_WITH","CLASSIFIES_FINALITY","MUTATES_STATE","REFERENCES_REGISTRY","REFERENCES_PROOF","REFERENCES_REPLAY","REFERENCES_PARTITION","REFERENCES_WORKFLOW"]);

function runExtractor() {
  const run = spawnSync('npx', ['tsx', 'graph/runtime-topology-extractor.ts'], { encoding: 'utf8' });
  assert.equal(run.status, 0, `extractor failed: ${run.stderr || run.stdout}`);
}

test('extractor runs without external services and emits schema-compatible core fields', () => {
  runExtractor();
  const data = JSON.parse(readFileSync('graph/runtime-topology.sample.json', 'utf8'));
  assert.ok(data.generated_at);
  assert.ok(data.repository);
  assert.ok(Array.isArray(data.nodes));
  assert.ok(Array.isArray(data.edges));
  assert.ok(data.summary);
});

test('nodes include closure_status and classify validator/proof/replay/workflow/mutation surfaces', () => {
  const data = JSON.parse(readFileSync('graph/runtime-topology.sample.json', 'utf8'));
  for (const node of data.nodes) assert.ok(node.closure_status);
  assert.ok(data.nodes.some((n) => String(n.file_path).includes('src/') && n.validator_bound));
  assert.ok(data.nodes.some((n) => n.proof_generating));
  assert.ok(data.nodes.some((n) => n.replay_safe));
  assert.ok(data.nodes.some((n) => n.type === 'WORKFLOW_SURFACE'));
  assert.ok(data.nodes.some((n) => n.mutation_capable));
});

test('edge relations are in allowed set', () => {
  const data = JSON.parse(readFileSync('graph/runtime-topology.sample.json', 'utf8'));
  for (const e of data.edges) assert.ok(allowedRelations.has(e.relation), `unexpected relation ${e.relation}`);
});

test('extractor does not modify runtime files', () => {
  const extractor = readFileSync('graph/runtime-topology-extractor.ts', 'utf8');
  assert.equal(/writeFileSync\(("|')src\//.test(extractor), false);
  assert.equal(/writeFileSync\(("|')runtime\//.test(extractor), false);
});
