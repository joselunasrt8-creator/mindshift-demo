import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  ROOT_AUTHORITY_CLASSIFICATIONS,
  ROOT_AUTHORITY_EVIDENCE_FLAGS,
  buildRootAuthorityContainmentEnvelope,
  canonicalizeRootAuthorityInventory,
  classifyRootAuthoritySurface,
  computeAuthorityContainmentBoundary,
  detectRootAuthorityDrift,
  hashRootAuthorityTopology,
} from '../../runtime/sovereignty/root-authority-containment.js'

const source = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../../migrations/0036_root_authority_observability_registry.sql', import.meta.url), 'utf8')
const governance = JSON.parse(readFileSync(new URL('../../governance/runtime/MERGE_GOVERNANCE_RULES.json', import.meta.url), 'utf8'))
const inventoryArtifact = JSON.parse(readFileSync(new URL('../../runtime/sovereignty/root_authority_inventory.json', import.meta.url), 'utf8'))
const boundaryArtifact = JSON.parse(readFileSync(new URL('../../runtime/sovereignty/root_authority_boundaries.json', import.meta.url), 'utf8'))
const mapArtifact = JSON.parse(readFileSync(new URL('../../runtime/sovereignty/infrastructure_authority_map.json', import.meta.url), 'utf8'))
const assumptionArtifact = JSON.parse(readFileSync(new URL('../../runtime/sovereignty/sovereignty_assumption_registry.json', import.meta.url), 'utf8'))
const taxonomyArtifact = JSON.parse(readFileSync(new URL('../../runtime/sovereignty/root_authority_drift_taxonomy.json', import.meta.url), 'utf8'))
const rulesArtifact = JSON.parse(readFileSync(new URL('../../runtime/sovereignty/root_authority_containment_rules.json', import.meta.url), 'utf8'))

class D1 {
  constructor() { this.statements = [] }
  prepare(sql) {
    this.statements.push(sql)
    return {
      bind() { return this },
      all() { return Promise.resolve({ results: [] }) },
      first() { return Promise.resolve(null) },
      run() { return Promise.resolve({ meta: { changes: 1 } }) },
    }
  }
}

async function worker() {
  const { transformSync } = await import('esbuild')
  return (await import(`data:text/javascript;base64,${Buffer.from(transformSync(source, { loader: 'ts', format: 'esm' }).code).toString('base64')}`)).default
}

test('deterministic topology hashing and containment identity are canonical-order independent', () => {
  const first = canonicalizeRootAuthorityInventory({ surfaces: [{ surface_id: 'a', authority_origin: 'github', declared_boundary: 'declared', classifications: ['ROOT_WORKFLOW_AUTHORITY'] }, { surface_id: 'b', authority_origin: 'cloudflare', declared_boundary: 'declared', classifications: ['ROOT_DEPLOY_AUTHORITY'] }] })
  const second = canonicalizeRootAuthorityInventory({ surfaces: [...first.surfaces].reverse() })
  assert.equal(hashRootAuthorityTopology(first), hashRootAuthorityTopology(second))
  assert.equal(buildRootAuthorityContainmentEnvelope(first).containment_identity, buildRootAuthorityContainmentEnvelope(second).containment_identity)
})

test('append-only registry immutability has deterministic indexes and non-authoritative guards', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS root_authority_observability_registry/)
  for (const indexName of ['topology', 'boundary', 'drift']) assert.match(migration, new RegExp(`idx_root_authority_observability_registry_${indexName}`))
  assert.match(migration, /trg_root_authority_observability_registry_no_update/)
  assert.match(migration, /trg_root_authority_observability_registry_no_delete/)
  assert.match(migration, /CHECK \(evidence_only='true'\)/)
  assert.match(migration, /CHECK \(append_only='true'\)/)
  assert.match(migration, /CHECK \(non_authoritative='true'\)/)
  assert.match(migration, /CHECK \(executable='false'\)/)
  assert.match(migration, /CHECK \(deployment_capable='false'\)/)
  assert.match(migration, /CHECK \(creates_authority='false'\)/)
  assert.match(migration, /CHECK \(secret_material_persisted='false'\)/)
})

test('undeclared authority detection fails closed to merge legitimacy NULL', () => {
  const envelope = buildRootAuthorityContainmentEnvelope({ surfaces: [{ surface_id: 'shadow_admin', authority_origin: 'github_admin', declared_boundary: 'undeclared', classifications: ['UNDECLARED_ROOT_SURFACE'], declared: false }] })
  assert.ok(envelope.drift.drift_classes.includes('UNDECLARED_ROOT_SURFACE'))
  assert.ok(envelope.drift.drift_classes.includes('SOVEREIGNTY_DRIFT_DETECTED'))
  assert.ok(envelope.drift.drift_classes.includes('ROOT_AUTHORITY_BOUNDARY_OVERFLOW'))
  assert.equal(envelope.drift.merge_legitimacy, 'NULL')
  assert.equal(envelope.boundary.preo_validity, 'NULL')
})

test('replay-neutral observability and non-authoritative evidence guarantees hold', () => {
  const envelope = buildRootAuthorityContainmentEnvelope()
  for (const [key, value] of Object.entries(ROOT_AUTHORITY_EVIDENCE_FLAGS)) assert.equal(envelope[key], value)
  assert.equal(envelope.boundary.classification_authorizes, false)
  assert.equal(envelope.boundary.evidence_authorizes_merge, false)
  assert.equal(envelope.drift.replay_neutral, true)
  assert.equal(envelope.drift.non_authoritative, true)
})

test('GET-only sovereignty routes are non-executable and do not expand route execution', async () => {
  for (const route of ['/sovereignty/root-authority', '/sovereignty/root-authority/drift', '/sovereignty/root-authority/boundary', '/sovereignty/root-authority/topology']) assert.ok(source.includes(route), `missing ${route}`)
  assert.match(source, /ROOT_AUTHORITY_OBSERVABILITY_ROUTES\.includes\(url\.pathname as any\) && request\.method !== "GET"/)
  assert.match(source, /ROOT_AUTHORITY_OBSERVABILITY_ROUTES\.includes\(url\.pathname as any\) && request\.method === "GET"/)
  assert.doesNotMatch(source, /url\.pathname === ROOT_AUTHORITY_ROUTE && request\.method === "POST"/)
  const runtime = await worker()
  const db = new D1()
  const res = await runtime.fetch(new Request('https://runtime.test/sovereignty/root-authority'), { DB: db })
  const body = await res.json()
  assert.equal(body.executable, false)
  assert.equal(body.deployment_capable, false)
  assert.equal(body.creates_authority, false)
  assert.equal(body.secret_values_inspected, false)
  assert.ok(db.statements.some((sql) => sql.includes('INSERT OR IGNORE INTO root_authority_observability_registry')))
  assert.ok(db.statements.some((sql) => sql.includes('declared_root_surfaces')))
  assert.ok(db.statements.some((sql) => sql.includes('undeclared_root_surfaces')))
  assert.ok(db.statements.some((sql) => sql.includes('drift_classes')))
  assert.ok(body.envelope.observation_id)
  assert.ok(Array.isArray(body.envelope.declared_root_surfaces))
  const post = await runtime.fetch(new Request('https://runtime.test/sovereignty/root-authority', { method: 'POST' }), { DB: db })
  assert.equal(post.status, 405)
})

test('deterministic boundary equivalence and authority topology drift detection', () => {
  const inventory = canonicalizeRootAuthorityInventory({ surfaces: [{ surface_id: 'workflow', authority_origin: 'github_actions', declared_boundary: 'declared', classifications: ['ROOT_WORKFLOW_AUTHORITY'] }] })
  const boundaryA = computeAuthorityContainmentBoundary(inventory)
  const boundaryB = computeAuthorityContainmentBoundary(canonicalizeRootAuthorityInventory({ surfaces: [...inventory.surfaces].reverse() }))
  assert.equal(boundaryA.boundary_hash, boundaryB.boundary_hash)
  const drift = detectRootAuthorityDrift(canonicalizeRootAuthorityInventory({ surfaces: [{ surface_id: 'ambiguous', authority_origin: 'unknown', declared_boundary: 'declared', classifications: [] }] }))
  assert.ok(drift.drift_classes.includes('ROOT_AUTHORITY_TOPOLOGY_DIVERGENCE'))
})

test('no secret material persistence and no deployment capability introduction', () => {
  const envelope = buildRootAuthorityContainmentEnvelope()
  assert.equal(envelope.secret_values_inspected, false)
  assert.equal(envelope.secret_material_persisted, false)
  for (const surface of envelope.inventory.surfaces) {
    assert.equal(surface.secret_material, 'NOT_INSPECTED')
    assert.equal(surface.executable, false)
    assert.equal(surface.deployment_capable, false)
    assert.equal(surface.creates_authority, false)
  }
  assert.equal(envelope.inventory.surfaces.every((surface) => surface.deployment_capable === false), true)
  assert.match(source, /rootAuthorityFlags\(\)/)
})

test('workflow, package script, Wrangler, and local deploy authority classification is deterministic', () => {
  const workflow = canonicalizeRootAuthorityInventory({ surfaces: [{ surface_id: 'github_actions_workflow_dispatch', authority_origin: 'github_actions', declared_boundary: '/authority→/compile→/validate→/execute→/proof' }] }).surfaces[0]
  assert.ok(workflow.classifications.includes('ROOT_WORKFLOW_AUTHORITY'))
  assert.equal(workflow.canonical_boundary_status, 'DECLARED')
  assert.ok(classifyRootAuthoritySurface({ surface_id: 'package_script_deploy_capability' }).includes('ROOT_PACKAGE_EXECUTION_AUTHORITY'))
  const wranglerClasses = classifyRootAuthoritySurface({ surface_id: 'wrangler_local_deploy_capability', authority_origin: 'cloudflare_wrangler', declared_boundary: 'direct-local-deploy-outside-canonical-path', containment_status: 'CONTAINMENT_REQUIRED' })
  assert.ok(wranglerClasses.includes('ROOT_DEPLOY_AUTHORITY'))
  assert.ok(wranglerClasses.includes('ROOT_LOCAL_EXECUTION_AUTHORITY'))
  assert.ok(wranglerClasses.includes('ROOT_AUTHORITY_BYPASS_RISK'))
  assert.ok(wranglerClasses.includes('ROOT_AUTHORITY_CONTAINMENT_REQUIRED'))
  assert.ok(classifyRootAuthoritySurface({ surface_id: 'local_credential_authority' }).includes('ROOT_LOCAL_EXECUTION_AUTHORITY'))
})

test('expanded root authority inventory declares required surfaces without secret values', () => {
  const required = [
    'cloudflare_account_authority',
    'cloudflare_api_deployment_token_authority',
    'wrangler_local_deploy_capability',
    'github_admin_authority',
    'github_actions_token_authority',
    'github_actions_workflow_dispatch',
    'repository_secret_environment_mutation_authority',
    'branch_protection_mutation_authority',
    'package_script_deploy_capability',
    'local_credential_authority',
    'federation_root_runtime_authority_assumption',
  ]
  for (const surface_id of required) assert.ok(inventoryArtifact.surfaces.some((surface) => surface.surface_id === surface_id), `missing ${surface_id}`)
  for (const surface of inventoryArtifact.surfaces) {
    for (const field of ['surface_id', 'authority_origin', 'mutation_capability', 'deployment_capability', 'canonical_boundary_status', 'classification', 'secret_values_inspected', 'evidence_only', 'non_authoritative', 'drift_observable', 'containment_status']) assert.ok(Object.hasOwn(surface, field), `${surface.surface_id} missing ${field}`)
    assert.equal(surface.secret_values_inspected, false)
    assert.equal(surface.evidence_only, true)
    assert.equal(surface.non_authoritative, true)
  }
})

test('baseline bypass-capable authority fails closed without granting execution or merge', () => {
  const envelope = buildRootAuthorityContainmentEnvelope()
  assert.ok(envelope.drift.drift_classes.includes('ROOT_AUTHORITY_BYPASS_RISK'))
  assert.ok(envelope.drift.drift_classes.includes('ROOT_AUTHORITY_CONTAINMENT_REQUIRED'))
  assert.equal(envelope.boundary.merge_legitimacy, 'NULL')
  assert.equal(envelope.boundary.preo_validity, 'NULL')
  assert.equal(envelope.boundary.evidence_authorizes_merge, false)
  assert.equal(envelope.executable, false)
})

test('sovereignty assumption continuity and required artifacts are present', () => {
  assert.equal(inventoryArtifact.secret_values_inspected, false)
  assert.equal(boundaryArtifact.classification_is_authorization, false)
  assert.equal(boundaryArtifact.workflow_dispatch_is_legitimacy, false)
  assert.equal(boundaryArtifact.bypass_capable_root_authority_result, 'merge_legitimacy_NULL')
  assert.ok(mapArtifact.map.some((entry) => entry.classification === 'ROOT_WORKFLOW_AUTHORITY'))
  assert.ok(assumptionArtifact.assumptions.some((entry) => entry.assumption_id === 'undeclared_surface_null'))
  for (const classification of ROOT_AUTHORITY_CLASSIFICATIONS) assert.ok(taxonomyArtifact.classifications.includes(classification))
  assert.ok(assumptionArtifact.assumptions.some((entry) => entry.assumption_id === 'deployment_token_presence_is_evidence_only'))
  assert.ok(rulesArtifact.rules.includes('workflow_dispatch -> trigger evidence only -> authority→compile→validate→execute→proof still required'))
  assert.ok(rulesArtifact.rules.includes('observability != sovereignty'))
})

test('merge governance root authority rules invalidate legitimacy but never authorize merge', () => {
  for (const rule of [
    'Undeclared root authority -> merge legitimacy NULL',
    'Sovereignty drift -> PREO invalid',
    'Infrastructure mutation ambiguity -> containment required',
    'Root authority topology divergence -> governance trust isolated',
    'Root authority containment evidence may invalidate legitimacy but may NEVER authorize merge',
    'Bypass-capable root authority -> merge legitimacy NULL',
    'Root authority bypass risk -> PREO invalid',
  ]) assert.ok(governance.rules.includes(rule))
  assert.equal(governance.root_authority_containment.may_authorize_merge, false)
  assert.equal(governance.root_authority_containment.secret_values_inspected, false)
  assert.equal(governance.root_authority_containment.workflow_dispatch_is_legitimacy, false)
  assert.equal(governance.root_authority_containment.merge_legitimacy_on_bypass_or_undeclared, 'NULL')
})
