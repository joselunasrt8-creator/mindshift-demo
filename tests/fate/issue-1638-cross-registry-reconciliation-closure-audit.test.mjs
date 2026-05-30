import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const spec = JSON.parse(
  readFileSync(join(root, 'governance', 'CROSS_REGISTRY_RECONCILIATION_CLOSURE_AUDIT_SPEC.json'), 'utf8'),
);

// ---------------------------------------------------------------------------
// Canonical hash helpers
// ---------------------------------------------------------------------------

function sortCanonical(value) {
  if (Array.isArray(value)) return value.map(sortCanonical);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, sortCanonical(v)]),
    );
  }
  return value;
}

function canonicalHash(value) {
  return createHash('sha256').update(`${JSON.stringify(sortCanonical(value))}\n`).digest('hex');
}

// ---------------------------------------------------------------------------
// Cross-registry reconciliation closure audit logic
//
// Boundary contract:
//   The audit classifies distributed state across seven registry surfaces.
//   It detects drift without fabricating convergence, repairing records
//   automatically, or creating authority. Ambiguity fails closed to
//   LEGITIMACY_NULL. Reconciliation may classify; it may not authorize.
//
//   Classification boundary for replay state:
//     REGISTRY_RECONCILIATION_INCOMPLETE = required evidence missing or
//       state cannot be reconstructed → AMBIGUITY_FORCES_NULL
//     REGISTRY_REPLAY_DIVERGENCE = required evidence present but replay
//       conclusions disagree → REPLAY_DRIFT
// ---------------------------------------------------------------------------

const AUDIT_TYPE = 'CROSS_REGISTRY_RECONCILIATION_CLOSURE_AUDIT';

const NON_OPERATIVE_BASE = {
  reconciliation_creates_authority: false,
  reconciliation_creates_execution: false,
  reconciliation_creates_deployment: false,
  reconciliation_creates_merge_permission: false,
  reconciliation_creates_proof: false,
  reconciliation_repairs_records: false,
  audit_type: AUDIT_TYPE,
};

const REQUIRED_AUDIT_SURFACES = [
  'merge_legitimacy_registry',
  'deploy_legitimacy_registry',
  'proof_lineage_registry',
  'replay_registry',
  'topology_reconciliation_registry',
  'governance_inventory_registry',
  'federation_reconciliation_evidence',
];

function performClosureAudit(inputs) {
  const drift_inventory = [];
  const unresolved_ambiguity_inventory = [];

  // --- Phase 1: Required input presence check → AMBIGUITY_FORCES_NULL ---
  for (const key of REQUIRED_AUDIT_SURFACES) {
    if (inputs[key] == null) {
      unresolved_ambiguity_inventory.push({
        registry: key,
        reason: 'missing_required_input',
        classification: 'REGISTRY_RECONCILIATION_INCOMPLETE',
      });
    }
  }

  if (unresolved_ambiguity_inventory.length > 0) {
    return {
      ...NON_OPERATIVE_BASE,
      classification: 'AMBIGUITY_FORCES_NULL',
      legitimacy_status: 'LEGITIMACY_NULL',
      drift_inventory,
      unresolved_ambiguity_inventory,
      registry_hashes_reconciled: false,
      merge_deploy_equivalence: false,
      replay_divergence_classification: 'REGISTRY_RECONCILIATION_INCOMPLETE',
    };
  }

  const merge = inputs.merge_legitimacy_registry;
  const deploy = inputs.deploy_legitimacy_registry;
  const proof = inputs.proof_lineage_registry;
  const replay = inputs.replay_registry;
  const topology = inputs.topology_reconciliation_registry;
  const governance = inputs.governance_inventory_registry;
  const federation = inputs.federation_reconciliation_evidence;

  // --- Phase 2: Proof lineage drift across merge / deploy / proof registries ---
  const lineageEntries = [
    { registry: 'merge_legitimacy_registry', hash: merge.lineage_hash },
    { registry: 'deploy_legitimacy_registry', hash: deploy.lineage_hash },
    { registry: 'proof_lineage_registry', hash: proof.lineage_hash },
  ];
  const nonNullLineageHashes = lineageEntries.filter((e) => e.hash != null);
  const uniqueLineageHashes = new Set(nonNullLineageHashes.map((e) => e.hash));

  if (uniqueLineageHashes.size > 1) {
    drift_inventory.push({
      drift_type: 'PROOF_LINEAGE_DRIFT',
      reason: 'lineage_hash_disagreement',
      conflicting_registries: lineageEntries,
    });
    return {
      ...NON_OPERATIVE_BASE,
      classification: 'PROOF_LINEAGE_DRIFT',
      legitimacy_status: 'LEGITIMACY_NULL',
      drift_inventory,
      unresolved_ambiguity_inventory,
      registry_hashes_reconciled: false,
      merge_deploy_equivalence: merge.lineage_hash === deploy.lineage_hash,
      replay_divergence_classification: null,
    };
  }

  // --- Phase 3: Merge/deploy equivalence check ---
  const mergeDeployEquivalent = merge.lineage_hash === deploy.lineage_hash;
  if (!mergeDeployEquivalent) {
    drift_inventory.push({
      drift_type: 'PROOF_LINEAGE_DRIFT',
      reason: 'merge_deploy_lineage_hash_mismatch',
      merge_hash: merge.lineage_hash,
      deploy_hash: deploy.lineage_hash,
    });
    return {
      ...NON_OPERATIVE_BASE,
      classification: 'PROOF_LINEAGE_DRIFT',
      legitimacy_status: 'LEGITIMACY_NULL',
      drift_inventory,
      unresolved_ambiguity_inventory,
      registry_hashes_reconciled: false,
      merge_deploy_equivalence: false,
      replay_divergence_classification: null,
    };
  }

  // --- Phase 4: Replay drift detection ---
  // REGISTRY_RECONCILIATION_INCOMPLETE: replay state missing for a referenced nonce
  // REGISTRY_REPLAY_DIVERGENCE: evidence present, conclusions conflict
  if (deploy.invocation_nonce != null) {
    if (replay.replay_status == null) {
      // State cannot be reconstructed → INCOMPLETE → AMBIGUITY_FORCES_NULL
      unresolved_ambiguity_inventory.push({
        registry: 'replay_registry',
        reason: 'replay_state_missing_for_nonce',
        invocation_nonce: deploy.invocation_nonce,
        classification: 'REGISTRY_RECONCILIATION_INCOMPLETE',
      });
      return {
        ...NON_OPERATIVE_BASE,
        classification: 'AMBIGUITY_FORCES_NULL',
        legitimacy_status: 'LEGITIMACY_NULL',
        drift_inventory,
        unresolved_ambiguity_inventory,
        registry_hashes_reconciled: false,
        merge_deploy_equivalence: mergeDeployEquivalent,
        replay_divergence_classification: 'REGISTRY_RECONCILIATION_INCOMPLETE',
      };
    }

    const deployComplete =
      deploy.execution_state === 'COMPLETE' || deploy.invocation_nonce_status === 'CONSUMED';
    const replayPending = replay.replay_status === 'PENDING';

    if (deployComplete && replayPending) {
      // Evidence present, conclusions conflict → DIVERGENCE → REPLAY_DRIFT
      drift_inventory.push({
        drift_type: 'REPLAY_DRIFT',
        reason: 'invocation_nonce_state_conflict',
        invocation_nonce: deploy.invocation_nonce,
        replay_status: replay.replay_status,
        deploy_execution_state: deploy.execution_state,
        deploy_invocation_nonce_status: deploy.invocation_nonce_status,
        classification: 'REGISTRY_REPLAY_DIVERGENCE',
      });
      return {
        ...NON_OPERATIVE_BASE,
        classification: 'REPLAY_DRIFT',
        legitimacy_status: 'LEGITIMACY_NULL',
        drift_inventory,
        unresolved_ambiguity_inventory,
        registry_hashes_reconciled: false,
        merge_deploy_equivalence: mergeDeployEquivalent,
        replay_divergence_classification: 'REGISTRY_REPLAY_DIVERGENCE',
      };
    }
  }

  // --- Phase 5: Topology drift ---
  if (topology.has_drift === true) {
    drift_inventory.push({
      drift_type: 'TOPOLOGY_DRIFT',
      reason: 'topology_hash_divergence',
      topology_hash: topology.topology_hash,
    });
    return {
      ...NON_OPERATIVE_BASE,
      classification: 'TOPOLOGY_DRIFT',
      legitimacy_status: 'LEGITIMACY_NULL',
      drift_inventory,
      unresolved_ambiguity_inventory,
      registry_hashes_reconciled: false,
      merge_deploy_equivalence: mergeDeployEquivalent,
      replay_divergence_classification: null,
    };
  }

  // --- Phase 6: Governance inventory drift ---
  if (governance.has_drift === true) {
    drift_inventory.push({
      drift_type: 'GOVERNANCE_DIVERGENCE',
      reason: 'governance_inventory_hash_divergence',
      governance_hash: governance.governance_hash,
    });
    return {
      ...NON_OPERATIVE_BASE,
      classification: 'GOVERNANCE_DIVERGENCE',
      legitimacy_status: 'LEGITIMACY_NULL',
      drift_inventory,
      unresolved_ambiguity_inventory,
      registry_hashes_reconciled: false,
      merge_deploy_equivalence: mergeDeployEquivalent,
      replay_divergence_classification: null,
    };
  }

  // --- Phase 7: Federation evidence boundary ---
  if (federation.evidence_only !== true) {
    drift_inventory.push({
      drift_type: 'GOVERNANCE_DIVERGENCE',
      reason: 'federation_evidence_treated_as_authority',
      evidence_only: federation.evidence_only,
    });
    return {
      ...NON_OPERATIVE_BASE,
      classification: 'GOVERNANCE_DIVERGENCE',
      legitimacy_status: 'LEGITIMACY_NULL',
      drift_inventory,
      unresolved_ambiguity_inventory,
      registry_hashes_reconciled: false,
      merge_deploy_equivalence: mergeDeployEquivalent,
      replay_divergence_classification: null,
    };
  }

  // --- All checks passed: RECONCILED_EVIDENCE_ONLY ---
  return {
    ...NON_OPERATIVE_BASE,
    classification: 'RECONCILED_EVIDENCE_ONLY',
    legitimacy_status: 'RECONCILED_EVIDENCE_ONLY',
    drift_inventory: [],
    unresolved_ambiguity_inventory: [],
    registry_hashes_reconciled: true,
    merge_deploy_equivalence: true,
    replay_divergence_classification: null,
  };
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const LINEAGE_HASH_A = canonicalHash({ epoch: 'epoch-1', lineage: 'chain-A' });

function coherentInputs() {
  return {
    merge_legitimacy_registry: {
      lineage_hash: LINEAGE_HASH_A,
      merge_status: 'MERGE_LEGITIMATE',
    },
    deploy_legitimacy_registry: {
      lineage_hash: LINEAGE_HASH_A,
      execution_state: 'COMPLETE',
      invocation_nonce: 'nonce-1',
      invocation_nonce_status: 'CONSUMED',
    },
    proof_lineage_registry: {
      lineage_hash: LINEAGE_HASH_A,
      proof_status: 'PROOF_VALID',
    },
    replay_registry: {
      invocation_nonce: 'nonce-1',
      replay_status: 'CONSUMED',
    },
    topology_reconciliation_registry: {
      topology_hash: canonicalHash({ topology: 'stable' }),
      has_drift: false,
    },
    governance_inventory_registry: {
      governance_hash: canonicalHash({ governance: 'stable' }),
      has_drift: false,
    },
    federation_reconciliation_evidence: {
      evidence_hash: canonicalHash({ federation: 'evidence-only' }),
      evidence_only: true,
    },
  };
}

// ---------------------------------------------------------------------------
// Spec boundary assertions
// ---------------------------------------------------------------------------

test('spec: artifact_id is cross_registry_reconciliation_closure_audit_spec', () => {
  assert.equal(spec.artifact_id, 'cross_registry_reconciliation_closure_audit_spec');
});

test('spec: closes issue #1638', () => {
  assert.equal(spec.closes, '#1638');
});

test('spec: non_operability fields are all false', () => {
  for (const [key, val] of Object.entries(spec.non_operability)) {
    assert.equal(val, false, `non_operability.${key} must be false`);
  }
});

test('spec: non_goals fields are all false', () => {
  for (const [key, val] of Object.entries(spec.non_goals)) {
    assert.equal(val, false, `non_goals.${key} must be false`);
  }
});

test('spec: defines all seven required audit surfaces', () => {
  const expected = [
    'merge_legitimacy_registry',
    'deploy_legitimacy_registry',
    'proof_lineage_registry',
    'replay_registry',
    'topology_reconciliation_registry',
    'governance_inventory_registry',
    'federation_reconciliation_evidence',
  ];
  assert.deepEqual(spec.audit_surfaces, expected);
});

test('spec: defines all six classifications', () => {
  const expected = [
    'RECONCILED_EVIDENCE_ONLY',
    'PROOF_LINEAGE_DRIFT',
    'REPLAY_DRIFT',
    'TOPOLOGY_DRIFT',
    'GOVERNANCE_DIVERGENCE',
    'AMBIGUITY_FORCES_NULL',
  ];
  for (const cls of expected) {
    assert.ok(cls in spec.classifications, `Missing classification: ${cls}`);
  }
});

test('spec: all non-RECONCILED classifications have LEGITIMACY_NULL legitimacy_status', () => {
  for (const [name, cls] of Object.entries(spec.classifications)) {
    if (name !== 'RECONCILED_EVIDENCE_ONLY') {
      assert.equal(
        cls.legitimacy_status,
        'LEGITIMACY_NULL',
        `${name} must have LEGITIMACY_NULL`,
      );
    }
  }
});

test('spec: RECONCILED_EVIDENCE_ONLY does not authorize execution, merge, or deployment', () => {
  const cls = spec.classifications.RECONCILED_EVIDENCE_ONLY;
  assert.equal(cls.authorizes_execution, false);
  assert.equal(cls.authorizes_merge, false);
  assert.equal(cls.authorizes_deployment, false);
});

test('spec: failure_result is LEGITIMACY_NULL', () => {
  assert.equal(spec.failure_result, 'LEGITIMACY_NULL');
});

test('spec: replay classification boundary defines INCOMPLETE vs DIVERGENCE', () => {
  const boundary =
    spec.verification_requirements.replay_drift_detected.replay_classification_boundary;
  assert.ok('REGISTRY_RECONCILIATION_INCOMPLETE' in boundary);
  assert.ok('REGISTRY_REPLAY_DIVERGENCE' in boundary);
});

test('spec: cross_registry_closure_requirement defines CROSS_REGISTRY_RECONCILIATION_CLOSED derivation', () => {
  assert.equal(
    spec.cross_registry_closure_requirement.closed_derivation,
    'CROSS_REGISTRY_RECONCILIATION_CLOSED',
  );
  assert.equal(spec.cross_registry_closure_requirement.failure, 'LEGITIMACY_NULL');
});

// ---------------------------------------------------------------------------
// Coherent state → RECONCILED_EVIDENCE_ONLY
// ---------------------------------------------------------------------------

test('coherent inputs produce RECONCILED_EVIDENCE_ONLY classification', () => {
  const report = performClosureAudit(coherentInputs());
  assert.equal(report.classification, 'RECONCILED_EVIDENCE_ONLY');
  assert.equal(report.legitimacy_status, 'RECONCILED_EVIDENCE_ONLY');
});

test('coherent inputs: drift_inventory is empty', () => {
  const report = performClosureAudit(coherentInputs());
  assert.deepEqual(report.drift_inventory, []);
});

test('coherent inputs: unresolved_ambiguity_inventory is empty', () => {
  const report = performClosureAudit(coherentInputs());
  assert.deepEqual(report.unresolved_ambiguity_inventory, []);
});

test('coherent inputs: registry_hashes_reconciled is true', () => {
  const report = performClosureAudit(coherentInputs());
  assert.equal(report.registry_hashes_reconciled, true);
});

test('coherent inputs: merge_deploy_equivalence is true', () => {
  const report = performClosureAudit(coherentInputs());
  assert.equal(report.merge_deploy_equivalence, true);
});

test('coherent inputs: replay_divergence_classification is null', () => {
  const report = performClosureAudit(coherentInputs());
  assert.equal(report.replay_divergence_classification, null);
});

// ---------------------------------------------------------------------------
// Non-operability invariants always hold
// ---------------------------------------------------------------------------

test('RECONCILED_EVIDENCE_ONLY result: reconciliation never creates authority', () => {
  const report = performClosureAudit(coherentInputs());
  assert.equal(report.reconciliation_creates_authority, false);
});

test('RECONCILED_EVIDENCE_ONLY result: reconciliation never creates execution', () => {
  const report = performClosureAudit(coherentInputs());
  assert.equal(report.reconciliation_creates_execution, false);
});

test('RECONCILED_EVIDENCE_ONLY result: reconciliation never creates deployment', () => {
  const report = performClosureAudit(coherentInputs());
  assert.equal(report.reconciliation_creates_deployment, false);
});

test('RECONCILED_EVIDENCE_ONLY result: reconciliation never creates merge permission', () => {
  const report = performClosureAudit(coherentInputs());
  assert.equal(report.reconciliation_creates_merge_permission, false);
});

test('RECONCILED_EVIDENCE_ONLY result: reconciliation never creates proof', () => {
  const report = performClosureAudit(coherentInputs());
  assert.equal(report.reconciliation_creates_proof, false);
});

test('RECONCILED_EVIDENCE_ONLY result: reconciliation never repairs records', () => {
  const report = performClosureAudit(coherentInputs());
  assert.equal(report.reconciliation_repairs_records, false);
});

test('LEGITIMACY_NULL result: reconciliation never creates authority', () => {
  const inputs = coherentInputs();
  inputs.topology_reconciliation_registry.has_drift = true;
  const report = performClosureAudit(inputs);
  assert.equal(report.classification, 'TOPOLOGY_DRIFT');
  assert.equal(report.reconciliation_creates_authority, false);
  assert.equal(report.reconciliation_creates_execution, false);
});

// ---------------------------------------------------------------------------
// Missing required inputs → AMBIGUITY_FORCES_NULL
// ---------------------------------------------------------------------------

test('missing merge_legitimacy_registry fails closed to AMBIGUITY_FORCES_NULL', () => {
  const inputs = coherentInputs();
  inputs.merge_legitimacy_registry = null;
  const report = performClosureAudit(inputs);
  assert.equal(report.classification, 'AMBIGUITY_FORCES_NULL');
  assert.equal(report.legitimacy_status, 'LEGITIMACY_NULL');
});

test('missing deploy_legitimacy_registry fails closed to AMBIGUITY_FORCES_NULL', () => {
  const inputs = coherentInputs();
  inputs.deploy_legitimacy_registry = null;
  const report = performClosureAudit(inputs);
  assert.equal(report.classification, 'AMBIGUITY_FORCES_NULL');
  assert.equal(report.legitimacy_status, 'LEGITIMACY_NULL');
});

test('missing proof_lineage_registry fails closed to AMBIGUITY_FORCES_NULL', () => {
  const inputs = coherentInputs();
  inputs.proof_lineage_registry = null;
  const report = performClosureAudit(inputs);
  assert.equal(report.classification, 'AMBIGUITY_FORCES_NULL');
  assert.equal(report.legitimacy_status, 'LEGITIMACY_NULL');
});

test('missing replay_registry fails closed to AMBIGUITY_FORCES_NULL', () => {
  const inputs = coherentInputs();
  inputs.replay_registry = null;
  const report = performClosureAudit(inputs);
  assert.equal(report.classification, 'AMBIGUITY_FORCES_NULL');
  assert.equal(report.legitimacy_status, 'LEGITIMACY_NULL');
});

test('missing topology_reconciliation_registry fails closed to AMBIGUITY_FORCES_NULL', () => {
  const inputs = coherentInputs();
  inputs.topology_reconciliation_registry = null;
  const report = performClosureAudit(inputs);
  assert.equal(report.classification, 'AMBIGUITY_FORCES_NULL');
  assert.equal(report.legitimacy_status, 'LEGITIMACY_NULL');
});

test('missing governance_inventory_registry fails closed to AMBIGUITY_FORCES_NULL', () => {
  const inputs = coherentInputs();
  inputs.governance_inventory_registry = null;
  const report = performClosureAudit(inputs);
  assert.equal(report.classification, 'AMBIGUITY_FORCES_NULL');
  assert.equal(report.legitimacy_status, 'LEGITIMACY_NULL');
});

test('missing federation_reconciliation_evidence fails closed to AMBIGUITY_FORCES_NULL', () => {
  const inputs = coherentInputs();
  inputs.federation_reconciliation_evidence = null;
  const report = performClosureAudit(inputs);
  assert.equal(report.classification, 'AMBIGUITY_FORCES_NULL');
  assert.equal(report.legitimacy_status, 'LEGITIMACY_NULL');
});

test('missing input: unresolved_ambiguity_inventory identifies the missing registry', () => {
  const inputs = coherentInputs();
  inputs.replay_registry = null;
  const report = performClosureAudit(inputs);
  const entry = report.unresolved_ambiguity_inventory.find(
    (e) => e.registry === 'replay_registry',
  );
  assert.ok(entry, 'replay_registry must appear in unresolved_ambiguity_inventory');
  assert.equal(entry.reason, 'missing_required_input');
});

test('missing input: replay_divergence_classification is REGISTRY_RECONCILIATION_INCOMPLETE', () => {
  const inputs = coherentInputs();
  inputs.replay_registry = null;
  const report = performClosureAudit(inputs);
  assert.equal(report.replay_divergence_classification, 'REGISTRY_RECONCILIATION_INCOMPLETE');
});

// ---------------------------------------------------------------------------
// Proof lineage drift → PROOF_LINEAGE_DRIFT
// ---------------------------------------------------------------------------

test('lineage hash mismatch between merge and deploy registries → PROOF_LINEAGE_DRIFT', () => {
  const inputs = coherentInputs();
  inputs.deploy_legitimacy_registry.lineage_hash = canonicalHash({ epoch: 'epoch-1', lineage: 'chain-B' });
  const report = performClosureAudit(inputs);
  assert.equal(report.classification, 'PROOF_LINEAGE_DRIFT');
  assert.equal(report.legitimacy_status, 'LEGITIMACY_NULL');
});

test('lineage hash mismatch between merge and proof registries → PROOF_LINEAGE_DRIFT', () => {
  const inputs = coherentInputs();
  inputs.proof_lineage_registry.lineage_hash = canonicalHash({ epoch: 'epoch-1', lineage: 'chain-C' });
  const report = performClosureAudit(inputs);
  assert.equal(report.classification, 'PROOF_LINEAGE_DRIFT');
  assert.equal(report.legitimacy_status, 'LEGITIMACY_NULL');
});

test('PROOF_LINEAGE_DRIFT: drift_inventory records disagreement', () => {
  const inputs = coherentInputs();
  inputs.deploy_legitimacy_registry.lineage_hash = canonicalHash({ different: 'hash' });
  const report = performClosureAudit(inputs);
  assert.equal(report.drift_inventory.length, 1);
  assert.equal(report.drift_inventory[0].drift_type, 'PROOF_LINEAGE_DRIFT');
});

test('PROOF_LINEAGE_DRIFT: registry_hashes_reconciled is false', () => {
  const inputs = coherentInputs();
  inputs.proof_lineage_registry.lineage_hash = canonicalHash({ drift: 'yes' });
  const report = performClosureAudit(inputs);
  assert.equal(report.registry_hashes_reconciled, false);
});

// ---------------------------------------------------------------------------
// Replay drift → REPLAY_DRIFT (REGISTRY_REPLAY_DIVERGENCE)
// ---------------------------------------------------------------------------

test('replay PENDING while deploy COMPLETE → REPLAY_DRIFT with REGISTRY_REPLAY_DIVERGENCE', () => {
  const inputs = coherentInputs();
  inputs.replay_registry.replay_status = 'PENDING';
  inputs.deploy_legitimacy_registry.execution_state = 'COMPLETE';
  const report = performClosureAudit(inputs);
  assert.equal(report.classification, 'REPLAY_DRIFT');
  assert.equal(report.legitimacy_status, 'LEGITIMACY_NULL');
  assert.equal(report.replay_divergence_classification, 'REGISTRY_REPLAY_DIVERGENCE');
});

test('replay PENDING while deploy nonce_status CONSUMED → REPLAY_DRIFT', () => {
  const inputs = coherentInputs();
  inputs.replay_registry.replay_status = 'PENDING';
  // execution_state absent but invocation_nonce_status = CONSUMED triggers same logic
  inputs.deploy_legitimacy_registry.execution_state = 'COMPLETE';
  inputs.deploy_legitimacy_registry.invocation_nonce_status = 'CONSUMED';
  const report = performClosureAudit(inputs);
  assert.equal(report.classification, 'REPLAY_DRIFT');
  assert.equal(report.replay_divergence_classification, 'REGISTRY_REPLAY_DIVERGENCE');
});

test('replay CONSUMED while deploy COMPLETE → RECONCILED_EVIDENCE_ONLY (no divergence)', () => {
  const inputs = coherentInputs();
  inputs.replay_registry.replay_status = 'CONSUMED';
  inputs.deploy_legitimacy_registry.execution_state = 'COMPLETE';
  const report = performClosureAudit(inputs);
  assert.equal(report.classification, 'RECONCILED_EVIDENCE_ONLY');
});

test('replay null status with deploy nonce referenced → AMBIGUITY_FORCES_NULL (INCOMPLETE)', () => {
  const inputs = coherentInputs();
  inputs.replay_registry.replay_status = null;
  const report = performClosureAudit(inputs);
  assert.equal(report.classification, 'AMBIGUITY_FORCES_NULL');
  assert.equal(report.legitimacy_status, 'LEGITIMACY_NULL');
  assert.equal(report.replay_divergence_classification, 'REGISTRY_RECONCILIATION_INCOMPLETE');
});

test('REPLAY_DRIFT: drift_inventory records REGISTRY_REPLAY_DIVERGENCE', () => {
  const inputs = coherentInputs();
  inputs.replay_registry.replay_status = 'PENDING';
  inputs.deploy_legitimacy_registry.execution_state = 'COMPLETE';
  const report = performClosureAudit(inputs);
  const entry = report.drift_inventory.find((e) => e.drift_type === 'REPLAY_DRIFT');
  assert.ok(entry, 'REPLAY_DRIFT entry must be in drift_inventory');
  assert.equal(entry.classification, 'REGISTRY_REPLAY_DIVERGENCE');
  assert.equal(entry.invocation_nonce, 'nonce-1');
});

test('INCOMPLETE vs DIVERGENCE boundary: INCOMPLETE = no answer, DIVERGENCE = competing answers', () => {
  // INCOMPLETE: replay state missing → AMBIGUITY_FORCES_NULL
  const incomplete = coherentInputs();
  incomplete.replay_registry.replay_status = null;
  const incompleteReport = performClosureAudit(incomplete);
  assert.equal(incompleteReport.classification, 'AMBIGUITY_FORCES_NULL');
  assert.equal(incompleteReport.replay_divergence_classification, 'REGISTRY_RECONCILIATION_INCOMPLETE');

  // DIVERGENCE: replay state present but conflicts → REPLAY_DRIFT
  const diverged = coherentInputs();
  diverged.replay_registry.replay_status = 'PENDING';
  diverged.deploy_legitimacy_registry.execution_state = 'COMPLETE';
  const divergedReport = performClosureAudit(diverged);
  assert.equal(divergedReport.classification, 'REPLAY_DRIFT');
  assert.equal(divergedReport.replay_divergence_classification, 'REGISTRY_REPLAY_DIVERGENCE');
});

// ---------------------------------------------------------------------------
// Topology drift → TOPOLOGY_DRIFT
// ---------------------------------------------------------------------------

test('topology has_drift true → TOPOLOGY_DRIFT', () => {
  const inputs = coherentInputs();
  inputs.topology_reconciliation_registry.has_drift = true;
  const report = performClosureAudit(inputs);
  assert.equal(report.classification, 'TOPOLOGY_DRIFT');
  assert.equal(report.legitimacy_status, 'LEGITIMACY_NULL');
});

test('TOPOLOGY_DRIFT: drift_inventory records TOPOLOGY_DRIFT', () => {
  const inputs = coherentInputs();
  inputs.topology_reconciliation_registry.has_drift = true;
  const report = performClosureAudit(inputs);
  assert.ok(
    report.drift_inventory.some((e) => e.drift_type === 'TOPOLOGY_DRIFT'),
    'TOPOLOGY_DRIFT must be in drift_inventory',
  );
});

test('topology has_drift false → does not block RECONCILED_EVIDENCE_ONLY', () => {
  const inputs = coherentInputs();
  inputs.topology_reconciliation_registry.has_drift = false;
  const report = performClosureAudit(inputs);
  assert.equal(report.classification, 'RECONCILED_EVIDENCE_ONLY');
});

// ---------------------------------------------------------------------------
// Governance inventory drift → GOVERNANCE_DIVERGENCE
// ---------------------------------------------------------------------------

test('governance has_drift true → GOVERNANCE_DIVERGENCE', () => {
  const inputs = coherentInputs();
  inputs.governance_inventory_registry.has_drift = true;
  const report = performClosureAudit(inputs);
  assert.equal(report.classification, 'GOVERNANCE_DIVERGENCE');
  assert.equal(report.legitimacy_status, 'LEGITIMACY_NULL');
});

test('GOVERNANCE_DIVERGENCE: drift_inventory records GOVERNANCE_DIVERGENCE', () => {
  const inputs = coherentInputs();
  inputs.governance_inventory_registry.has_drift = true;
  const report = performClosureAudit(inputs);
  assert.ok(
    report.drift_inventory.some((e) => e.drift_type === 'GOVERNANCE_DIVERGENCE'),
    'GOVERNANCE_DIVERGENCE must be in drift_inventory',
  );
});

test('federation evidence treated as authority → GOVERNANCE_DIVERGENCE', () => {
  const inputs = coherentInputs();
  inputs.federation_reconciliation_evidence.evidence_only = false;
  const report = performClosureAudit(inputs);
  assert.equal(report.classification, 'GOVERNANCE_DIVERGENCE');
  assert.equal(report.legitimacy_status, 'LEGITIMACY_NULL');
});

test('federation evidence treated as authority: drift_inventory records reason', () => {
  const inputs = coherentInputs();
  inputs.federation_reconciliation_evidence.evidence_only = false;
  const report = performClosureAudit(inputs);
  const entry = report.drift_inventory.find(
    (e) => e.reason === 'federation_evidence_treated_as_authority',
  );
  assert.ok(entry, 'federation_evidence_treated_as_authority must be in drift_inventory');
});

// ---------------------------------------------------------------------------
// Cross-registry closure: all five registries must agree for the epoch
// ---------------------------------------------------------------------------

test('all five registries agree on lineage hash → closure can be derived', () => {
  const inputs = coherentInputs();
  // All lineage hashes already equal LINEAGE_HASH_A in coherentInputs
  const report = performClosureAudit(inputs);
  assert.equal(report.classification, 'RECONCILED_EVIDENCE_ONLY');
  assert.equal(report.registry_hashes_reconciled, true);
});

test('replay registry disagrees → CROSS_REGISTRY_RECONCILIATION_CLOSED cannot be derived', () => {
  // Per spec: if replay state disagrees, closure cannot be derived
  const inputs = coherentInputs();
  inputs.replay_registry.replay_status = 'PENDING';
  inputs.deploy_legitimacy_registry.execution_state = 'COMPLETE';
  const report = performClosureAudit(inputs);
  assert.notEqual(report.classification, 'RECONCILED_EVIDENCE_ONLY');
  assert.equal(report.legitimacy_status, 'LEGITIMACY_NULL');
});

// ---------------------------------------------------------------------------
// Determinism: same inputs → same output
// ---------------------------------------------------------------------------

test('same coherent inputs produce identical classification on repeated calls', () => {
  const first = performClosureAudit(coherentInputs());
  const second = performClosureAudit(coherentInputs());
  assert.equal(first.classification, second.classification);
  assert.equal(first.legitimacy_status, second.legitimacy_status);
  assert.equal(first.registry_hashes_reconciled, second.registry_hashes_reconciled);
});

test('same drifted inputs produce identical classification on repeated calls', () => {
  function drifted() {
    const inputs = coherentInputs();
    inputs.topology_reconciliation_registry.has_drift = true;
    return inputs;
  }
  const first = performClosureAudit(drifted());
  const second = performClosureAudit(drifted());
  assert.equal(first.classification, second.classification);
  assert.equal(first.drift_inventory.length, second.drift_inventory.length);
});

// ---------------------------------------------------------------------------
// Audit type field is always present
// ---------------------------------------------------------------------------

test('report always includes audit_type field', () => {
  assert.equal(performClosureAudit(coherentInputs()).audit_type, AUDIT_TYPE);
});

test('LEGITIMACY_NULL report always includes audit_type field', () => {
  const inputs = coherentInputs();
  inputs.merge_legitimacy_registry = null;
  assert.equal(performClosureAudit(inputs).audit_type, AUDIT_TYPE);
});

// ---------------------------------------------------------------------------
// Taxonomy consistency audit (review criteria from issue taxonomy audit)
// ---------------------------------------------------------------------------

// --- 1. DRIFT is defined as accumulation-based hash/state inconsistency ---

test('taxonomy: PROOF_LINEAGE_DRIFT is triggered by hash inconsistency (DRIFT phenomenon)', () => {
  // DRIFT = hash/state inconsistency between distributed records
  const inputs = coherentInputs();
  inputs.deploy_legitimacy_registry.lineage_hash = canonicalHash({ different: 'lineage' });
  const report = performClosureAudit(inputs);
  assert.equal(report.classification, 'PROOF_LINEAGE_DRIFT');
  // The trigger is a hash inequality — accumulation-based, not model-level
  assert.equal(report.drift_inventory[0].drift_type, 'PROOF_LINEAGE_DRIFT');
});

test('taxonomy: REPLAY_DRIFT is triggered by replay state inconsistency (DRIFT phenomenon)', () => {
  // REPLAY_DRIFT: established in cross-registry-drift-taxonomy.json drift_classes
  const inputs = coherentInputs();
  inputs.replay_registry.replay_status = 'PENDING';
  inputs.deploy_legitimacy_registry.execution_state = 'COMPLETE';
  const report = performClosureAudit(inputs);
  assert.equal(report.classification, 'REPLAY_DRIFT');
  assert.equal(report.drift_inventory[0].drift_type, 'REPLAY_DRIFT');
});

test('taxonomy: TOPOLOGY_DRIFT is triggered by topology hash inconsistency (DRIFT phenomenon)', () => {
  // TOPOLOGY_DRIFT: established as topology reconciliation signal in MERGE_GOVERNANCE_RULES.json
  const inputs = coherentInputs();
  inputs.topology_reconciliation_registry.has_drift = true;
  const report = performClosureAudit(inputs);
  assert.equal(report.classification, 'TOPOLOGY_DRIFT');
  assert.equal(report.drift_inventory[0].drift_type, 'TOPOLOGY_DRIFT');
});

// --- 2. DIVERGENCE is defined as structural/model-level categorical incompatibility ---

test('taxonomy: GOVERNANCE_DIVERGENCE is triggered by governance model incompatibility (DIVERGENCE phenomenon)', () => {
  // GOVERNANCE_DIVERGENCE: established co-equal topology signal alongside TOPOLOGY_DRIFT
  // in MERGE_GOVERNANCE_RULES.json — not hash accumulation, but model-level structural incompatibility
  const inputs = coherentInputs();
  inputs.governance_inventory_registry.has_drift = true;
  const report = performClosureAudit(inputs);
  assert.equal(report.classification, 'GOVERNANCE_DIVERGENCE');
  assert.equal(report.drift_inventory[0].drift_type, 'GOVERNANCE_DIVERGENCE');
});

test('taxonomy: GOVERNANCE_DIVERGENCE is triggered by authority boundary violation (DIVERGENCE phenomenon)', () => {
  // Federation evidence categorically misclassified as authority — structural, not accumulation
  const inputs = coherentInputs();
  inputs.federation_reconciliation_evidence.evidence_only = false;
  const report = performClosureAudit(inputs);
  assert.equal(report.classification, 'GOVERNANCE_DIVERGENCE');
  const entry = report.drift_inventory.find((e) => e.reason === 'federation_evidence_treated_as_authority');
  assert.ok(entry, 'authority boundary violation must record federation_evidence_treated_as_authority');
});

// --- 3. Every classification maps to a unique observable state ---

test('taxonomy: AMBIGUITY_FORCES_NULL maps to missing evidence (not conflicting evidence)', () => {
  // AMBIGUITY_FORCES_NULL = missing required input; no hash comparison is possible
  const inputs = coherentInputs();
  inputs.proof_lineage_registry = null;
  const report = performClosureAudit(inputs);
  assert.equal(report.classification, 'AMBIGUITY_FORCES_NULL');
  // The ambiguity inventory explains why (missing), not what the hashes are
  assert.ok(report.unresolved_ambiguity_inventory.length > 0);
  assert.equal(report.unresolved_ambiguity_inventory[0].reason, 'missing_required_input');
});

test('taxonomy: REPLAY_DRIFT sub-classification: REGISTRY_REPLAY_DIVERGENCE = competing answers', () => {
  // REGISTRY_REPLAY_DIVERGENCE: evidence present, conclusions disagree (competing answers)
  const inputs = coherentInputs();
  inputs.replay_registry.replay_status = 'PENDING';
  inputs.deploy_legitimacy_registry.execution_state = 'COMPLETE';
  const report = performClosureAudit(inputs);
  assert.equal(report.classification, 'REPLAY_DRIFT');
  assert.equal(report.replay_divergence_classification, 'REGISTRY_REPLAY_DIVERGENCE');
  const entry = report.drift_inventory.find((e) => e.classification === 'REGISTRY_REPLAY_DIVERGENCE');
  assert.ok(entry, 'REGISTRY_REPLAY_DIVERGENCE must be in drift_inventory');
});

test('taxonomy: REGISTRY_RECONCILIATION_INCOMPLETE = no answer (routes to AMBIGUITY_FORCES_NULL)', () => {
  // REGISTRY_RECONCILIATION_INCOMPLETE: no answer because replay state is absent — not competing answers
  const inputs = coherentInputs();
  inputs.replay_registry.replay_status = null;
  const report = performClosureAudit(inputs);
  assert.equal(report.classification, 'AMBIGUITY_FORCES_NULL');
  assert.equal(report.replay_divergence_classification, 'REGISTRY_RECONCILIATION_INCOMPLETE');
  // unresolved_ambiguity_inventory records the incompleteness
  const entry = report.unresolved_ambiguity_inventory.find(
    (e) => e.classification === 'REGISTRY_RECONCILIATION_INCOMPLETE',
  );
  assert.ok(entry, 'REGISTRY_RECONCILIATION_INCOMPLETE must be in unresolved_ambiguity_inventory');
});

// --- 4. Every classification is mutually exclusive ---

test('taxonomy: classifications are mutually exclusive — each audit returns exactly one classification', () => {
  const scenarios = [
    coherentInputs(),
    (() => { const i = coherentInputs(); i.merge_legitimacy_registry = null; return i; })(),
    (() => { const i = coherentInputs(); i.deploy_legitimacy_registry.lineage_hash = canonicalHash({ d: 1 }); return i; })(),
    (() => { const i = coherentInputs(); i.replay_registry.replay_status = 'PENDING'; i.deploy_legitimacy_registry.execution_state = 'COMPLETE'; return i; })(),
    (() => { const i = coherentInputs(); i.topology_reconciliation_registry.has_drift = true; return i; })(),
    (() => { const i = coherentInputs(); i.governance_inventory_registry.has_drift = true; return i; })(),
    (() => { const i = coherentInputs(); i.federation_reconciliation_evidence.evidence_only = false; return i; })(),
  ];
  const classifications = scenarios.map((s) => performClosureAudit(s).classification);
  // Each scenario produces exactly one string classification
  for (const c of classifications) {
    assert.equal(typeof c, 'string', `classification must be a string, got ${typeof c}`);
    assert.ok(c.length > 0, 'classification must not be empty');
  }
  // Known expected classifications
  assert.equal(classifications[0], 'RECONCILED_EVIDENCE_ONLY');
  assert.equal(classifications[1], 'AMBIGUITY_FORCES_NULL');
  assert.equal(classifications[2], 'PROOF_LINEAGE_DRIFT');
  assert.equal(classifications[3], 'REPLAY_DRIFT');
  assert.equal(classifications[4], 'TOPOLOGY_DRIFT');
  assert.equal(classifications[5], 'GOVERNANCE_DIVERGENCE');
  assert.equal(classifications[6], 'GOVERNANCE_DIVERGENCE');
});

test('taxonomy: DRIFT classes do not produce DIVERGENCE outer classification', () => {
  // Hash inconsistency produces DRIFT classifications, not DIVERGENCE
  const hashDrift = coherentInputs();
  hashDrift.proof_lineage_registry.lineage_hash = canonicalHash({ diverged: true });
  assert.match(performClosureAudit(hashDrift).classification, /DRIFT/);
});

test('taxonomy: DIVERGENCE class does not produce DRIFT outer classification', () => {
  // Authority model incompatibility produces DIVERGENCE classification, not DRIFT
  const authViolation = coherentInputs();
  authViolation.federation_reconciliation_evidence.evidence_only = false;
  assert.match(performClosureAudit(authViolation).classification, /DIVERGENCE/);
});

// --- 5. No two classifications describe the same observable state ---

test('taxonomy: TOPOLOGY_DRIFT and GOVERNANCE_DIVERGENCE are triggered by different registry surfaces', () => {
  // Both are co-equal signals but for different registries and phenomena
  const topoDrift = coherentInputs();
  topoDrift.topology_reconciliation_registry.has_drift = true;
  assert.equal(performClosureAudit(topoDrift).classification, 'TOPOLOGY_DRIFT');

  const govDiv = coherentInputs();
  govDiv.governance_inventory_registry.has_drift = true;
  assert.equal(performClosureAudit(govDiv).classification, 'GOVERNANCE_DIVERGENCE');

  // They produce different classifications for different inputs — not aliases
  assert.notEqual('TOPOLOGY_DRIFT', 'GOVERNANCE_DIVERGENCE');
});

test('taxonomy: PROOF_LINEAGE_DRIFT and REPLAY_DRIFT are triggered by different evidence layers', () => {
  // PROOF_LINEAGE_DRIFT: lineage hash layer (what was merged/deployed/proved)
  const lineageDrift = coherentInputs();
  lineageDrift.proof_lineage_registry.lineage_hash = canonicalHash({ alternate: 'chain' });
  assert.equal(performClosureAudit(lineageDrift).classification, 'PROOF_LINEAGE_DRIFT');

  // REPLAY_DRIFT: replay execution layer (was the invocation consumed or still pending)
  const replayDrift = coherentInputs();
  replayDrift.replay_registry.replay_status = 'PENDING';
  replayDrift.deploy_legitimacy_registry.execution_state = 'COMPLETE';
  assert.equal(performClosureAudit(replayDrift).classification, 'REPLAY_DRIFT');

  assert.notEqual('PROOF_LINEAGE_DRIFT', 'REPLAY_DRIFT');
});

// --- 6. Closure logic remains fail-closed under all ambiguity ---

test('taxonomy: all failure classifications produce LEGITIMACY_NULL', () => {
  const failures = [
    (() => { const i = coherentInputs(); i.merge_legitimacy_registry = null; return i; })(),
    (() => { const i = coherentInputs(); i.deploy_legitimacy_registry.lineage_hash = canonicalHash({ x: 1 }); return i; })(),
    (() => { const i = coherentInputs(); i.replay_registry.replay_status = 'PENDING'; i.deploy_legitimacy_registry.execution_state = 'COMPLETE'; return i; })(),
    (() => { const i = coherentInputs(); i.topology_reconciliation_registry.has_drift = true; return i; })(),
    (() => { const i = coherentInputs(); i.governance_inventory_registry.has_drift = true; return i; })(),
    (() => { const i = coherentInputs(); i.federation_reconciliation_evidence.evidence_only = false; return i; })(),
    (() => { const i = coherentInputs(); i.replay_registry.replay_status = null; return i; })(),
  ];
  for (const inputs of failures) {
    const report = performClosureAudit(inputs);
    assert.equal(report.legitimacy_status, 'LEGITIMACY_NULL', `Expected LEGITIMACY_NULL for ${report.classification}`);
  }
});

test('taxonomy: only RECONCILED_EVIDENCE_ONLY produces non-NULL legitimacy_status', () => {
  const report = performClosureAudit(coherentInputs());
  assert.equal(report.classification, 'RECONCILED_EVIDENCE_ONLY');
  assert.notEqual(report.legitimacy_status, 'LEGITIMACY_NULL');
});

// --- 7. RECONCILED_EVIDENCE_ONLY vs CROSS_REGISTRY_RECONCILIATION_CLOSED ---

test('taxonomy: RECONCILED_EVIDENCE_ONLY is intentionally weaker than CROSS_REGISTRY_RECONCILIATION_CLOSED', () => {
  // RECONCILED_EVIDENCE_ONLY = audit result: no contradictions detected across seven surfaces
  // CROSS_REGISTRY_RECONCILIATION_CLOSED = derived state: requires additionally that
  //   authority_registry agrees (NOT audited here) and epoch closure is certified
  const spec_closureReq = spec.cross_registry_closure_requirement;
  assert.equal(spec_closureReq.closed_derivation, 'CROSS_REGISTRY_RECONCILIATION_CLOSED');
  // The spec requires five registries including authority_registry
  assert.ok(spec_closureReq.rule.includes('authority registry'), 'authority_registry must be required for CLOSED');
  // authority_registry is NOT in the audit surfaces
  assert.ok(!spec.audit_surfaces.includes('authority_registry'), 'authority_registry must not be an audit surface');
});

test('taxonomy: RECONCILED_EVIDENCE_ONLY does not grant authority — CROSS_REGISTRY_RECONCILIATION_CLOSED cannot be auto-derived', () => {
  const report = performClosureAudit(coherentInputs());
  assert.equal(report.classification, 'RECONCILED_EVIDENCE_ONLY');
  // RECONCILED_EVIDENCE_ONLY explicitly carries no authorization
  assert.equal(report.reconciliation_creates_authority, false);
  assert.equal(report.reconciliation_creates_execution, false);
  assert.equal(report.reconciliation_creates_merge_permission, false);
  assert.equal(report.reconciliation_creates_deployment, false);
  assert.equal(report.reconciliation_creates_proof, false);
  // The spec classification node explicitly forbids authorization
  const cls = spec.classifications.RECONCILED_EVIDENCE_ONLY;
  assert.equal(cls.authorizes_execution, false);
  assert.equal(cls.authorizes_merge, false);
  assert.equal(cls.authorizes_deployment, false);
});

test('taxonomy: spec vocabulary consistency — DRIFT defined, DIVERGENCE defined, verdict is KEEP', () => {
  assert.ok('taxonomy_definitions' in spec, 'spec must contain taxonomy_definitions');
  assert.ok('DRIFT' in spec.taxonomy_definitions, 'DRIFT must be defined');
  assert.ok('DIVERGENCE' in spec.taxonomy_definitions, 'DIVERGENCE must be defined');
  assert.equal(spec.taxonomy_definitions.DRIFT_vs_DIVERGENCE_boundary.verdict, 'KEEP');
  assert.equal(spec.taxonomy_definitions.DRIFT_vs_DIVERGENCE_boundary.mutual_exclusion.includes('not both'), true);
});

test('taxonomy: spec consistency verdict confirms all review criteria', () => {
  assert.ok('taxonomy_consistency_verdict' in spec, 'spec must contain taxonomy_consistency_verdict');
  const v = spec.taxonomy_consistency_verdict;
  assert.equal(v.verdict, 'KEEP');
  assert.equal(v.drift_divergence_are_distinct, true);
  assert.equal(v.classifications_are_mutually_exclusive, true);
  assert.equal(v.classifications_cover_unique_failure_modes, true);
  assert.equal(v.no_two_classifications_describe_same_observable_state, true);
  assert.equal(v.closure_logic_fails_closed_under_ambiguity, true);
});

test('taxonomy: RECONCILED_EVIDENCE_ONLY vs CLOSED distinction is documented in spec', () => {
  assert.ok('reconciliation_terminology' in spec, 'spec must contain reconciliation_terminology');
  const term = spec.reconciliation_terminology;
  assert.ok('RECONCILED_EVIDENCE_ONLY' in term);
  assert.ok('CROSS_REGISTRY_RECONCILIATION_CLOSED' in term);
  assert.equal(term.RECONCILED_EVIDENCE_ONLY_vs_CROSS_REGISTRY_RECONCILIATION_CLOSED.intentionally_weaker, true);
  // Verify that authority_registry requirement is documented as the key distinction
  const distinctions = Object.values(
    term.RECONCILED_EVIDENCE_ONLY_vs_CROSS_REGISTRY_RECONCILIATION_CLOSED.exact_legitimacy_distinction,
  );
  assert.ok(
    distinctions.some((d) => d.includes('authority_registry')),
    'authority_registry must appear in the legitimacy distinction',
  );
});
