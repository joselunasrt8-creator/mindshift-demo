import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type NodeType = "ROUTE"|"REGISTRY"|"VALIDATOR"|"EXECUTION_SURFACE"|"PROOF_SURFACE"|"REPLAY_SURFACE"|"AUTHORITY_SURFACE"|"CONTINUITY_SURFACE"|"RECONCILIATION_SURFACE"|"FINALITY_SURFACE"|"PARTITION_SURFACE"|"WORKFLOW_SURFACE"|"MODULE"|"TEST"|"DOC";
type Closure = "OPEN"|"PARTIAL"|"CONTAINED"|"CLOSED"|"BREAK_GLASS";
type Relation = "CALLS"|"VALIDATES"|"WRITES_PROOF"|"CONSUMES_NONCE"|"DEPENDS_ON_AUTHORITY"|"DEPENDS_ON_CONTINUITY"|"RECONCILES_WITH"|"CLASSIFIES_FINALITY"|"MUTATES_STATE"|"REFERENCES_REGISTRY"|"REFERENCES_PROOF"|"REFERENCES_REPLAY"|"REFERENCES_PARTITION"|"REFERENCES_WORKFLOW";

interface TopologyNode { id:string; type:NodeType; label:string; file_path:string; symbol:string; evidence:string; mutation_capable:boolean; authority_bound:boolean; continuity_bound:boolean; validator_bound:boolean; replay_safe:boolean; proof_generating:boolean; topology_visible:boolean; closure_status:Closure; }
interface TopologyEdge { from:string; to:string; relation:Relation; evidence:string; file_path:string }

const ROOTS = ["src","runtime","graph","docs","tests",".github/workflows","migrations","scripts"];
const nodeMap = new Map<string, TopologyNode>();
const edges: TopologyEdge[] = [];

function walk(dir: string, out: string[]) { try { for (const e of readdirSync(dir)) { const p = join(dir, e); const s = statSync(p); if (s.isDirectory()) walk(p, out); else out.push(p); } } catch {} }
function rel(p: string){ return p.replace(/^\.\//,""); }
function inferType(p:string,t:string):NodeType{ if (p.includes(".github/workflows")) return "WORKFLOW_SURFACE"; if (t.includes("/proof")||t.includes("proof_registry")) return "PROOF_SURFACE"; if (t.includes("replay")) return "REPLAY_SURFACE"; if (t.includes("/authority")||t.includes("authority")) return "AUTHORITY_SURFACE"; if (t.includes("/continuity")||t.includes("continuity")) return "CONTINUITY_SURFACE"; if (t.includes("validate")||t.includes("validator")) return "VALIDATOR"; if (t.includes("registry")) return "REGISTRY"; if (t.includes("reconcil")) return "RECONCILIATION_SURFACE"; if (t.includes("finality")) return "FINALITY_SURFACE"; if (t.includes("partition")) return "PARTITION_SURFACE"; if (t.includes("/execute")||t.includes("deploy")) return "EXECUTION_SURFACE"; if (t.includes("/session")||t.includes("/compile")) return "ROUTE"; if (p.includes("tests/")) return "TEST"; if (p.endsWith(".md")) return "DOC"; return "MODULE"; }
function closure(n: Omit<TopologyNode,"closure_status">):Closure{ if (n.mutation_capable && !(n.authority_bound && n.validator_bound)) return "OPEN"; if (n.authority_bound && n.validator_bound && n.continuity_bound && n.replay_safe && (n.proof_generating || !n.mutation_capable)) return "CLOSED"; if (n.authority_bound || n.validator_bound || n.continuity_bound) return "CONTAINED"; return "PARTIAL"; }

for (const root of ROOTS){ const files:string[]=[]; walk(root, files); for (const f of files){ if (!/\.(ts|js|mjs|json|md|yml|yaml|sql)$/.test(f)) continue; const text = readFileSync(f,"utf8"); const mutation = /\b(INSERT|UPDATE|DELETE|POST\s+"\/(session|continuity|authority|compile|validate|execute|proof)|\/execute|\/proof)\b/i.test(text);
const n0 = { id:`node:${rel(f)}`, type: inferType(f,text.toLowerCase()), label: rel(f), file_path: rel(f), symbol: "file", evidence: text.slice(0,160).replace(/\s+/g," "), mutation_capable: mutation, authority_bound: /authority/.test(text), continuity_bound: /continuity/.test(text), validator_bound: /validate|validator/.test(text), replay_safe: /replay/.test(text), proof_generating: /proof/.test(text), topology_visible: /topology|graph|observability/.test(text) };
const node:TopologyNode = { ...n0, closure_status: closure(n0) }; nodeMap.set(node.id,node);
if (/authority/.test(text)) edges.push({from:node.id,to:"logical:authority",relation:"DEPENDS_ON_AUTHORITY",evidence:"authority keyword",file_path:rel(f)});
if (/continuity/.test(text)) edges.push({from:node.id,to:"logical:continuity",relation:"DEPENDS_ON_CONTINUITY",evidence:"continuity keyword",file_path:rel(f)});
if (/validate|validator/.test(text)) edges.push({from:node.id,to:"logical:validator",relation:"VALIDATES",evidence:"validator keyword",file_path:rel(f)});
if (/proof/.test(text)) edges.push({from:node.id,to:"logical:proof",relation:"WRITES_PROOF",evidence:"proof keyword",file_path:rel(f)});
if (/replay/.test(text)) edges.push({from:node.id,to:"logical:replay",relation:"REFERENCES_REPLAY",evidence:"replay keyword",file_path:rel(f)});
if (/workflow/.test(text)) edges.push({from:node.id,to:"logical:workflow",relation:"REFERENCES_WORKFLOW",evidence:"workflow keyword",file_path:rel(f)});
if (/registry/.test(text)) edges.push({from:node.id,to:"logical:registry",relation:"REFERENCES_REGISTRY",evidence:"registry keyword",file_path:rel(f)});
if (/partition/.test(text)) edges.push({from:node.id,to:"logical:partition",relation:"REFERENCES_PARTITION",evidence:"partition keyword",file_path:rel(f)});
if (mutation) edges.push({from:node.id,to:"logical:mutation",relation:"MUTATES_STATE",evidence:"mutation pattern",file_path:rel(f)});
}}

const nodes = [...nodeMap.values()];
const counts: Record<Closure, number> = { OPEN:0, PARTIAL:0, CONTAINED:0, CLOSED:0, BREAK_GLASS:0 };
for (const n of nodes) counts[n.closure_status]++;
const out = { generated_at:new Date().toISOString(), repository:"joselunasrt8-creator/mindshift-demo", nodes, edges, summary:{ node_count:nodes.length, edge_count:edges.length, closure_status_counts: counts } };
writeFileSync("graph/runtime-topology.sample.json", JSON.stringify(out,null,2));
console.log(`wrote graph/runtime-topology.sample.json with ${nodes.length} nodes`);
