// Observational-only ingest for Runtime Topology Intelligence v1
// Usage in Neo4j Browser with parameter $topology set to runtime-topology.sample.json content.

UNWIND $topology.nodes AS n
MERGE (r:RuntimeNode {id: n.id})
SET r += {
  type: n.type,
  label: n.label,
  file_path: n.file_path,
  symbol: n.symbol,
  evidence: n.evidence,
  mutation_capable: n.mutation_capable,
  authority_bound: n.authority_bound,
  continuity_bound: n.continuity_bound,
  validator_bound: n.validator_bound,
  replay_safe: n.replay_safe,
  proof_generating: n.proof_generating,
  topology_visible: n.topology_visible,
  closure_status: n.closure_status
};

UNWIND $topology.nodes AS n
WITH n
CALL {
  WITH n
  WITH n WHERE n.mutation_capable = true
  MERGE (:MutationSurface {id: n.id})
  RETURN 0 AS _
}
RETURN count(*) AS loaded_nodes;

UNWIND $topology.nodes AS n
WITH n
CALL {
  WITH n WHERE n.type = 'REGISTRY' MERGE (:Registry {id: n.id}) RETURN 0
  UNION WITH n WHERE n.type = 'VALIDATOR' MERGE (:Validator {id: n.id}) RETURN 0
  UNION WITH n WHERE n.type = 'PROOF_SURFACE' MERGE (:ProofSurface {id: n.id}) RETURN 0
  UNION WITH n WHERE n.type = 'AUTHORITY_SURFACE' MERGE (:AuthoritySurface {id: n.id}) RETURN 0
  UNION WITH n WHERE n.type = 'CONTINUITY_SURFACE' MERGE (:ContinuitySurface {id: n.id}) RETURN 0
  UNION WITH n WHERE n.type = 'REPLAY_SURFACE' MERGE (:ReplaySurface {id: n.id}) RETURN 0
  UNION WITH n WHERE n.type = 'RECONCILIATION_SURFACE' MERGE (:ReconciliationSurface {id: n.id}) RETURN 0
  UNION WITH n WHERE n.type = 'FINALITY_SURFACE' MERGE (:FinalitySurface {id: n.id}) RETURN 0
  UNION WITH n WHERE n.type = 'PARTITION_SURFACE' MERGE (:PartitionSurface {id: n.id}) RETURN 0
  UNION WITH n WHERE n.type = 'WORKFLOW_SURFACE' MERGE (:WorkflowSurface {id: n.id}) RETURN 0
}
RETURN count(*) AS typed_labels;

UNWIND $topology.edges AS e
MERGE (src:RuntimeNode {id: e.from})
MERGE (dst:RuntimeNode {id: e.to})
MERGE (src)-[rel:RuntimeEdge {relation: e.relation, file_path: e.file_path, evidence: e.evidence}]->(dst);
