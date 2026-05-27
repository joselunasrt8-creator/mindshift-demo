// Legitimacy Topology Visualization — Neo4j Queries
// Issue #1425 — Install-Base Dependency Dashboard v1
//
// Status: NON_OPERATIVE, OBSERVABILITY_ONLY, NO_RUNTIME_MUTATION
// Boundary: Neo4j state is observability state only.
// Invariant: topology visibility ≠ legitimacy; visualization ≠ authority.
//
// These queries project legitimacy topology for the Install-Base Dependency
// Dashboard v1. All outputs are evidence-only and produce no authority,
// proof, execution, or mutation effects.

// -----------------------------------------------------------------------------
// 1. Full legitimacy surface topology
// All execution surfaces with their sovereignty and governance labels.
// -----------------------------------------------------------------------------
MATCH (s:ExecutionSurface)
RETURN
  s.id AS surface_id,
  s.path AS path,
  s.sovereignty_tier AS sovereignty_tier,
  s.runtime_authority AS runtime_authority,
  s.mode AS mode,
  s.labels AS labels
ORDER BY s.path;

// -----------------------------------------------------------------------------
// 2. Canonical execution chain topology
// Route declarations across the seven-step canonical chain.
// -----------------------------------------------------------------------------
MATCH (file:File)-[:GRAPH_EDGE {type: "DECLARES"}]->(route:RuntimeRoute)
WHERE route.route IN ['/session','/continuity','/authority','/compile','/validate','/execute','/proof']
RETURN
  route.route AS chain_step,
  file.path AS declaring_file,
  route.declared AS declared,
  route.schema_bound AS schema_bound
ORDER BY chain_step, file.path;

// -----------------------------------------------------------------------------
// 3. Governance dependency topology
// Governance artifacts and their dependency relationships.
// -----------------------------------------------------------------------------
MATCH p = (gov:GovernanceObject)-[:GRAPH_EDGE]->(dep)
RETURN
  gov.id AS governance_id,
  gov.path AS governance_path,
  labels(dep) AS dependency_labels,
  dep.id AS dependency_id,
  dep.path AS dependency_path
ORDER BY governance_path;

// -----------------------------------------------------------------------------
// 4. Topology drift map
// Identifies topology nodes carrying a drift classification.
// -----------------------------------------------------------------------------
MATCH (n:GraphNode)
WHERE n.drift_class IS NOT NULL
RETURN
  n.id AS node_id,
  n.path AS path,
  n.drift_class AS drift_class,
  labels(n) AS node_labels
ORDER BY n.drift_class, n.path;

// -----------------------------------------------------------------------------
// 5. Replay topology
// Execution surfaces with replay-relevant state annotations.
// -----------------------------------------------------------------------------
MATCH (s:ExecutionSurface)
WHERE s.replay_status IS NOT NULL
RETURN
  s.id AS surface_id,
  s.path AS path,
  s.replay_status AS replay_status,
  s.sovereignty_tier AS sovereignty_tier
ORDER BY s.replay_status, s.path;

// -----------------------------------------------------------------------------
// 6. Proof topology
// File-to-proof chains and any missing-proof gaps.
// -----------------------------------------------------------------------------
// Covered proofs
MATCH p = (file:File)-[:GRAPH_EDGE {type: "PRODUCES_PROOF"}]->(proof:Proof)
RETURN
  file.path AS file_path,
  proof.id AS proof_id,
  proof.proof_type AS proof_type
ORDER BY file_path;

// Missing proof: execution surfaces without associated proof
MATCH (s:ExecutionSurface)
WHERE NOT (s)-[:GRAPH_EDGE {type: "PRODUCES_PROOF"}]->(:Proof)
RETURN
  s.id AS surface_id,
  s.path AS path,
  s.sovereignty_tier AS sovereignty_tier
ORDER BY s.path;

// -----------------------------------------------------------------------------
// 7. Legitimacy surface closure map topology
// Full closure state per surface, with reasoning path.
// -----------------------------------------------------------------------------
MATCH (s:ExecutionSurface)
OPTIONAL MATCH (gap:SovereigntyGap)-[:GRAPH_EDGE {type: "APPLIES_TO"}]->(s)
RETURN
  s.id AS surface_id,
  s.path AS path,
  s.sovereignty_tier AS sovereignty_tier,
  CASE
    WHEN s.sovereignty_tier IN ['S0','S1'] THEN 'CLOSED'
    WHEN s.sovereignty_tier IN ['S2','S3'] THEN 'OPEN_GAP'
    ELSE 'UNKNOWN'
  END AS closure_state,
  gap.risk_class AS gap_risk_class,
  gap.required_action AS required_action
ORDER BY closure_state, s.sovereignty_tier, s.path;

// -----------------------------------------------------------------------------
// 8. Install-base full dependency traversal (bounded depth)
// Traverses all install-base dependency edges up to depth 6.
// -----------------------------------------------------------------------------
MATCH path = (root:GraphNode)-[:GRAPH_EDGE*1..6]->(dep:GraphNode)
WHERE ALL(rel IN relationships(path) WHERE rel.type IN [
  'VALIDATION_DEPENDENCY',
  'WORKFLOW_GOVERNANCE_DEPENDENCY',
  'PROOF_DEPENDENCY',
  'FEDERATION_EVIDENCE_DEPENDENCY',
  'GOVERNED_EXECUTION_DEPENDENCY',
  'CONTINUITY_DEPENDENCY',
  'RECONCILIATION_DEPENDENCY'
])
RETURN
  root.id AS root_node,
  dep.id AS dependency_node,
  length(path) AS traversal_depth,
  [rel IN relationships(path) | rel.type] AS dependency_chain
ORDER BY traversal_depth ASC, root.id;

// -----------------------------------------------------------------------------
// 9. Observability boundary verification
// Must return no records — confirms topology has no runtime authority or
// non-observability-only nodes.
// -----------------------------------------------------------------------------
MATCH (n:GraphNode)
WHERE n.runtime_authority <> false
   OR n.mode <> 'observability_only'
RETURN n.id AS node_id, n.runtime_authority, n.mode;
// Expected result: no records.

// -----------------------------------------------------------------------------
// 10. Federation evidence topology
// Federation nodes with evidence-only constraints verified.
// -----------------------------------------------------------------------------
MATCH (fed:GraphNode)
WHERE 'FederationNode' IN labels(fed) OR fed.federation_evidence_only = true
RETURN
  fed.id AS federation_node_id,
  fed.path AS path,
  fed.evidence_only AS evidence_only,
  fed.sovereignty_tier AS sovereignty_tier
ORDER BY fed.path;
