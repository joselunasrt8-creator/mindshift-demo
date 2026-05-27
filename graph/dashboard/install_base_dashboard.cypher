// Install-Base Dependency Dashboard — Neo4j Queries
// Issue #1425 — Install-Base Dependency Dashboard v1
//
// Status: NON_OPERATIVE, OBSERVABILITY_ONLY, NO_RUNTIME_MUTATION
// Boundary: Neo4j state is observability state only.
// Invariant: observability ≠ authority; visibility ≠ legitimacy.
//
// These queries feed the dashboard panels. They are read-only and produce
// no authority, proof, or execution effects.

// -----------------------------------------------------------------------------
// Panel 1: Governed Execution Metrics
// Counts governed vs. ungoverned execution surfaces and their validation state.
// -----------------------------------------------------------------------------
MATCH (s:ExecutionSurface)
RETURN
  count(CASE WHEN s.sovereignty_tier IN ['S0','S1'] THEN 1 END) AS governed_surface_count,
  count(CASE WHEN s.sovereignty_tier IN ['S2','S3'] THEN 1 END) AS ungoverned_surface_count,
  count(CASE WHEN s.validation_status = 'success' THEN 1 END) AS validation_success_count,
  count(CASE WHEN s.validation_status = 'failure' THEN 1 END) AS validation_failure_count,
  count(CASE WHEN s.proof_persisted = true THEN 1 END) AS proof_persistence_count;

// -----------------------------------------------------------------------------
// Panel 2: Replay Rejection Visibility
// Surfaces any execution surfaces observed with replay-rejected state.
// -----------------------------------------------------------------------------
MATCH (s:ExecutionSurface)
WHERE s.replay_status IN ['REJECTED', 'RESURRECTION_DETECTED']
RETURN
  s.id AS surface_id,
  s.path AS path,
  s.replay_status AS replay_status,
  s.sovereignty_tier AS sovereignty_tier
ORDER BY s.path;

// Aggregate replay counts
MATCH (s:ExecutionSurface)
RETURN
  count(CASE WHEN s.replay_status = 'REJECTED' THEN 1 END) AS replay_rejection_count,
  count(CASE WHEN s.replay_status = 'RESURRECTION_DETECTED' THEN 1 END) AS replay_resurrection_count;

// -----------------------------------------------------------------------------
// Panel 3: Proof Lineage Visualization
// Traverses file-to-proof edges and returns the full proof lineage topology.
// -----------------------------------------------------------------------------
MATCH path = (file:File)-[:GRAPH_EDGE {type: "PRODUCES_PROOF"}]->(proof:Proof)
RETURN
  file.path AS source_file,
  proof.id AS proof_id,
  proof.proof_type AS proof_type,
  length(path) AS lineage_depth
ORDER BY source_file;

// Canonical chain coverage
MATCH (route:RuntimeRoute)
WHERE route.route IN ['/session','/continuity','/authority','/compile','/validate','/execute','/proof']
RETURN
  route.route AS chain_step,
  route.declared AS declared,
  route.schema_bound AS schema_bound,
  count(route) AS occurrences
ORDER BY chain_step;

// -----------------------------------------------------------------------------
// Panel 4: Continuity Lineage Graphs
// Detects gaps in the /session → /proof canonical chain.
// -----------------------------------------------------------------------------
MATCH (file:File)-[:GRAPH_EDGE {type: "DECLARES"}]->(route:RuntimeRoute)
WHERE route.route IN ['/session','/continuity','/authority','/compile','/validate','/execute','/proof']
RETURN
  route.route AS chain_step,
  collect(file.path) AS declaring_files,
  count(file) AS file_count
ORDER BY chain_step;

// Gap detection: canonical steps with no declaring files
UNWIND ['/session','/continuity','/authority','/compile','/validate','/execute','/proof'] AS step
OPTIONAL MATCH (file:File)-[:GRAPH_EDGE {type: "DECLARES"}]->(route:RuntimeRoute {route: step})
WITH step, count(file) AS file_count
WHERE file_count = 0
RETURN step AS gap_position, file_count;

// -----------------------------------------------------------------------------
// Panel 5: Reconciliation Status
// Aggregates sovereignty gaps and their reconciliation state.
// -----------------------------------------------------------------------------
MATCH (gap:SovereigntyGap)
RETURN
  gap.sovereignty_tier AS tier,
  gap.risk_class AS risk_class,
  gap.required_action AS required_action,
  count(gap) AS gap_count
ORDER BY tier, risk_class;

// Reconciliation drift and quarantine counts
MATCH (gap:SovereigntyGap)
RETURN
  count(CASE WHEN gap.risk_class =~ '(?i).*drift.*' THEN 1 END) AS drift_count,
  count(CASE WHEN gap.required_action =~ '(?i).*quarantine.*' THEN 1 END) AS quarantine_count,
  count(CASE WHEN gap.sovereignty_tier = 'S3' THEN 1 END) AS open_gap_count,
  count(CASE WHEN gap.sovereignty_tier = 'S2' THEN 1 END) AS contained_gap_count;

// -----------------------------------------------------------------------------
// Panel 6: Distributed Disagreement Tracking
// Surfaces any topology nodes with disagreement or split-brain indicators.
// -----------------------------------------------------------------------------
MATCH (n:GraphNode)
WHERE n.disagreement_detected = true
   OR n.split_brain = true
   OR n.causal_divergence = true
   OR n.topology_drift = true
RETURN
  n.id AS node_id,
  n.path AS path,
  labels(n) AS node_labels,
  n.disagreement_detected AS disagreement_detected,
  n.split_brain AS split_brain,
  n.causal_divergence AS causal_divergence,
  n.topology_drift AS topology_drift
ORDER BY n.path;

// Aggregate disagreement counts
MATCH (n:GraphNode)
RETURN
  count(CASE WHEN n.disagreement_detected = true THEN 1 END) AS distributed_disagreement_count,
  count(CASE WHEN n.split_brain = true THEN 1 END) AS split_brain_count,
  count(CASE WHEN n.causal_divergence = true THEN 1 END) AS causal_divergence_count,
  count(CASE WHEN n.topology_drift = true THEN 1 END) AS topology_drift_count;

// -----------------------------------------------------------------------------
// Panel 7: Topology Dependency Graphs
// Full install-base dependency topology: nodes and edges.
// -----------------------------------------------------------------------------
MATCH (n:GraphNode)-[e:GRAPH_EDGE]->(m:GraphNode)
WHERE e.type IN [
  'VALIDATION_DEPENDENCY',
  'WORKFLOW_GOVERNANCE_DEPENDENCY',
  'PROOF_DEPENDENCY',
  'FEDERATION_EVIDENCE_DEPENDENCY',
  'GOVERNED_EXECUTION_DEPENDENCY',
  'CONTINUITY_DEPENDENCY',
  'RECONCILIATION_DEPENDENCY'
]
RETURN
  n.id AS from_node,
  labels(n) AS from_labels,
  e.type AS edge_type,
  m.id AS to_node,
  labels(m) AS to_labels
ORDER BY e.type, n.id;

// Install-base signal: sum of dependency classification counts
MATCH (n:GraphNode)-[e:GRAPH_EDGE]->(m:GraphNode)
WHERE e.type IN [
  'VALIDATION_DEPENDENCY',
  'WORKFLOW_GOVERNANCE_DEPENDENCY',
  'PROOF_DEPENDENCY',
  'FEDERATION_EVIDENCE_DEPENDENCY',
  'GOVERNED_EXECUTION_DEPENDENCY',
  'CONTINUITY_DEPENDENCY',
  'RECONCILIATION_DEPENDENCY'
]
RETURN e.type AS dependency_type, count(e) AS dependency_count
ORDER BY dependency_type;

// -----------------------------------------------------------------------------
// Panel 8: Legitimacy Surface Closure Maps
// Surfaces with their sovereignty tiers and closure state.
// -----------------------------------------------------------------------------
MATCH (s:ExecutionSurface)
RETURN
  s.id AS surface_id,
  s.path AS path,
  s.sovereignty_tier AS sovereignty_tier,
  CASE
    WHEN s.sovereignty_tier IN ['S0','S1'] THEN 'CLOSED'
    WHEN s.sovereignty_tier IN ['S2','S3'] THEN 'OPEN_GAP'
    ELSE 'UNKNOWN'
  END AS closure_state
ORDER BY s.sovereignty_tier, s.path;

// Closure summary
MATCH (s:ExecutionSurface)
RETURN
  count(s) AS total_surface_count,
  count(CASE WHEN s.sovereignty_tier IN ['S0','S1'] THEN 1 END) AS closed_count,
  count(CASE WHEN s.sovereignty_tier IN ['S2','S3'] THEN 1 END) AS open_gap_count;

// Observability boundary audit — must return no records
MATCH (n:GraphNode)
WHERE n.runtime_authority <> false
   OR n.mode <> 'observability_only'
RETURN n;
// Expected result: no records.
