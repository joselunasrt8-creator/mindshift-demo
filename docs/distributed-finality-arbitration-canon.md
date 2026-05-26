# Distributed Finality Arbitration Canon

**Status:** SPEC ARTIFACT — MODE B — NON-OPERATIVE
**Scope:** Formalizes LOCAL_FINAL vs GLOBAL_FINAL legitimacy semantics, partition-aware settlement, quorum disagreement, stale proof downgrade, deterministic convergence restoration, topology-visible finality transitions, and replay behavior under split-brain recovery.
**Binds to:** `src/legitimacy-conflict-arbitration.ts`, `src/lib/finality-classification.ts`, `migrations/0048_finality_classification_registry.sql`, `PARTITION_FINALITY_SEMANTICS.md`
**Prerequisite for:** `migrations/0049_conflict_set_registry.sql` (#1342), #1343 quorum attestation registry, #1347 distributed replay convergence

---

## 1. Finality State Vocabulary

Four canonical finality classes govern legitimacy finality, distinct from the six partition-finality classification states in `src/lib/finality-classification.ts`:

```
PROOF_LOCAL_FINAL:
  Proof exists and is structurally valid within a single-partition scope.
  All base predicates satisfied: V∧A∧U∧P∧R∧T∧C.
  Distributed predicates (Q, G, L, X) absent or not all satisfied.
  Caps at LOCAL_VALID classification. No global side-effects permitted.

PROOF_GLOBAL_FINAL:
  Proof is globally attested with full distributed predicate evidence.
  Requires Q∧G∧L∧X in addition to all base predicates.
  Required for GLOBAL_VALID classification.
  Cannot be reached without quorum attestation evidence (#1343).

PROOF_CONTINGENT:
  Proof exists but finality class is unresolved: competing heads present,
  open conflict set, or distributed predicates partially satisfied.
  Maps to AMBIGUOUS or PARTITION_SUSPENDED classification.
  Not executable for global side-effects.

PROOF_NULL:
  No valid proof, or hard base-predicate failure, or terminal NULL state.
  Terminal. Maps to NULL classification.
  No upgrade path from PROOF_NULL.
```

**Mapping to partition-finality classifications:**

| Finality Class | Classification | Executable |
|---|---|---|
| PROOF_LOCAL_FINAL | LOCAL_VALID | Local decisions only, policy-dependent |
| PROOF_GLOBAL_FINAL | GLOBAL_VALID | Classification-only at schema layer |
| PROOF_CONTINGENT | AMBIGUOUS \| PARTITION_SUSPENDED | No |
| PROOF_NULL | NULL | No (terminal) |

---

## 2. LOCAL_FINAL vs GLOBAL_FINAL Distinction

### LOCAL_FINAL conditions

All of the following must hold:

- Base predicates satisfied: V=true, A=true, U=true, P=true, R=true, T=true, C=true
- At least one distributed predicate absent: Q=false OR G=false OR L=false OR X=false
- Topology visible within local partition scope (T=true) but below full quorum threshold
- No open conflict set in `conflict_set_registry` for the object's lineage scope

LOCAL_FINAL cannot support global side-effects. It is a bounded, single-partition legitimacy claim.

### GLOBAL_FINAL conditions (additive)

All LOCAL_FINAL conditions hold, plus:

- Q=true: quorum attestation present and above configured federation profile threshold
- G=true: global registry convergence confirmed (no divergent heads for the scope)
- L=true: lineage freshness within policy staleness horizon
- X=true: cryptographic integrity evidence present
- No open conflict set for the object's lineage scope in `conflict_set_registry`
- `topology_reconstructable = true` per `classifyLegitimacyConflict()` in `src/legitimacy-conflict-arbitration.ts`

GLOBAL_FINAL is a claim over the entire distributed topology, not just the local partition.

### Implementation binding

`classifyFromPredicates(p, topologyPresent)` in `src/lib/finality-classification.ts` already implements this decision tree:

```typescript
if (!topologyPresent) return 'PARTITION_SUSPENDED'   // topology absent → PROOF_NULL path
if (!base) return 'NULL'                              // base predicate failure → PROOF_NULL
if (p.Q && p.G && p.L && p.X) return 'GLOBAL_VALID' // PROOF_GLOBAL_FINAL
if (p.L) return 'LOCAL_VALID'                        // PROOF_LOCAL_FINAL
return 'STALE_VISIBLE'                               // PROOF_CONTINGENT with staleness
```

The AMBIGUOUS classification — which maps to PROOF_CONTINGENT — is not produced by `classifyFromPredicates` alone; it requires conflict set evidence from `conflict_set_registry` (#1342) to be externally imposed.

---

## 3. Quorum Disagreement Semantics

### Definition

Quorum disagreement occurs when two or more federation members attest to conflicting canonical heads for the same legitimacy scope, with no deterministic tie-break resolved.

### Detection path

1. `classifyLegitimacyConflict(input)` in `src/legitimacy-conflict-arbitration.ts` evaluates the input:
   - Rule 2 (topology drift, bounded): returns `CONFLICT_OBSERVED` (MEDIUM severity)
   - Rule 3 (topology drift OR lineage divergence): returns `CONFLICT_REQUIRES_RECONCILIATION` (HIGH severity)
   - Rule 4 (causal ambiguity OR replay ambiguity): returns `CONFLICT_REQUIRES_HUMAN_REVIEW` (HIGH severity)
   - Rule 5 (`topology_reconstructable === false`): returns `CONFLICT_UNRESOLVABLE` (CRITICAL severity)

2. `CONFLICT_REQUIRES_RECONCILIATION` or higher → conflict set entry written to `conflict_set_registry` (#1342) with `conflict_state = 'OPEN'`

3. All finality classifications for objects in the affected scope are blocked from `GLOBAL_VALID` while the conflict set is open.

4. `AMBIGUOUS` classification persists for the scope until tie-break resolves the conflict set to `RESOLVED`.

### Quorum degradation path

```
Full quorum (Q=true, G=true)
  → partial quorum (Q=true, G=false): GLOBAL_VALID → emit supersession to AMBIGUOUS
  → no quorum (Q=false): → emit supersession to PARTITION_SUSPENDED (fail-closed)

Quorum restoration:
  Topology restored → re-evaluate all PARTITION_SUSPENDED objects in scope
  Q satisfied → LOCAL_VALID eligible
  Q∧G∧L∧X satisfied + no open conflict → GLOBAL_VALID eligible
```

### Deterministic tie-break ordering

When a conflict set must be resolved, the following ordering applies deterministically (no authority created by resolution):

1. **Highest reconciliability score** — maximum verified ancestry coverage over the conflicting scope
2. **Strongest quorum attestation weight** — weighted attestation from configured federation profile
3. **Earliest authoritative causal clock index** — happens-before ordering from #1346
4. **Lexicographic hash** — last resort; deterministic but content-independent

Losing branches: `conflict_state = 'RESOLVED'`; prior finality classifications for losing-branch objects supersede to `NULL`. Losing-branch evidence records persist append-only as historical audit material.

---

## 4. Stale Proof Downgrade Semantics

### Staleness sources

1. **Lineage freshness horizon exceeded** (L=false): `GLOBAL_VALID → STALE_VISIBLE`
2. **Revocation channel silent beyond policy horizon**: `GLOBAL_VALID → STALE_VISIBLE`
3. **Superseding epoch closes the scope**: `GLOBAL_VALID → STALE_VISIBLE → NULL`
4. **Late-arriving revocation proof**: immediate downgrade on receipt; never silent preservation

### Downgrade rules

- `STALE_VISIBLE` is non-terminal: may upgrade to `LOCAL_VALID` on lineage freshness renewal
- `NULL` is terminal: no upgrade path; enforced by `fcr_no_upgrade_from_null` trigger in migration 0048
- Every downgrade MUST emit a new record in `finality_classification_registry` with:
  - `supersedes_classification_id` pointing to the prior record
  - A machine-readable `reason_code` from the canonical vocabulary below

**Canonical downgrade reason_code vocabulary:**

| reason_code | Trigger |
|---|---|
| `lineage_freshness_expired` | L=false at re-evaluation time |
| `revocation_channel_silent` | Revocation evidence stale beyond policy horizon (#1344) |
| `epoch_scope_closed` | Superseding epoch transition |
| `late_revocation_received` | Revocation proof arrived after classification was GLOBAL_VALID |
| `quorum_degraded` | Q dropped below threshold after GLOBAL_VALID classification |
| `topology_lost` | T=false after GLOBAL_VALID classification |
| `conflict_set_opened` | Competing head detected for the same lineage scope |
| `replay_violation_detected` | UNUSED=false discovered after classification |

### Silent preservation is forbidden

A proof classified as `GLOBAL_VALID` at time T₀ cannot remain `GLOBAL_VALID` at time T₁ if any downgrade condition holds at T₁. The system must emit a downgrade supersession record. The prior `GLOBAL_VALID` record remains immutably in the append-only registry as historical evidence.

---

## 5. Deterministic Convergence Restoration

After partition healing, the following procedure restores legitimacy convergence. This procedure is classification-only and creates no authority.

### Restore procedure

1. Execute reconciliation per #1348 semantics (append-only merge, no authority widening)
2. Recompute predicate state for all `PARTITION_SUSPENDED` objects in the restored scope:
   - Re-evaluate topology presence (T)
   - Re-evaluate lineage freshness (L) at restoration time, not at original classification time
   - Re-evaluate conflict set state (open conflicts remain AMBIGUOUS)
3. For each object, run `classifyFromPredicates(p, topologyPresent)` with restored evidence
4. Emit new classification records (supersede `PARTITION_SUSPENDED`) for objects that now satisfy higher classification
5. Objects with open conflict sets remain `AMBIGUOUS` until conflict_set_registry is resolved

### Replay-neutral constraint

Convergence restoration MUST be replay-neutral:
- Consumed nonces (U=false) remain consumed; restoration does not reset the UNUSED predicate
- `PARTITION_SUSPENDED → LOCAL_VALID` transition does not re-authorize previously consumed nonces
- Anti-entropy from #1347 governs nonce consumption propagation; restoration is downstream of anti-entropy

### Evidence-only constraint

`creates_authority: false` must hold for all restoration paths. The classification change from `PARTITION_SUSPENDED` to `LOCAL_VALID` or `GLOBAL_VALID` is an observation of predicate state — it does not create, extend, or re-issue authority.

---

## 6. Topology-Visible Finality Transitions

### Thresholds

| Transition | Topology Requirement |
|---|---|
| `PARTITION_SUSPENDED → LOCAL_VALID` | T=true within any partition (partial quorum acceptable) |
| `LOCAL_VALID → GLOBAL_VALID` | Full quorum threshold for configured federation profile |
| `GLOBAL_VALID → AMBIGUOUS` | Competing head detected (conflict_set opened) |
| `GLOBAL_VALID → PARTITION_SUSPENDED` | Q drops below threshold |
| Any → CONFLICT_UNRESOLVABLE | `topology_reconstructable = false` per `arbitrateLegitimacyConflict()` |

### Topology loss path

1. Topology drops below quorum threshold during `GLOBAL_VALID` state
2. `classifyLegitimacyConflict()` detects drift → `CONFLICT_REQUIRES_RECONCILIATION`
3. Emit downgrade supersession with `reason_code = 'topology_lost'` or `reason_code = 'quorum_degraded'`
4. `topology_reconstructable = false` → `CONFLICT_UNRESOLVABLE` (CRITICAL) → binds to `NULL` classification

### Topology restoration path

1. Topology restored above local threshold → `PARTITION_SUSPENDED → LOCAL_VALID` eligible
2. Topology restored above quorum threshold → `LOCAL_VALID → GLOBAL_VALID` eligible
   - Must re-evaluate L (lineage freshness) at restoration time
   - Must confirm no open conflict set for scope
3. Restoration is a classification event, not an authority event

---

## 7. Replay Behavior Under Split-Brain Recovery

### Core rule

Split-brain does not restore replay eligibility. A nonce consumed on shard A before partition is permanently consumed regardless of shard B's state. `UNUSED = false` once consumed anywhere in the distributed topology.

### Split-brain replay scenarios

**Scenario 1: One-shard consumption, other shard unseen**
- Shard A consumed nonce N; shard B has not observed consumption
- On partition heal: shard B learns of consumption via anti-entropy (#1347)
- Any in-flight authority from shard B using nonce N → `NULL` (UNUSED=false)
- Prior `LOCAL_VALID` or `GLOBAL_VALID` classification for shard B's authority → supersede to `NULL`, `reason_code = 'replay_violation_detected'`

**Scenario 2: Both shards attempt independent consumption**
- Shard A and shard B both attempt to consume the same nonce N independently during partition
- On heal: causal clock ordering (from #1346) determines which consumption was causally prior
- Earlier causal clock index wins; later attempt → `NULL`
- Conflict set opened for the scope with `collapse_rule_applied = 'CAUSAL_CLOCK'`

**Scenario 3: Nonce consumed under LOCAL_VALID, global finalization later blocked**
- Nonce consumed under `PROOF_LOCAL_FINAL`; subsequent global finalization blocked by conflict
- Nonce remains permanently consumed even if `GLOBAL_FINAL` is never reached
- No re-issuance of authority using that nonce under any finality class

### Evidence-only binding

`arbitrateLegitimacyConflict()` in `src/legitimacy-conflict-arbitration.ts` returns artifacts with:
- `replay_neutral: true` — arbitration does not restore nonce eligibility
- `creates_authority: false` — arbitration result cannot be used as execution authority

These flags must be present in all conflict resolution artifacts stored in `conflict_set_registry`.

### Classification impact of replay violation

When a replay violation is detected post-classification:
1. Emit new `NULL` classification record with `reason_code = 'replay_violation_detected'`
2. `supersedes_classification_id` points to the most recent prior classification record for the object
3. `fcr_no_upgrade_from_null` trigger in migration 0048 prevents any subsequent re-classification
4. The violation is permanently recorded; no silent removal

---

## 8. Binding Summary: `src/legitimacy-conflict-arbitration.ts`

The canon spec formalizes the semantic contract that `src/legitimacy-conflict-arbitration.ts` already implements:

| Canon concept | Function | Result constant | Finality impact |
|---|---|---|---|
| All predicates reconcile | `classifyLegitimacyConflict()` rule 1 | `CONFLICT_NONE` | No classification change |
| Quorum disagreement (bounded) | rule 2 | `CONFLICT_OBSERVED` | PROOF_CONTINGENT → AMBIGUOUS eligible |
| Topology drift / lineage divergence | rule 3 | `CONFLICT_REQUIRES_RECONCILIATION` | Conflict set opened; GLOBAL_VALID blocked |
| Causal / replay ambiguity | rule 4 | `CONFLICT_REQUIRES_HUMAN_REVIEW` | PROOF_CONTINGENT; human resolution required |
| Topology unreconstruable | rule 5 | `CONFLICT_UNRESOLVABLE` | PROOF_NULL → NULL classification |
| Evidence-only arbitration | `arbitrateLegitimacyConflict()` | frozen artifact | `creates_authority: false` preserved |
| Deterministic deduplication | `computeArbitrationHash()` | sha256 | Canonical conflict_set_id derivation |

---

## 9. NULL Conditions

The following conditions route any finality determination to `NULL` or `PROOF_NULL`:

1. Any base predicate fails (V, A, U, P, R, T, C) — hard fail-closed
2. `topology_reconstructable = false` — CONFLICT_UNRESOLVABLE
3. Replay violation detected post-classification — UNUSED=false propagated
4. Late revocation proof received — downgrade chain ends at NULL if revocation is root cause
5. NULL classification is terminal — `fcr_no_upgrade_from_null` enforced at DB layer
6. PROOF_NULL has no upgrade path — same terminal rule at semantic layer

---

## 10. Downstream Dependencies

This canon is the semantic prerequisite for:

| Issue | Dependency |
|---|---|
| #1342 conflict_set_registry | Section 3 (quorum disagreement + tie-break) defines the schema semantics |
| #1343 quorum_attestation_registry | Section 2 (GLOBAL_FINAL) defines when quorum evidence qualifies |
| #1344 revocation_liveness_registry | Section 4 (stale proof downgrade) defines freshness horizon rules |
| #1345 validator extension | Section 2 (LOCAL_FINAL vs GLOBAL_FINAL) defines what the validator must return |
| #1347 replay convergence canon | Section 7 (split-brain replay) defines the anti-entropy contract |
| #1348 reconciliation determinism | Section 5 (convergence restoration) defines the post-heal procedure |

---

## Canonical Invariant (Extended)

```
VALID ∧ AUTHORIZED ∧ UNUSED ∧ POLICY_VALID ∧ REPLAY_SAFE ∧ TOPOLOGY_VISIBLE ∧ RECONCILABLE
  ∧ Q ∧ G ∧ L ∧ X
  → PROOF_GLOBAL_FINAL → GLOBAL_VALID classification

VALID ∧ AUTHORIZED ∧ UNUSED ∧ POLICY_VALID ∧ REPLAY_SAFE ∧ TOPOLOGY_VISIBLE ∧ RECONCILABLE
  ∧ ¬(Q ∧ G ∧ L ∧ X)
  → PROOF_LOCAL_FINAL → LOCAL_VALID classification

¬TOPOLOGY_VISIBLE → PROOF_NULL (PARTITION_SUSPENDED)
¬BASE_PREDICATES   → PROOF_NULL (NULL)
CONFLICT_OPEN      → PROOF_CONTINGENT (AMBIGUOUS)
ELSE               → PROOF_NULL (NULL)
```

Classification evidence ≠ execution authority.
`creates_authority: false` applies to all finality classification, conflict arbitration, and convergence restoration operations.
