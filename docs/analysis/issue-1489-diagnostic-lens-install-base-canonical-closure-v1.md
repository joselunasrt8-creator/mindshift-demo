# Issue #1489 — Diagnostic Lens → Install-Base Expansion → Canonical Closure Protocol v1

Status: **Non-operative planning artifact**  
Scope: **Topology/planning only (MODE B)**  
Constraint posture: **No runtime enforcement changes, no authority mutation, no deployment implication**

## Intent, Scope, and Invariant Guardrails

### Intent
Formalize the lifecycle where visible legitimacy gaps become operational dependencies and, under repeated convergence, compress into reusable but non-operative canon.

### Exact scope
- Define descriptive models for diagnostic lens, install-base expansion, canonical closure, cooldown compression, failure taxonomy, lifecycle sequencing, operational implications, and canonical invariants.
- Produce planning guidance for future schema/test/runtime governance reviews.

### Preserved invariants
- `validated_object == executed_object`
- If no valid object exists → nothing happens.
- Proposal ≠ authority.
- Capability ≠ permission.
- Visibility ≠ legitimacy.
- No valid continuity lineage → no valid authority → no valid execution.
- `VALID ∧ AUTHORIZED ∧ UNUSED ∧ POLICY_VALID ∧ REPLAY_SAFE ∧ TOPOLOGY_VISIBLE ∧ RECONCILABLE`, else `NULL`.

### Mutation-capable surfaces identified (planning view)
- Schema definitions for validity/authorization/replay/topology predicates.
- Conformance vectors for lineage, replay, and topology visibility.
- Runtime execution boundaries (auth checks, continuity checks, replay locks).

### Replay implications
- Any future operative mapping must preserve object identity and one-time-use lineage semantics.
- Canon artifacts remain replay-descriptive until explicitly bound by governance review.

### Proof requirements (future operative conversion)
- Deterministic conformance vectors showing invariant preservation.
- Traceable lineage proof from validation object to execution object.
- Explicit non-regression coverage for replay and topology visibility.

### Validation requirements (future operative conversion)
- Schema review, test review, and runtime review must each independently confirm invariant preservation.
- Governance sign-off is required before any canon-to-enforcement binding.

### Unresolved ambiguity (intentionally retained)
- Threshold criteria for when recurring convergence is “sufficiently stable” to promote canon candidate status.

---

## 1) Diagnostic Lens Model

### 1.1 Legitimacy-gap detection
A legitimacy gap is detected when a mutation-capable action path exists but required legitimacy predicates are absent, unverifiable, or non-reconcilable.

Detection signals:
- Capability signal present (code path can execute).
- Legitimacy signal missing (authorization, continuity, policy, replay safety, or topology visibility absent).
- Reconciliation signal unresolved (cannot prove compatibility with prior lineage).

### 1.2 Capability vs legitimacy distinction
- **Capability**: “Can this action be technically performed?”
- **Legitimacy**: “Should this action be considered valid under continuity, authority, policy, replay, and topology constraints?”

Rule: capability can pre-exist legitimacy; legitimacy cannot be inferred from capability.

### 1.3 Authority gap classification
- **A0 — Missing authority object**: no authority artifact exists.
- **A1 — Unbound authority**: authority artifact exists but not tied to valid continuity lineage.
- **A2 — Ambiguous authority scope**: scope exceeds or mismatches declared intent.
- **A3 — Stale authority lineage**: authority exists but lineage is non-current or non-reconcilable.

### 1.4 Replay-risk classification
- **R0 — Deterministically unused**: object guaranteed unused.
- **R1 — Uncertain reuse state**: usage status cannot be proven.
- **R2 — Observable duplicate risk**: object or token may be replayed.
- **R3 — Confirmed replay contamination**: duplicate execution lineage exists.

### 1.5 Topology visibility analysis
Evaluate whether the dependency graph of mutation paths, authority propagation, and reconciliation sinks is observable enough to evaluate legitimacy predicates.

Visibility dimensions:
- Path visibility (what can execute).
- Dependency visibility (what must exist first).
- Boundary visibility (where authority or policy transitions occur).
- Reconciliation visibility (where state can be compared and settled).

### 1.6 Cognition-governance detection
Detect points where distributed human/system interpretation creates effective governance norms before formal policy codification (e.g., repeated review gates, recurring rejection patterns, de facto sequencing expectations).

### 1.7 Execution-boundary ambiguity detection
Flag boundaries where:
- validation and execution objects may diverge,
- authority checks are implicit rather than explicit,
- replay prevention is assumed rather than proven.

---

## 2) Install-Base Expansion Model

Install-base expansion occurs when teams repeatedly depend on legitimacy-preserving pathways to reduce coordination cost and incident risk.

### 2.1 Dependency layers
- **Workflow dependency**: teams depend on common sequence/order to ship safely.
- **Governance dependency**: teams depend on shared legitimacy criteria for acceptance.
- **Execution dependency**: systems depend on upstream validated artifacts before mutation.
- **Legitimacy dependency**: organizational trust depends on traceable proof of valid action.

### 2.2 Operational necessity loops
Loop pattern:
1. Gap causes incident risk or coordination drag.
2. Team introduces compensating verification behavior.
3. Behavior repeats across contexts.
4. Repetition becomes expected prerequisite.
5. Prerequisite becomes install-base norm.

### 2.3 Infrastructure gravity formation
Repeated dependence on legitimacy-preserving primitives (lineage checks, replay classification, topology mapping) creates “gravity”: adjacent workflows adopt these primitives because bypassing them increases uncertainty and reconciliation cost.

---

## 3) Canonical Closure Model

### 3.1 Convergence detection
Convergence is detected when independent actors repeatedly choose equivalent governance-preserving patterns under similar constraints.

### 3.2 Invariant extraction
From converged behavior, extract minimal invariants that explain successful legitimacy outcomes without overfitting to one team or one runtime.

### 3.3 Bounded canon formation
Canon candidate must be:
- narrow in scope,
- explicit in predicates,
- traceable to recurring evidence,
- separated from direct runtime enforcement.

### 3.4 Replay-safe canonization
Canon text must preserve one-time-use, lineage continuity, and exact-object discipline semantics and prohibit ambiguity in object identity.

### 3.5 Topology-aware canon integration
Canon should annotate where in the topology each invariant applies (intake, continuity, authority, validate, execute, proof), and where it explicitly does not apply.

### 3.6 Non-operative canon boundaries
Canon remains descriptive until explicit governance binding occurs via schema/test/runtime review and operative enforcement review.

---

## 4) Cooldown Phase Compression

Cooldown phase emphasizes structural clarity over immediate mutation.

- **Coordination bottleneck**: as actor count grows, disagreement about legitimacy criteria dominates raw implementation time.
- **Topology mapping importance**: unseen dependency edges create hidden invalidation and authority bleed.
- **Replay analysis intensification**: scale increases duplicate-path probability and delayed retry ambiguity.
- **Canon compression necessity**: teams need compact shared rules to avoid bespoke re-litigation.
- **Mutation-surface classification emergence**: safe scaling requires explicit map of where state mutation can happen and under what legitimacy predicates.

---

## 5) Failure Taxonomy

- **Ontology fragmentation**: competing definitions of validity/authority cause incompatible acceptance decisions.
- **Hidden mutation surfaces**: untracked state-changing paths bypass legitimacy checks.
- **Replay ambiguity**: inability to prove unused status before execution.
- **Authority contamination**: authority artifacts reused outside declared lineage/scope.
- **Stale lineage propagation**: old continuity chains accepted as current truth.
- **Topology opacity**: missing graph visibility prevents trustworthy reconciliation.
- **Canon drift**: canon semantics broaden or mutate without bounded review.
- **Legitimacy collapse under scaling**: throughput pressure rewards capability-first shortcuts over legitimacy proof.

---

## 6) Protocol Lifecycle

Formal lifecycle (non-operative):

1. **Signal intake** — collect anomalies, friction, incidents, and repeated review objections.
2. **Convergence detection** — identify recurring governance-preserving responses.
3. **Legitimacy-gap extraction** — isolate missing predicates, boundaries, or proofs.
4. **Dependency formation** — map workflow/governance/execution/legitimacy dependencies.
5. **Install-base pressure** — document where repeated usage creates operational expectation.
6. **Bounded issue decomposition** — split into narrow, topology-visible issue units.
7. **Canon candidate** — draft invariant-centric, scope-bounded candidate artifact.
8. **Non-operative artifact** — maintain planning-only status; no runtime semantic change.
9. **Schema/test/runtime review** — evaluate precision, verifiability, and non-regression.
10. **Operative enforcement review** — separate governance decision on whether and how to bind.

---

## 7) Operational Implications

- **Install-base growth dynamics**: successful legitimacy-preserving patterns spread because they reduce failed reconciliation and rollback overhead.
- **Infrastructure dependency formation**: lineage/replay/topology instrumentation shifts from optional tooling to required substrate.
- **Governance-driven adoption**: adoption is accelerated by review and risk controls, not only by developer convenience.
- **Legitimacy as operational necessity**: legitimacy checks become throughput enablers by lowering cross-team dispute and incident frequency.
- **Distributed cognition governance emergence**: repeated multi-actor interpretation crystallizes into shared governance behavior before formal codification.

---

## 8) Canonical Invariants (Preservation Set)

1. If no valid object exists → nothing happens.
2. Proposal ≠ authority.
3. Capability ≠ permission.
4. Visibility ≠ legitimacy.
5. `validated_object == executed_object`.
6. No valid continuity lineage → no valid authority → no valid execution.
7. Required predicate conjunction:

```text
VALID
∧ AUTHORIZED
∧ UNUSED
∧ POLICY_VALID
∧ REPLAY_SAFE
∧ TOPOLOGY_VISIBLE
∧ RECONCILABLE
Else → NULL
```

Interpretation boundary: this set is canon-preserving and non-operative until explicit binding.

---

## 9) Suggested Artifact Targets

- **Canon docs**: bounded invariant references for lifecycle stages and boundaries.
- **Issue decomposition**: narrow tickets per legitimacy gap and topology segment.
- **Conformance surfaces**: deterministic vectors for lineage, replay, and object identity.
- **Replay classifications**: standard taxonomy (R0–R3) attached to mutation-capable flows.
- **Topology intelligence layers**: maps for authority propagation, mutation edges, reconciliation points.
- **Cognition governance extensions**: documentation of recurring human/system settlement patterns.

---

## 10) Final Compression

### Strategic interpretation
This protocol prevents capability-led drift by forcing visibility of legitimacy deficits before mutation pressure converts them into systemic risk.

### Infrastructure interpretation
It converts legitimacy from abstract policy into explicit dependency primitives (lineage, replay safety, topology visibility, reconciliation).

### Install-base interpretation
Repeated use of these primitives forms operational gravity; teams adopt them because non-adoption becomes more expensive and less reconcilable.

### Distributed legitimacy interpretation
Legitimacy becomes a distributed, evidence-bound process: convergence informs canon, canon remains non-operative until explicitly bound, and binding requires separate governance review.

---

## Final Statement

The protocol exists to identify where capability outpaces legitimacy, convert visible legitimacy gaps into operational dependency, and preserve recurring convergence as reusable infrastructure canon.
