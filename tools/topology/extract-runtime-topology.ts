type NodeType =
  | "SESSION"
  | "CONTINUITY"
  | "AUTHORITY"
  | "ATAO"
  | "AEO"
  | "VALIDATION"
  | "EXECUTION"
  | "PROOF"
  | "REGISTRY";

type EdgeType =
  | "COMPILES_TO"
  | "VALIDATES"
  | "EXECUTES"
  | "PROVES"
  | "PERSISTS"
  | "DEPENDS_ON";

interface TopologyNode {
  id: string;
  type: NodeType;
}

interface TopologyEdge {
  from: string;
  to: string;
  type: EdgeType;
}

interface RuntimeTopology {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
}

const topology: RuntimeTopology = {
  nodes: [],
  edges: [],
};

console.log(JSON.stringify(topology, null, 2));
