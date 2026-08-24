import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { reconcileTopology } from '../runtime/reconciliation/topology-reconciliation-engine.js'

test('execution-surface authority has one operative source and attributable derivatives', () => {
  const output = execFileSync(process.execPath, ['scripts/validate-execution-surfaces-authority.mjs'], { encoding: 'utf8' })
  assert.match(output, /ROOT_CANONICAL \(EXECUTION_SURFACES\.json\)/)
  assert.match(output, /no non-canonical enforcement consumers/)
})

test('canonical authority produces a non-operative SAFE_TO_MERGE topology projection', () => {
  const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))
  const authority = readJson('EXECUTION_SURFACES.json')
  const runtimeGraph = readJson('runtime/topology/runtime_graph.json')
  const observability = readJson('runtime/surfaces/OBSERVABILITY_SURFACES.json')
  const schemaMap = readJson('runtime/topology/schema_source_map.json')
  const mergeGovernance = readJson('governance/runtime/MERGE_GOVERNANCE_RULES.json')

  const executionProjection = authority.canonical_runtime_route.map((route) => ({
    id: `canonical_route:${route}`,
    route,
    declared: true,
    classified: true,
    hidden: false,
    mutation_capable: false,
    deployment_capable: false,
    creates_authority: false,
  }))
  const evidence = reconcileTopology({
    runtime_routes: runtimeGraph.nodes,
    execution_surfaces: executionProjection,
    observability_surfaces: observability.surfaces,
    governance_inventories: [{ id: 'merge_governance_rules', current: true, required_routes: runtimeGraph.canonical_lifecycle }],
    schema_maps: schemaMap.sources,
    workflow_topology: [{ id: 'governed_deploy_workflow', workflow: 'governed-deploy.yml', declared: true, expands_execution: false }],
    proof_lineage_bindings: [{ id: 'merge_governance_rules', path: 'governance/runtime/MERGE_GOVERNANCE_RULES.json', hash_bound: true }],
    topology_ancestry: [mergeGovernance.topology_reconciliation.policy],
  }, { generated_at: new Date(0).toISOString(), maxNodes: 256 })

  assert.equal(evidence.classification, 'TOPOLOGY_VALID')
  assert.equal(evidence.merge_signal, 'SAFE_TO_MERGE')
  assert.equal(evidence.mutation_capable, false)
  assert.equal(evidence.evidence_only, true)
})
