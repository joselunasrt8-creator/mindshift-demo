# Future Deterministic FATE Attack Suite Plan

Status: Non-Operative  
Layer: FATE Planning → Attack Scenario Catalog → Invariant Mapping

## Purpose

Plan future deterministic attack suites without implementation.

This artifact catalogs expected adversarial and drift scenarios, maps each scenario to canonical invariants, and defines expected VALID | NULL outcomes.

## Core Invariant

```text
If no valid object exists → nothing happens
```

## Planning Boundary

This plan does not:

- implement tests
- mutate runtime state
- execute actions
- create proof
- grant authority
- validate live runtime legitimacy

It only defines deterministic future FATE scenarios.

---

## Scenario Catalog

| Suite | Scenario | Invariant | Expected Outcome |
|---|---|---|---|
| Replay Attacks | Reuse consumed authority | ACTIVE → CONSUMED must be single-use | NULL |
| Replay Attacks | Duplicate object hash submitted twice | duplicate hash must be blocked | NULL |
| Replay Attacks | Nonce reuse across invocations | invocation nonce must be unique | NULL |
| Replay Attacks | Cross-runtime replay attempt | remote evidence does not imply local authority | NULL |
| Authority Drift | Authority scope expanded after validation | validated_object == executed_object | NULL |
| Authority Drift | Authority subject mismatch | trust ≠ authority | NULL |
| Authority Drift | Expired authority used for execution | execution requires ACTIVE authority | NULL |
| Authority Drift | Revoked authority descendant used | revoked lineage invalidates descendants | NULL |
| Cross-Registry Divergence | proof_registry references missing authority | no valid lineage → no valid execution | NULL |
| Cross-Registry Divergence | authority_registry and continuity_registry disagree | no valid continuity chain → no valid authority | NULL |
| Cross-Registry Divergence | federation registry claims local authority | remote evidence ≠ local authority | NULL |
| Hash Mutation | AEO hash changes after validation | validated_object == executed_object | NULL |
| Hash Mutation | Metadata changes hash unexpectedly | deterministic canonicalization required | NULL |
| Hash Mutation | Field order affects hash | same object → same hash | NULL |
| Signature Mismatch | Signature does not match canonical object hash | proof must bind exact object | NULL |
| Signature Mismatch | Signature uses stale authority key | authority lineage must be current | NULL |
| Signature Mismatch | Federation signature claims authority inheritance | federation evidence is not authority | NULL |
| Continuity Orphaning | Authority without continuity chain | no continuity → no authority | NULL |
| Continuity Orphaning | Proof references orphaned execution | no proof truth without lineage | NULL |
| Continuity Orphaning | Session expired before execution | invalid continuity → NULL | NULL |
| Proof Inconsistency | Proof missing validated_object_hash | no proof → no execution truth | NULL |
| Proof Inconsistency | Proof execution_hash differs from executed object | proof must bind transfer | NULL |
| Proof Inconsistency | Proof exists without registry persistence | persistence absent → non-existent | NULL |
| Manual Dispatch Edge Cases | workflow_dispatch without authority binding | manual trigger is not authority | NULL |
| Manual Dispatch Edge Cases | workflow_dispatch rerun reuses authority | replay attempt blocked | NULL |
| Manual Dispatch Edge Cases | dispatch target differs from AEO target | scope mismatch → NULL | NULL |
| Parallel Execution Collisions | Two executions race same authority | authority may be consumed once | NULL |
| Parallel Execution Collisions | Same nonce used in parallel | replay collision blocked | NULL |
| Parallel Execution Collisions | Proof writes conflict | exact object and proof lineage required | NULL |

---

## Valid Baseline Cases

VALID outcomes should only exist for tightly bounded baseline cases:

| Scenario | Required Conditions | Expected Outcome |
|---|---|---|
| Valid single-use execution | VALID + AUTHORIZED + UNUSED + POLICY_VALID | VALID |
| Valid proof persistence | proof binds validated object and execution hash | VALID |
| Valid continuity chain | identity → session → continuity → authority remains ACTIVE | VALID |
| Valid federation evidence exchange | observability-only; no authority inheritance | VALID |

---

## Required Future FATE Suites

Planned files:

```text
tests/fate/replay-attacks.test.mjs
tests/fate/authority-drift.test.mjs
tests/fate/cross-registry-divergence.test.mjs
tests/fate/hash-mutation.test.mjs
tests/fate/signature-mismatch.test.mjs
tests/fate/continuity-orphaning.test.mjs
tests/fate/proof-inconsistency.test.mjs
tests/fate/manual-dispatch-edge-cases.test.mjs
tests/fate/parallel-execution-collisions.test.mjs
```

## Closure Rule

```text
capability ≠ permission
validation ≠ execution
proof ≠ truth unless persisted
federation ≠ authority inheritance
```
