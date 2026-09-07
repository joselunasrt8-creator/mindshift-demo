# StateGate #71/#76 legitimacy-lifecycle audit

**Audit mode:** evidence classification only; no runtime implementation.  
**Audit date:** 2026-09-06 UTC.  
**Terminal determination:** `CONTINUITYOS_LIFECYCLE_PARTIALLY_OPERATIONAL`.

## 1. Baseline, method, and non-claims

The immutable checkout baseline was:

| datum | value |
|---|---|
| starting commit | `847cf44056036e71a0fd796cba8b0e412be83481` |
| starting tree | `e28aa50ea1d79873dd5d4127aa318cf21ad39df3` |
| local branch | `work` |
| initial worktree | clean (`git status --porcelain=v1` emitted no paths) |
| visible tip description | merge of ContinuityOS PR #2314 |

`git fetch origin main --tags` was attempted before mutation, after adding the supplied
repository as `origin`, but the environment's HTTPS CONNECT tunnel returned HTTP 403.
The GitHub pages for the supplied StateGate issues and PRs were likewise unavailable to
the browsing facility (HTTP 401). Consequently, **the SHA above is the exact audited
checkout, but this audit does not claim that it was still the remote `main` tip at audit
time**. The eight Issue #76 responsibilities and the Issue #71 relationship below are
therefore taken from the task's supplied adjudication, not reconstructed quotations from
GitHub. This limitation must be resolved before treating the report as remote-main
attestation.

Evidence was classified independently as:

1. **documented**: prose makes the claim;
2. **specified**: a schema, type, invariant, or vector defines it;
3. **represented**: runtime state has a field/row/object for it;
4. **validated**: executable code rejects bad evidence;
5. **persisted**: the result is durably written;
6. **executed**: the guarded effect actually crosses a mutation boundary; and
7. **tested**: a test executes behavior (source-regex tests are identified separately).

These categories are deliberately not interchangeable. In particular, a D1 migration,
diagram, source-regex assertion, or response field is not execution evidence. This audit
also does **not** claim that an API key authenticates the issuer described inside an
authority object, that a D1 row proves an external deployment happened, that an
observability reconciliation repairs state, or that caller-supplied topology booleans
constitute trusted topology evidence.

## 2. Audited topology and executable boundaries

The audit inspected `README.md`, `ROOT.md`, `docs/runtime-layer-separation.md`,
`docs/runtime-lineage-execution-eligibility-primitive-v1.md`, the canonical schemas,
all D1 migrations (with emphasis on 0008, 0010--0012, 0041--0046, and 0058--0061),
`src/index.ts`, canonicalization/authority/reconciliation/topology modules,
storage/execution adapters, the governed-deploy wrapper and workflow, proof and authority
registries, relevant examples, and the focused tests listed in the matrices below.
Repository history was searched with `git log` and repository artifacts were searched
for StateGate and lifecycle lineage. Upstream issue/PR history could not be fetched as
recorded above.

The actually evidenced mutation boundaries are distinct:

* The Worker routes `/session`, `/continuity`, `/authority`, `/compile`, `/validate`,
  `/execute`, and `/proof` mutate D1 lifecycle registries. `/session` and `/continuity`
  are explicitly classified by the runtime as non-executable; the later five are called
  executable runtime routes.
* `/execute` records an `EXECUTED` row and advances registry state. It does not itself
  call Cloudflare's deployment API or run a deployment command. It is an execution
  **projection/record boundary**, not evidence of the external effect.
* The production effect boundary is `.github/workflows/governed-deploy.yml` invoking
  `scripts/governed-deploy.ts`, which validates a generated artifact and then uses
  `spawnSync` to run `npx wrangler deploy`. This is operational but is not transactionally
  coupled to the Worker's D1 execution/proof transaction.
* Filesystem and GitHub issue-comment adapters implement additional bounded effect
  paths. Their guarantees are surface-specific and do not prove universal coverage.
* `/reconcile/report` is deterministic, read-only, replay-neutral observability. It can
  report `VALID_RECONCILIATION`, `INVALID_RECONCILIATION`, or `NULL`; it neither repairs
  the lifecycle nor grants authority.

This split is the most important documented-versus-operational discrepancy: the named
canonical route chain is implemented as registry transitions, while the externally
mutating deploy boundary consumes a separately assembled workflow artifact.

## 3. Eight-responsibility classification

Exactly one primary status is assigned per responsibility.

| # | StateGate-adjudicated responsibility | Primary status | Strongest operational evidence | Persistent state | Fail-closed / identity evidence | Principal gap |
|---:|---|---|---|---|---|---|
| 1 | Authorization object validity/presence | `OPERATIONAL_PARTIALLY_TESTED` | `/compile`, `/validate`, and `/execute` query `authority_registry` and return `NULL` when missing or unusable. | `authority_registry`; delegated-authority registries | `authority_id`, `decision_id`, `identity_id`, `session_id`, `continuity_id`; missing authority fails closed. | `/authority` mints authority from API-key-authenticated, caller-supplied identity/owner/intent/scope. No signature or issuer credential proves that the represented issuer controls `identity_id`; most tests assert source text rather than exercising D1. |
| 2 | Authorization expiry | `OPERATIONAL_PARTIALLY_TESTED` | `isExpired(authority.expiry)` gates compile, validate, and execute; execute rechecks after validation. | `authority_registry.expiry/status`, continuity/session expiry | evaluation uses runtime wall-clock; expired/revoked authority returns `NULL`. | Issuance does not reject an already-expired `b.expiry`; there is no bounded authority renewal operation, explicit `valid_from`, or tested authority-revocation endpoint. Runtime-clock trust is an environment assumption. |
| 3 | Authorization scope binding | `OPERATIONAL_PARTIALLY_TESTED` | Compile derives the AEO from persisted authority; validate requires canonical equality of authority/AEO scope, authority id and continuity id, and exact repo/branch/workflow constraints; execute re-hashes the AEO. | authority and AEO registries plus execution snapshot | `authority_id`, `validated_object_hash`, continuity/delegation hashes, repository/tree/workflow lineage; mismatch returns `NULL`. | Actor/executor identity and proposed external state are not uniformly part of the authority object's immutable digest. Base authority has no canonical signed object hash, and surface-specific adapters do not establish universal binding. |
| 4 | Authorization consumption/reuse | `OPERATIONAL_PARTIALLY_TESTED` | Validate reserves authority/nonce; execute requires `RESERVED`/`VALIDATED`; proof batches proof insertion with `EXECUTED -> CONSUMED` and rejects reuse. | authority, invocation, execution, proof and outbox registries | authority id, invocation nonce, decision/object tuple; reuse returns `NULL`. | Consumption happens after the execution row, at proof time. Migration-built D1 tests cover transaction rollback and concurrent proof rejection, but an execution can remain `EXECUTED` with unconsumed authority if proof never arrives. |
| 5 | Duplicate execution detection | `OPERATIONAL_PARTIALLY_TESTED` | `/execute` checks prior `(decision_id, validated_object_hash)`, requires a reserved nonce, and relies on unique constraints; duplicate paths return `replay_detected`/`NULL`. | invocation and execution registries; provenance/replay tables | decision id, object hash, nonce, workflow run id; deterministic duplicate rejection is encoded. | The pre-read plus later writes are not one explicit compare-and-consume transaction across every registry. Tests mostly match SQL/source; global exactly-once and cross-surface idempotency are explicitly not established. |
| 6 | Event-order validation | `OPERATIONAL_PARTIALLY_TESTED` | Each route requires predecessor registry rows/statuses; validation/execution freshness, topology epoch admission, lineage parent hashes, and reconciliation canonical registry order reject stale/reordered input. | lifecycle registries, epoch/causal-clock registries, reconciliation event registries | lineage origin/parent hashes, epoch nonce/order hash; illegal predecessor/status returns `NULL`. | There is no single authoritative lifecycle event state machine used by every mutation. Several transitions are independent `UPDATE`s, while causal clocks and reconciliation state-machine tables are evidence-only. No concurrency test proves deterministic ordering of the complete chain. |
| 7 | Terminal-state reconciliation history | `OPERATIONAL_PARTIALLY_TESTED` | Recursive traversal reads session through proof/invocation/PREO in canonical order, checks hashes/replay/orphans, and produces deterministic reports and drift classes. | all lifecycle registries plus append-only reconciliation/report/checkpoint registries | anchor/trace/traversal/Merkle hashes; missing, multiple, or divergent rows fail to invalid/`NULL`. | Reconciliation is post-hoc, read-only observability. It does not establish an independently observed external outcome, repair disagreement, consume replay state, or gate the already-recorded execution. Tests primarily inspect source structure. |
| 8 | Proof presence after decision projection | `OPERATIONAL_PARTIALLY_TESTED` | AEO validation requires `finality.proof_required`; `/proof` binds execution, decision, object, nonce, session, continuity, authority and provenance; proof insert, authority consumption and outbox enqueue are batched; reconciliation rejects absent/drifted proof. | proof registry, execution snapshot, proof outbox, attestation registry | `proof_id`, `execution_id`, `decision_id`, object hash and lineage hashes; tamper/replay/missing predecessor fail closed. | `/execute` can complete before proof exists, so proof is a governed terminal requirement but not a prerequisite to the Worker execution projection. The external deploy workflow consumes a separately generated artifact; no transaction binds external outcome, D1 proof, and registry reconciliation. |

### Evidence details and tests

| Responsibility | Symbols/interfaces and mutation surfaces | Existing test evidence | Missing test evidence |
|---|---|---|---|
| Authorization presence | `/authority`, `activeSession`, `activeContinuity`, `authority_registry`, `validateDelegatedAuthorityLineage`; authority source is API key plus current session/continuity and request body. | `tests/fate/canonical-authority.test.mjs`, `compile-authority.test.mjs`, and `authority-lifecycle-consumption.test.mjs`. | Real D1 issuance rejecting forged issuer identity; absent-authority route integration across compile/validate/execute. |
| Expiry/revocation | `isExpired`, `cascadeRevocation`, `cascadeExpiration`; authority/continuity mutations. | `tests/issue-801-bounded-revalidation-freshness.test.mjs` executes mocked Worker rejection of expired authority and stale validation; continuity revocation tests exist. | Already-expired authority issuance; trusted-time skew/boundary cases; authority revocation and renewal end-to-end. |
| Scope | `toCanonicalAeo`, `canonicalDeployTarget`, `computeGovernProjectionHash`; authority/AEO/execution snapshot writes. | `tests/fate/exact-object-enforcement.test.mjs`, `aeo-exact-object-coverage.test.mjs`, `issue-1928-validate-aeo-contract.test.mjs`. | Wrong actor/executor, policy identity, proposed-state and cross-repository tests against real D1 routes. |
| Consumption | proof `DB.batch`, invocation reservation, authority status transitions. | `authority-lifecycle-consumption.test.mjs` is source-regex; `registry-lineage-migrations.test.mjs` exercises migration-built D1 rollback and concurrent proof rejection. | Crash between execution and proof, missing-proof terminal fate, and durable reuse after process restart. |
| Duplicate execution | execute replay lookup, unique tuple, invocation nonce. | `replay-resistance.test.mjs` and `issue-677-bounded-delivery-replay-guarantees.test.mjs` are principally source-regex assertions. | Parallel duplicate requests against D1; acknowledgement-loss integration; duplicate vs legitimate idempotent retry across adapters. |
| Ordering | `enforceTopologyEpochAdmission`, `verifyLineageOrigin`, route predecessor queries, causal-clock and reconciliation-state-machine modules. | `issue-801` exercises freshness with mocks; epoch/reconciliation tests cover isolated classifiers and source invariants. | Complete lifecycle permutations, concurrent transitions, stale/reordered event injection against migrated D1. |
| Reconciliation | `deterministicRecursiveReconciliationTraversal`, `verifyReconciliationRegistryRow`, report/checkpoint builders. | `recursive-reconciliation-traversal.test.mjs` verifies source ordering/read-only constraints; focused pure-module tests exist. | End-to-end intended/eligible/attempted/external-outcome/proof disagreement; restart durability; reconciliation-to-admission coupling. |
| Proof | `/proof`, `verifyLineageOrigin`, proof D1 batch/outbox, proof reconciliation. | `issue-1594-execution-proof-lineage-binding.test.mjs` is source-regex; proof freshness has a mocked Worker test; migration/conformance tests cover uniqueness. | External-effect receipt authenticity, missing-proof timeout/terminal fate, tamper against real D1, outbox failure/retry, and proof/external outcome atomicity. |

## 4. Complete legitimacy-chain analysis

The requested chain is not one atomic governed process in this checkout.

| Arrow | Classification | Reason |
|---|---|---|
| Intent Candidate -> Continuity | `MISSING` | `/continuity` is session/lineage based and has no candidate identity. A `/govern` candidate envelope is a separate support path. |
| Continuity -> Authority | `EXECUTABLE` | `/authority` requires active matching session/current continuity and persists their identifiers. |
| Authority -> authorization bound to exact object | `VALIDATED_ONLY` | Authority is persisted before the AEO exists. Compile/validate later bind its scope/id to the canonical AEO and object hash, but the authority record itself is not an authenticated exact-object authorization digest. |
| Exact-object authorization -> Validation | `EXECUTABLE` | `/validate` re-derives the AEO hash, checks authority/AEO/continuity/scope/policy lineage, reserves a nonce and writes `VALID`. |
| Validation -> Execution eligibility | `REPRESENTED_ONLY` | `/validate` returns a predicate/classification snapshot after writing `VALID`, but there is no durable eligibility object that is the conjunction of all seven required predicates. `/execute` intentionally ignores `classification_evidence`. |
| Execution eligibility -> Authorization consumption | `MISSING` | Consumption is not an eligibility transition: authority moves to `EXECUTED` after the execution record and to `CONSUMED` only in `/proof`. |
| Authorization consumption -> Execution | `MISSING` | Actual order is execution-record first, proof plus consumption second. |
| Execution -> Proof | `EXECUTABLE` for registry execution | `/proof` requires and binds an `EXECUTED` row and writes proof. It does not prove an external effect occurred. |
| Proof -> Registry | `EXECUTABLE` | Proof persistence, authority consumption and proof-outbox enqueue are a D1 batch with uniqueness/failure checks. |
| Registry -> Reconciliation | `EXECUTABLE` as read-only verification | Reconciliation deterministically traverses persisted rows and returns invalid/`NULL` on disagreement; it cannot repair or retroactively prevent execution. |

**First non-operational boundary:** `Intent Candidate -> Continuity` is literally missing
from the proposed full chain. If “intent candidate” is treated as optional pre-runtime
input and the canonical chain is started at continuity, the first consequential
legitimacy break is **Authority -> exact-object authorization** (`VALIDATED_ONLY`), and
the first execution-critical break is **Validation -> Execution Eligibility**
(`REPRESENTED_ONLY`). The latter is where the seven-predicate architectural claim stops
being an operational conjunctive gate.

## 5. Seven-predicate execution-eligibility pressure test

No single runtime symbol computes
`VALID && AUTHORIZED && UNUSED && POLICY_VALID && REPLAY_SAFE && TOPOLOGY_VISIBLE && RECONCILABLE`
and persists/binds that result as the sole input to execution. The `_predicate_snapshot`
returned by `/validate` resembles the formula, but is constructed after validation state
is persisted, hard-codes several predicates `true`, and is explicitly ignored by
`/execute`.

| Predicate | Classification in the claimed conjunction | Computation/evidence/authority | Determinism, staleness, binding, failure behavior, tests |
|---|---|---|---|
| `VALID` | `OPERATIONAL_PARTIALLY_TESTED` | `/validate`: canonical AEO re-hash, persisted compiled row, lineage and constraints; local Worker/D1 is responsible. | Deterministic object hash and fail-closed checks; bound to decision/hash/nonce but freshness can expire. Mock/source and canonicalizer tests exist; no full real-D1 lifecycle test proves every branch. |
| `AUTHORIZED` | `OPERATIONAL_PARTIALLY_TESTED` | authority row plus session/continuity/delegation, checked again at execute. | Fail closed and object-lineage bound later; stale via expiry/revocation. Issuer authenticity and exact-object authority at issuance remain incomplete. |
| `UNUSED` | `OPERATIONAL_PARTIALLY_TESTED` | invocation uniqueness/reserved status, execution lookup, authority status. | Durable and bounded to decision/hash/nonce, but reservation/execute/proof transitions are not one transaction. Concurrent D1 proof rejection is tested; process-crash and full-transition concurrency evidence is absent. |
| `POLICY_VALID` | `OPERATIONAL_PARTIALLY_TESTED` | policy registry/class digest, governed workflow target, authority constraints, govern projection hash. | Deterministic within checked code and fails closed for missing class/mismatch; policy can drift between phases and identity is distributed. Focused tests exist, universal surface coverage does not. |
| `REPLAY_SAFE` | `OPERATIONAL_PARTIALLY_TESTED` | invocation, execution, proof, provenance and adapter replay registries. | Durable tuple checks fail closed, but global/cross-surface exactly-once is not claimed and concurrent route behavior is insufficiently exercised. |
| `TOPOLOGY_VISIBLE` | `REPRESENTED_NOT_OPERATIONAL` | validation derives a topology snapshot for response classification; execute separately accepts partition/topology fields and epoch admission evidence. | The validate value does not gate its own `VALID` write and `/execute` does not consume the classification snapshot. Some execution fields are caller supplied. Pure classifier/source tests do not establish trusted exact-object topology eligibility. |
| `RECONCILABLE` | `REPRESENTED_NOT_OPERATIONAL` | validation hard-codes `C: true`; execute's partition admission accepts reconciliation booleans; actual recursive reconciliation happens after persistence and is read-only. | Not computed from the complete lifecycle before execution, not bound as a durable eligibility decision, and can become stale/disagree later. Reconciliation tests prove classifiers/read-only traversal, not pre-execution enforceability. |

Thus the formula is **documented/represented and partially decomposed into real gates,
but is not itself operational**. Topology modules, distributed reconciliation, and
StateGate are bounded evidence providers; their evidence does not automatically become
ContinuityOS authority. StateGate's real interface in this repository is a GitHub Action
returning bounded `VALID`/`NULL` PR evidence, not an authority or lifecycle service.

## 6. StateGate #71/#76 mapping

Because upstream content was inaccessible, “StateGate gap” below means the eight-item
adjudication supplied with this task. It does not purport to quote either issue.

| StateGate gap | ContinuityOS owner | Existing artifact | Status | What #71 exposed / missing work |
|---|---|---|---|---|
| authorization validity/presence | authority route and registry | `/authority`, authority schema/registry, compile/validate/execute gates | `OPERATIONAL_PARTIALLY_TESTED` | Existing but authenticity and behavioral tests are incomplete; do not move issuance into StateGate. |
| expiry/revocation/renewal | authority + continuity lifecycle | expiry/status columns and runtime checks | `OPERATIONAL_PARTIALLY_TESTED` | Existing expiry rejection; missing issuance-time expiry rejection, authority renewal/revocation lifecycle proof. |
| scope binding | authority/AEO compiler/validator | authority scope/constraints, canonical AEO hash/projection | `OPERATIONAL_PARTIALLY_TESTED` | Existing late binding with gaps in issuer/actor/proposed-state binding. |
| consumption/reuse | validation/execution/proof lifecycle | invocation reservation and proof-time authority consumption | `OPERATIONAL_PARTIALLY_TESTED` | Existing but lifecycle order leaves executed/unconsumed state and needs full-transition/crash tests beyond concurrent proof insertion. |
| duplicate execution | execution/replay registries | execute replay query, unique indexes, provenance replay | `OPERATIONAL_PARTIALLY_TESTED` | Existing bounded duplicate rejection; cross-surface/idempotency and atomic tests missing. |
| event order | lifecycle routes/epoch/lineage | predecessor queries, statuses, freshness, epoch and causal evidence | `OPERATIONAL_PARTIALLY_TESTED` | Incomplete unified transition enforcement; evidence-only event machinery must not be mistaken for mutation authority. |
| terminal reconciliation history | reconciliation subsystem | recursive traversal/report/checkpoint and drift classes | `OPERATIONAL_PARTIALLY_TESTED` | Existing detection, but no external outcome oracle, repair, or pre-execution coupling. |
| proof required after projection | proof route/registry/outbox | `proof_required`, proof lineage batch and reconciliation | `OPERATIONAL_PARTIALLY_TESTED` | Existing governed terminal proof, but not atomic with the external effect and not a prerequisite to Worker execution record. |

The empirical conclusion is mixed: Issue #71 exposed substantial already-existing
ContinuityOS machinery, incomplete behavior and testing, and a documentation/runtime
divergence around conjunctive eligibility. It did **not** expose an entirely absent
ContinuityOS lifecycle, and Issue #76 ownership does not prove present implementation.

## 7. Documented/specification versus operation discrepancies

1. Canonical route labels say `/execute`, but that route records execution; the production
   deploy is a later workflow/`spawnSync` boundary.
2. Validation emits a seven-ish predicate snapshot, but topology does not gate the `VALID`
   write and reconciliability is asserted `true`, not derived from the full chain.
3. The execution route intentionally ignores validation `classification_evidence`; there
   is no persisted “execution eligibility” object.
4. Authority is richly represented and checked, but base issuance authenticity is API-key
   admission plus caller claims, not a signed canonical authorization object.
5. Proof is strongly lineage-bound to registry execution, but an `EXECUTED` state may exist
   without proof and without consumed authority.
6. Reconciliation is real executable verification but read-only/post-hoc; it is not the
   `RECONCILABLE` precondition claimed by the formula.
7. Many “FATE” tests are executable tests of source regexes, valuable against accidental
   deletion but weaker than behavioral D1/concurrency/external-effect evidence.

## 8. Ordered recommended next issues

Only empirically observed gaps are proposed; no issues were created automatically.

1. **Authenticate and canonicalize base authority issuance.** Define the existing
   authority issuer source, immutable authority digest, `valid_from`, exact subject and
   actor/executor bindings; reject expired issuance. This precedes meaningful scope and
   consumption assurance.
2. **Add real-D1 authority/scope/expiry behavioral tests.** Cover missing, forged issuer,
   wrong decision/object/repository/actor/policy, expired-at-issuance, expired-after-
   validation, and revoked cases without changing abstractions first.
3. **Create a durable execution-eligibility decision at the existing validation boundary.**
   Compute all seven predicates from authoritative persisted evidence, bind the result to
   decision/object/nonce/execution snapshot and require it at execute. Depend on issues 1--2.
4. **Replace caller assertions for topology/reconciliability.** Bind trusted topology
   snapshot/epoch and deterministic reconciliation checkpoint identities into eligibility;
   test stale, missing, partitioned and conflicting evidence. Depend on issue 3.
5. **Make reservation/execute/consumption failure semantics explicit and concurrency-tested.**
   Decide the legitimate fate of `EXECUTED` without proof, then test parallel requests,
   crashes, retries and D1 batch failures. Depend on exact authority identity.
6. **Bind external execution receipt to registry execution and proof.** The wrapper must
   consume the exact eligibility object and return executor evidence; proof/reconciliation
   must distinguish attempted, succeeded and failed external effects. Do not let proof
   manufacture the outcome. Depend on issues 3--5.
7. **Exercise terminal reconciliation end to end.** Inject disagreements among intended,
   eligible, attempted, external outcome, proof and registry state; prove deterministic
   terminal classification and explicitly bounded remediation. Depend on issue 6.
8. **Add a lifecycle transition/concurrency matrix.** Exercise illegal permutations and
   stale/reordered events against migrated D1, retaining source-regex checks only as
   secondary structural guards.

## 9. Explicit non-claims

This audit does not claim remote-main freshness; StateGate issue/PR text retrieval; global
exactly-once execution; universal adapter coverage; cryptographic base-authority
authenticity; trusted wall-clock or topology inputs; proof of external deployment from an
`execution_registry` row; atomicity between GitHub Actions, Cloudflare deployment and D1;
automatic reconciliation/repair; or closure of any recommended issue. It creates no
authority, execution eligibility, execution, proof, registry row, replay consumption, or
StateGate/MindShift runtime change.

## 10. Final answer to the central question

ContinuityOS **partially operationalizes** the legitimacy lifecycle StateGate refused to
absorb. Authority/continuity persistence, late exact-object validation, nonce reservation,
bounded duplicate rejection, registry execution projection, proof persistence/consumption,
and deterministic read-only reconciliation are real code paths. The complete claim fails
because candidate-to-continuity lineage is absent, authority is not an authenticated
exact-object authorization at issuance, and—most critically—there is no authoritative,
durable, seven-predicate execution-eligibility conjunction consumed by the external effect
boundary. The production deploy path is separately artifact-gated and not transactionally
reconciled with the Worker lifecycle.

`CONTINUITYOS_LIFECYCLE_PARTIALLY_OPERATIONAL`
