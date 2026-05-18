<<<<<<< HEAD
cat > graph/ingest_runtime_graph.ts <<'EOF'
import fs from "fs"
=======
import fs from "fs"
import path from "path"
>>>>>>> 0c327e2 (Bootstrap runtime legitimacy graph ingestion)

type Node = {
  id: string
  type: string
<<<<<<< HEAD
  classification: string
  executable: boolean
=======
>>>>>>> 0c327e2 (Bootstrap runtime legitimacy graph ingestion)
}

type Edge = {
  from: string
  to: string
<<<<<<< HEAD
  type: string
}

const nodes: Node[] = [
  {
    id: "/session",
    type: "Route",
    classification: "SESSION_ESTABLISHMENT",
    executable: false
  },
  {
    id: "/continuity",
    type: "Route",
    classification: "CONTINUITY_BINDING",
    executable: false
  },
  {
    id: "/authority",
    type: "Route",
    classification: "AUTHORITY_ISSUANCE",
    executable: false
  },
  {
    id: "/compile",
    type: "Route",
    classification: "AEO_COMPILATION",
    executable: false
  },
  {
    id: "/validate",
    type: "Route",
    classification: "VALIDATION_BOUNDARY",
    executable: false
  },
  {
    id: "/execute",
    type: "Route",
    classification: "EXECUTION_BOUNDARY",
    executable: true
  },
  {
    id: "/proof",
    type: "Route",
    classification: "PROOF_PERSISTENCE",
    executable: false
  }
]

const edges: Edge[] = [
  {
    from: "/session",
    to: "/continuity",
    type: "NEXT"
  },
  {
    from: "/continuity",
    to: "/authority",
    type: "NEXT"
  },
  {
    from: "/authority",
    to: "/compile",
    type: "NEXT"
  },
  {
    from: "/compile",
    to: "/validate",
    type: "NEXT"
  },
  {
    from: "/validate",
    to: "/execute",
    type: "NEXT"
  },
  {
    from: "/execute",
    to: "/proof",
    type: "NEXT"
  }
]

const topology = {
  artifact: "RUNTIME_TOPOLOGY",
  status: "NON_OPERATIVE",
  authority_creating: false,
  execution_authorizing: false,
  runtime_mutating: false,
  nodes,
  edges,
  invariant:
    "no valid lineage -> no valid execution -> no valid proof"
}

fs.mkdirSync("graph", { recursive: true })

fs.writeFileSync(
  "graph/runtime_topology.json",
  JSON.stringify(topology, null, 2)
)

console.log("runtime topology generated")
EOF
=======
  relation: string
}

const nodesMap = new Map<string, Node>()
const edges: Edge[] = []

const ROUTES_DIR = path.join(process.cwd(), "src")

function addNode(id: string, type: string) {
  nodesMap.set(id, { id, type })
}

function addEdge(from: string, to: string, relation: string) {
  edges.push({ from, to, relation })
}

function ingestRoutes() {
  if (!fs.existsSync(ROUTES_DIR)) {
    console.error("routes directory missing")
    process.exit(1)
  }

  const files = fs.readdirSync(ROUTES_DIR)

  for (const file of files) {
    const full = path.join(ROUTES_DIR, file)

    if (!fs.statSync(full).isFile()) {
      continue
    }

    const routeName = file
      .replace(/\.(ts|js)$/, "")
      .replace(/^index$/, "runtime")

    addNode(routeName, "runtime_route")
  }

  addEdge("authority", "compile", "feeds")
  addEdge("compile", "validate", "feeds")
  addEdge("validate", "execute", "feeds")
  addEdge("execute", "proof", "feeds")
}

function persist() {
  const outputDir = path.join(process.cwd(), "graph/output")

  fs.mkdirSync(outputDir, { recursive: true })

  fs.writeFileSync(
    path.join(outputDir, "runtime_nodes.json"),
    JSON.stringify(Array.from(nodesMap.values()), null, 2)
  )

  fs.writeFileSync(
    path.join(outputDir, "runtime_edges.json"),
    JSON.stringify(edges, null, 2)
  )
}

ingestRoutes()
persist()

console.log("runtime topology generated")
>>>>>>> 0c327e2 (Bootstrap runtime legitimacy graph ingestion)
