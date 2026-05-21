# Passive Legitimacy Observability Layer (PLOL)

## 1) Highest-leverage observability layer

**Layer:** Passive Legitimacy Topology Ledger (PLTL) rendered as a read-only graph projection over existing governance registries.

This is a **derived observability layer**, not a new execution component. It builds a deterministic, append-only visibility index from already-persisted canonical events in the runtime path:

`/session → /continuity → /authority → /compile → /validate → /execute → /proof`

The index is materialized only for GET-time analysis (or offline batch export), never read by mutating routes, never consulted for permission checks.

## 2) Why it matters structurally

The runtime already enforces legitimacy; the missing leverage is *global visibility* of legitimacy state across install base and dependency boundaries.

PLTL increases structural confidence by making these questions answerable without touching execution semantics:

- Where closure is stable vs drifting.
- Which authorities are producing blocked, invalid, or quarantined outcomes by topology segment.
- Whether proof continuity remains intact across distributed surfaces.
- Whether replay/revocation signals are accumulating in specific lineage corridors.

This converts isolated evidence into deterministic topology evidence while preserving fail-closed behavior.

## 3) Exact entities/registries involved

No new authority-bearing entities are introduced. PLTL consumes existing persisted evidence and emits read-only derived nodes/edges.

### Source registries (authoritative inputs)

- `session_registry`
- `continuity_registry`
- `authority_registry`
- `compile_registry` (AEO/IR lineage)
- `validate_registry`
- `execute_registry`
- `proof_registry`
- replay-protection registries/indexes
- revocation/quarantine registries where present
- cross-registry reconciliation closure registries

### Derived observability entities (non-authoritative)

- `InstallBase`
- `GovernanceClosureSnapshot`
- `LegitimacyPath`
- `LineageSegment`
- `ProofContinuitySegment`
- `ReplayObservation`
- `RevocationObservation`
- `FreshnessWindow`
- `ReconciliationObservation`

All derived entities include immutable provenance pointers back to canonical registry rows/hashes.

## 4) Passive data flow only

1. Read canonical registry deltas (append-only).
2. Deterministically project to topology tuples.
3. Persist projection in observability-only store (or in-memory export artifact).
4. Serve only via GET evidence routes or offline graph artifacts.

**Hard boundaries:**

- No write-back into execution registries.
- No callback into `/authority`, `/compile`, `/validate`, `/execute`, `/proof`.
- No runtime branch may consume PLTL outputs for allow/deny.
- On projection failure: emit deterministic `NULL_OBSERVATION` evidence, never fallback authority.

## 5) Suggested graph/topology representation

Property graph (or adjacency ledger) keyed by canonical hashes.

### Node types

- `InstallBaseNode`
- `SessionNode`
- `ContinuityNode`
- `AuthorityNode`
- `CompiledObjectNode`
- `ValidationNode`
- `ExecutionNode`
- `ProofNode`
- `ClosureNode`
- `ReplayNode`
- `RevocationNode`

### Edge types

- `INITIATED`
- `CONTINUES_AS`
- `AUTHORIZED_AS`
- `COMPILED_TO`
- `VALIDATED_AS`
- `EXECUTED_AS`
- `PROVEN_BY`
- `RECONCILED_WITH`
- `REVOKED_BY`
- `REPLAY_BLOCKED_BY`
- `FRESH_WITHIN`
- `CLOSED_AS`

All edges are directional and timestamped; identity is `(source_hash, edge_type, target_hash, observed_at)`.

## 6) Suggested telemetry metrics

Install-base and topology-first, all passive:

- **Legitimacy Path Completion Rate**: `% of paths reaching proof after validate=VALID`.
- **Closure Stability Ratio**: `stable_closure / total_closure_snapshots`.
- **Freshness Drift Index**: age distribution of latest proof per lineage corridor.
- **Replay Block Density**: replay blocks per 1k authority attempts by scope.
- **Revocation Propagation Lag**: time from revocation record to first observed blocked lineage reuse.
- **Proof Continuity Gap Count**: count of validate/execute tuples missing linked proof within SLA window.
- **Distributed Reconciliation Disagreement Rate**: cross-registry hash mismatch rate.
- **Topology Centrality Risk**: concentration of governance dependence on small authority subsets.
- **NULL/INVALID/BLOCKED/QUARANTINED Surface Ratio** by route-stage and install segment.

## 7) Required invariants

1. **Observability never grants authority.**
2. **Projection is replay-neutral and non-mutating.**
3. **validated_object == executed_object remains externally observable and unverletable.**
4. **Fail-closed semantics preserved:** missing evidence yields deterministic null-class observation only.
5. **Exact-object discipline preserved:** no object transformation in projection path.
6. **No side-channel escalation:** telemetry cannot influence permission state.
7. **Append-only provenance:** derived records link to immutable source evidence.
8. **Deterministic recomputation:** identical source registry state yields identical topology projection.

## 8) Explicit non-goals

- Not an execution coordinator.
- Not an authority oracle.
- Not a fallback validator.
- Not a policy override channel.
- Not a deploy automation surface.
- Not a mutation API.
- Not a speculative prediction engine.

## 9) Minimal implementation surface

1. Add a read-only projection module (`src/observability/topology_projection.ts`) that maps canonical records to graph tuples.
2. Add GET-only export/inspection endpoint(s) under existing observability namespace (no new mutating route family).
3. Add deterministic metric aggregation job/script for install-base snapshots.
4. Add docs for topology schema + invariants + operational read patterns.

No changes to canonical mutation routes and no policy/runtime execution branching changes.

## 10) Classification

- **OBSERVABILITY_ONLY**
- **NON_EXECUTABLE**
- **PASSIVE_MONITORING**
- **TOPOLOGY_ONLY**
- **GOVERNANCE_LEDGER**
