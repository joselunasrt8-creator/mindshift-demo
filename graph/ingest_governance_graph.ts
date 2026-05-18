import fs from "fs"
import path from "path"

type Node = {
  id: string
  type: string
  source: string
}

type Edge = {
  from: string
  to: string
  relation: string
}

const GOVERNANCE_DIR = path.join(process.cwd(), "governance")
const OUTPUT_DIR = path.join(process.cwd(), "graph/output")

const nodesMap = new Map<string, Node>()
const edges: Edge[] = []

function addNode(id: string, type: string, source: string) {
  nodesMap.set(id, {
    id,
    type,
    source
  })
}

function addEdge(from: string, to: string, relation: string) {
  edges.push({
    from,
    to,
    relation
  })
}

function ingestGovernanceArtifacts() {
  if (!fs.existsSync(GOVERNANCE_DIR)) {
    console.error("governance directory missing")
    process.exit(1)
  }

  const files = fs
    .readdirSync(GOVERNANCE_DIR)
    .filter(file => file.endsWith(".json"))

  for (const file of files) {
    const fullPath = path.join(GOVERNANCE_DIR, file)

    const raw = fs.readFileSync(fullPath, "utf8")

    const parsed = JSON.parse(raw)

    const artifactId =
      parsed.artifact ||
      file.replace(".json", "")

    addNode(
      artifactId,
      "governance_artifact",
      file
    )

    if (parsed.status) {
      addNode(
        parsed.status,
        "governance_status",
        file
      )

      addEdge(
        artifactId,
        parsed.status,
        "HAS_STATUS"
      )
    }

    if (parsed.invariant) {
      addNode(
        parsed.invariant,
        "constitutional_invariant",
        file
      )

      addEdge(
        artifactId,
        parsed.invariant,
        "ENFORCES"
      )
    }

    if (Array.isArray(parsed.authority_classes)) {
      for (const authority of parsed.authority_classes) {
        addNode(
          authority,
          "authority_class",
          file
        )

        addEdge(
          artifactId,
          authority,
          "DEFINES"
        )
      }
    }

    if (Array.isArray(parsed.assumption_classes)) {
      for (const assumption of parsed.assumption_classes) {
        addNode(
          assumption,
          "continuity_assumption",
          file
        )

        addEdge(
          artifactId,
          assumption,
          "ASSUMES"
        )
      }
    }
  }
}

function persist() {
  fs.mkdirSync(OUTPUT_DIR, {
    recursive: true
  })

  fs.writeFileSync(
    path.join(
      OUTPUT_DIR,
      "governance_nodes.json"
    ),
    JSON.stringify(
      Array.from(nodesMap.values()),
      null,
      2
    )
  )

  fs.writeFileSync(
    path.join(
      OUTPUT_DIR,
      "governance_edges.json"
    ),
    JSON.stringify(edges, null, 2)
  )
}

ingestGovernanceArtifacts()

persist()

console.log(
  "governance topology generated"
)
