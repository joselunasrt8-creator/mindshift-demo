# Continuity Leaf-Freshness Convergence Analysis

**Issue:** #1205 — Continuity leaf-freshness convergence inside authoritative barriers  
**Branch:** `claude/continuity-leaf-freshness-analysis-CU31D`  
**Scope:** Distributed legitimacy runtime — read-only analysis, no mutations, no authority grants  
**Mode:** MODE B — STRUCTURED ARTIFACT  
**Evidence-only:** true

---

## 1. Current Continuity Freshness Architecture

### 1.1 Lineage Model

The `continuity_registry` implements a parent-child tree via the `parent_continuity_id` column. The "canonical" or "leaf" continuity for a given `(session_id, identity_id)` pair is defined as:

> The ACTIVE, non-revoked, non-expired continuity node for which no ACTIVE, non-revoked, non-expired child node exists.

This definition is operationalized exclusively by the `NOT EXISTS` anti-join inside `resolveCurrentContinuityIdentity` (`src/index.ts:2629`).

### 1.2 Primary Freshness Functions

| Function | Location | Purpose | Leaf-lineage aware? |
|----------|----------|---------|---------------------|
| `resolveCurrentContinuityIdentity` | `index.ts:2629` | Returns the leaf continuity ID + identity ID for a session | YES — via NOT EXISTS anti-join |
| `activeContinuity` | `index.ts:2623` | Returns continuity record after full ancestry validation | NO — checks ACTIVE + ancestry, not leaf |
| `resolveContinuityLineage` | `index.ts:2526` | Recursive ancestry traversal with cycle/depth/expiry checks | NO — validates ancestors, not descendant existence |
| `continuityIsRevokedOrAmbiguous` | `index.ts:2613` | Calls `resolveContinuityLineage`; returns true if lineage invalid | NO — validates ancestry, not leaf |
| `enforceLineageFreshnessBarrier` | `continuity-lineage-closure-hardening.ts:400` | Advisory freshness horizon check on ancestry chain | NO — time-based expiry only |

### 1.3 The Anti-Join Query (resolveCurrentContinuityIdentity)

```sql
SELECT c.continuity_id, c.identity_id
FROM continuity_registry c
WHERE c.session_id=?1
  AND c.identity_id=?2
  AND c.status='ACTIVE'
  AND (c.revoked_at IS NULL OR c.revoked_at='')
  AND c.expires_at>?3
  AND NOT EXISTS (
    SELECT 1 FROM continuity_registry child
    WHERE child.parent_continuity_id=c.continuity_id
      AND child.session_id=c.session_id
      AND child.identity_id=c.identity_id
      AND child.status='ACTIVE'
      AND (child.revoked_at IS NULL OR child.revoked_at='')
      AND child.expires_at>?3
  )
ORDER BY c.issued_at DESC, c.continuity_id DESC
LIMIT 1
```

**Structural observations:**

- The `NOT EXISTS` sub-query and outer query execute as one SQL statement on D1; within that single statement execution they are consistent.
- The result is computed at a single point in time. Nothing atomically binds this result to the write operations that follow.
- Scope is bounded to `(session_id, identity_id)` — leaf status is relative to a session, not the global registry.
- `ORDER BY issued_at DESC, continuity_id DESC LIMIT 1` is a tiebreaker for the degenerate case where multiple leafless candidates exist (edge condition, not the happy path).

### 1.4 Call Sites

`resolveCurrentContinuityIdentity` is called at:

| Route | Line | Check outcome |
|-------|------|--------------|
| `/authority` | `7539` | Must return non-null AND `continuity_id` must match `b.continuity_id` |
| `/validate` | `7662` | Must return non-null AND `continuity_id` must match `authority.continuity_id` |
| `/execute` | `7732` | Must return non-null AND `continuity_id` must match `authority.continuity_id` |
| `/proof` | `7891` | Must return non-null AND `continuity_id` must match `execution.continuity_id` |

In all four cases: the call precedes the write, with no transaction or serialization guarantee between the read and the write.

---

## 2. Authoritative Barrier Coverage

An **authoritative barrier** is defined here as: a write operation whose atomicity with its own precondition guards is enforced by the database engine (i.e., the condition and the write succeed or fail as a unit).

### 2.1 The Execute Write Barrier (Strongest Existing Barrier)

The `execution_registry` INSERT at `index.ts:7783–7788` uses a conditional INSERT…SELECT pattern:

```sql
INSERT INTO execution_registry (...)
SELECT ?1, ?2, ...
WHERE EXISTS (SELECT 1 FROM continuity_registry c
                WHERE c.continuity_id=?7
                  AND c.status='ACTIVE'
                  AND c.revoked_at IS NULL
                  AND c.expires_at>?6)
  AND EXISTS (SELECT 1 FROM authority_registry a
                WHERE a.decision_id=?3
                  AND a.session_id=?2
                  AND a.continuity_id=?7
                  AND a.status IN ('RESERVED','VALIDATED'))
  AND EXISTS (SELECT 1 FROM validation_registry v
                WHERE v.decision_id=?3
                  AND v.validated_object_hash=?4
                  AND v.invocation_nonce=?5
                  AND v.session_id=?2
                  AND v.continuity_id=?7
                  AND v.status='VALID' AND v.result='VALID')
  AND EXISTS (SELECT 1 FROM invocation_registry i
                WHERE i.decision_id=?3
                  AND i.validated_object_hash=?4
                  AND i.invocation_nonce=?5
                  AND i.continuity_id=?7
                  AND i.status='RESERVED')
```

This is the strongest existing barrier. The write to `execution_registry` atomically verifies: ACTIVE continuity status, authority status RESERVED/VALIDATED, valid validation record, and reserved nonce. If any condition is false, `meta.changes === 0` and execution is rejected.

**Critical gap:** The WHERE clause checks `c.status='ACTIVE'` but does NOT include `AND NOT EXISTS (child with ACTIVE status)`. A superseded parent continuity — one that has an active child — satisfies the barrier because its own status remains `ACTIVE`.

### 2.2 Barrier Coverage Map

| Route | Write operation | Barrier type | Leaf-lineage in barrier? | Barrier level |
|-------|----------------|-------------|--------------------------|---------------|
| `/authority` | `INSERT INTO authority_registry` (line 7559) | Unconditional insert | NO | OPEN |
| `/validate` | `INSERT OR IGNORE INTO invocation_registry` (line 7692) | Nonce uniqueness only | NO | OPEN |
| `/validate` | `UPDATE authority_registry SET status='RESERVED'` (line 7699) | `WHERE status IN (...)` | NO | OPEN |
| `/execute` | `INSERT INTO execution_registry WHERE EXISTS(...)` (lines 7783–7788) | Multi-condition conditional insert | NO (checks ACTIVE, not leaf) | PARTIAL |
| `/execute` | `UPDATE invocation_registry SET status='EXECUTED'` (line 7793) | Unconditional after previous check | NO | OPEN |
| `/execute` | `UPDATE authority_registry SET status='EXECUTED'` (line 7795) | Unconditional after previous check | NO | OPEN |
| `/proof` | `INSERT INTO proof_registry` (not shown in excerpt, follows line 7937) | Post-reconciliation insert | NO | OPEN |

---

## 3. Advisory-Only Freshness Paths

The following freshness checks are **advisory**: they run before writes but are not atomically bound to the writes they guard.

### 3.1 resolveCurrentContinuityIdentity (All four routes)

**Classification:** ADVISORY  
**Reason:** The NOT EXISTS anti-join result is computed, compared, and then a separate write statement executes. Between the read and the write, the leaf state can change.  
**Window:** Network + application processing time for the route (~1–100ms typical, unbounded under load).

### 3.2 activeContinuity / resolveContinuityLineage

**Classification:** ADVISORY  
**Reason:** Validates ancestry chain integrity (ACTIVE status, expiry, revocation, hash consistency, session binding) but does not check for the existence of children. A superseded parent passes this check.  
**Called at:** `/authority:7537`, `/validate:7660`, `/execute:7730`, `/proof:7889`, `/compile:7599`.

### 3.3 continuityIsRevokedOrAmbiguous (/proof only)

**Classification:** ADVISORY  
**Reason:** Calls `resolveContinuityLineage`, which validates ancestry. Does not check leaf status. A superseded but ACTIVE continuity returns `false` (not revoked, not ambiguous) from this function.  
**Called at:** `/proof:7872` (checks execution's continuity_id).

### 3.4 isFresh() / VALIDATION_FRESHNESS_WINDOW_MS / PROOF_FRESHNESS_WINDOW_MS

**Classification:** ADVISORY  
**Reason:** Wall-clock elapsed-time checks on `validation.created_at` (5-minute window) and `execution.created_at` (10-minute window). These bound replay windows but are not write-side atomically enforced.  
**Constants:** `VALIDATION_FRESHNESS_WINDOW_MS = 5 * 60_000` (index.ts:124), `PROOF_FRESHNESS_WINDOW_MS = 10 * 60_000` (index.ts:125).

### 3.5 Lineage Freshness Barrier (continuity-lineage-closure-hardening.ts:400)

**Classification:** ADVISORY (evidence-only module)  
**Reason:** This module's `enforceLineageFreshnessBarrier` is a pure computation over materialized registry views passed in. It is not called from any execution-path route handler; it is a closure-analysis tool only. Its output does not gate any write.

---

## 4. Stale-Lineage Failure Modes

### FM-1: Concurrent Child Creation Window (OPEN)

**Description:**  
Thread A calls `resolveCurrentContinuityIdentity` → sees continuity C as the leaf (no active children exist at read time). Thread B concurrently creates child continuity C2 with `parent_continuity_id = C`. Thread A then proceeds to insert an authority/validation/execution record referencing C as the canonical continuity.

**Precondition:** Two concurrent requests operating on the same `(session_id, identity_id)` pair.  
**Outcome:** Authority/validation/execution issued against a non-leaf continuity.  
**Window:** Time between `resolveCurrentContinuityIdentity` read (advisory) and write statement execution. Typically 1–50ms within a single Worker invocation, but unbounded across concurrent Workers.  
**Closure State:** OPEN at /authority and /validate write barriers. PARTIAL at /execute (execution INSERT WHERE EXISTS does not include NOT EXISTS child, but ACTIVE check provides partial containment if parent is revoked).

### FM-2: Topology Lag / Replica Visibility Gap (OPEN)

**Description:**  
D1 is a globally-distributed SQLite service. Write operations commit to a primary and propagate to read replicas. The `NOT EXISTS (child)` anti-join in `resolveCurrentContinuityIdentity` sees the state on whichever D1 replica (primary or secondary) serves the read.

**Scenario:** Worker in region A creates child continuity C2 (write goes to D1 primary). Worker in region B, microseconds later, runs `resolveCurrentContinuityIdentity` — its read may be served from a replica that has not yet received the C2 row. The NOT EXISTS evaluates to true. Worker B proceeds with stale leaf C.

**Determinism dependency:** Continuity leaf validity is topology-dependent under this failure mode.  
**Closure State:** OPEN. Cannot be closed by application-layer logic alone; requires either: (a) D1 strong-read routing, or (b) status-transition at supersession time (converting advisory NOT EXISTS into authoritative status check).

### FM-3: Execute Write Barrier Gap — Superseded ACTIVE Parent (PARTIAL)

**Description:**  
The execution INSERT WHERE EXISTS checks `c.status='ACTIVE'` but not `NOT EXISTS (active child)`. A superseded parent continuity C (which has an active child C2) satisfies `c.status='ACTIVE'` and will pass the WHERE condition. Execution proceeds against a non-leaf continuity.

**Affected surface:** `execution_registry` INSERT, lines 7783–7788.  
**Required closure element:** `AND NOT EXISTS (SELECT 1 FROM continuity_registry child WHERE child.parent_continuity_id=c.continuity_id AND child.status='ACTIVE' AND child.revoked_at IS NULL AND child.expires_at>?6)` inside the execution WHERE clause.  
**Closure State:** PARTIAL. The ACTIVE check provides containment if the superseded parent is explicitly revoked (but supersession does not trigger revocation automatically).

### FM-4: Authority Issuance Against Non-Leaf Continuity (OPEN)

**Description:**  
`/authority` calls `resolveCurrentContinuityIdentity` (advisory), checks result equals `b.continuity_id`, then executes unconditional `INSERT INTO authority_registry`. The INSERT has no WHERE conditions at all. Any valid continuity_id reaching this point will have authority inserted for it.

**Race window:** From `resolveCurrentContinuityIdentity` read to authority INSERT. If a child is created in this window, authority is issued for the superseded parent.  
**Downstream effect:** The superseded parent's authority propagates to /compile, /validate, /execute pipeline. All downstream checks reference the authority's `continuity_id`. The only downstream reclosure is the advisory `resolveCurrentContinuityIdentity` check at each subsequent route.  
**Closure State:** OPEN.

### FM-5: Validation Nonce Reservation Under Stale Leaf (OPEN)

**Description:**  
`/validate` calls `resolveCurrentContinuityIdentity` (advisory) then inserts into `invocation_registry` (nonce-uniqueness barrier only). The nonce barrier prevents replay of the same nonce but does not prevent issuance of a new nonce against a stale leaf.

**Closure State:** OPEN. Nonce is an authoritative replay barrier, not a leaf-lineage barrier.

### FM-6: Post-Execution Proof Issuance Against Superseded Lineage (PARTIAL)

**Description:**  
`/proof` calls `continuityIsRevokedOrAmbiguous(env, execution.continuity_id)` at line 7872, then `resolveCurrentContinuityIdentity` at line 7891. Both are advisory. A superseded but ACTIVE continuity passes `continuityIsRevokedOrAmbiguous` (returns false = not revoked). The leaf check via `resolveCurrentContinuityIdentity` is the only gate, and it is pre-write.

**Containment factor:** By the time `/proof` is reached, the authority has been consumed (`status='EXECUTED'`). This limits the blast radius to one proof per authority, but does not prevent the proof from being issued.  
**Closure State:** PARTIAL (bounded by authority consumption, not by leaf-freshness closure).

### FM-7: Recursive Ancestry Divergence Under Supersession (OPEN)

**Description:**  
`resolveContinuityLineage` validates that every ancestor in the chain is ACTIVE, non-expired, and non-revoked. It does NOT verify that any ancestor is a leaf. An intermediate ancestor C_k on the chain `C_root → ... → C_k → ... → C_leaf` may have been superseded by a sibling branch (C_k also has child C_k2 from a different lineage fork). The requested continuity C_leaf passes ancestry validation because C_k is ACTIVE, but C_k is not the canonical continuation of the root.

**Scope:** This failure requires a lineage fork (two children from the same parent), which the `/continuity` route may not prevent under concurrent creation.  
**Closure State:** OPEN (not currently analyzed in `resolveContinuityLineage`).

### FM-8: Stale Anti-Join Convergence Under Replay Pressure (OPEN)

**Description:**  
Under high replay pressure (repeated requests referencing the same stale parent), each request independently calls `resolveCurrentContinuityIdentity` and may observe different states depending on replica lag. Some requests see the parent as leaf (proceed), others see a child (blocked). This creates non-deterministic execution eligibility.

**Closure State:** OPEN. Convergence is not guaranteed; it depends on D1 replica catch-up time.

---

## 5. Recursive Lineage Freshness Analysis

### 5.1 Ancestor Freshness

**Status:** CLOSED  
**Mechanism:** `resolveContinuityLineage` iterates the full parent chain. For each ancestor: verifies `status='ACTIVE'`, non-expired `expires_at`, non-revoked `revoked_at`, session binding, identity binding, canonical hash match. On any failure: triggers `cascadeRevocation` or `cascadeExpiration`, returns null.

**Gap:** Ancestor freshness is verified as of the read time, not atomically with any write.

### 5.2 Descendant Freshness (Leaf Detection)

**Status:** PARTIAL  
**Mechanism:** `resolveCurrentContinuityIdentity` uses NOT EXISTS to verify no active child exists. This is called advisory-only at each route.  
**Gap:** Not enforced inside any write-side barrier. Not recursive (checks only direct active children of the candidate node, not the candidate's ancestors for child branches).

### 5.3 Lineage Supersession

**Status:** OPEN  
**Mechanism:** Supersession is implicit: a continuity is superseded when a child is created. The parent's `status` remains `ACTIVE`. There is no `SUPERSEDED` state, no atomic transition, and no cascade from parent to downstream registries at supersession time.  
**Gap:** All write-side barriers check `status='ACTIVE'`; a superseded node passes all of them.

### 5.4 Continuity Leaf Validity — Recursive Determinism

**Status:** OPEN  
**Mechanism:** Leaf validity is computed by a single NOT EXISTS anti-join scoped to `(session_id, identity_id)`. This is:
- Not recursive (does not verify that ancestors are also leaves relative to the root)
- Not transactional (advisory relative to writes)
- Topology-dependent (result varies by D1 replica)

**Deterministic convergence:** NOT GUARANTEED under concurrent child creation or topology lag.

---

## 6. Topology-Dependent Legitimacy Risks

### 6.1 D1 Consistency Properties

D1 is Cloudflare's globally-distributed SQLite service. Key consistency implications:

- **Within a single Worker request:** D1 read consistency is strong for the duration of a single HTTP handler invocation.
- **Across concurrent Worker requests:** Separate HTTP requests to separate Workers see D1 state as of their respective read times, which may be on different replicas at different replication offsets.
- **Write propagation:** A row written to D1 primary propagates to read replicas with a lag that is typically sub-second but non-zero and unbounded under network partition conditions.

### 6.2 Topology-Dependent Failure Surfaces

| Surface | Topology dependency | Risk |
|---------|-------------------|------|
| NOT EXISTS anti-join in `resolveCurrentContinuityIdentity` | Result depends on replica that serves the read | HIGH — child created on write-primary may be invisible on read-replica |
| `resolveContinuityLineage` ancestor status checks | Status of ancestors depends on replica visibility | MEDIUM — revocation cascade may be visible on one replica and not another |
| `isFresh()` wall-clock checks | Depends on Worker's local clock | LOW — bounded by freshness windows |
| Authority expiry check (`isExpired`) | Depends on Worker's local clock | LOW — bounded by expiry windows |

### 6.3 Read-Ordering Dependency

`resolveCurrentContinuityIdentity` calls `new Date().toISOString()` for the `expires_at` comparison. This timestamp is generated at the Worker invocation level, not at D1 transaction level. The timestamp used to evaluate freshness in the NOT EXISTS sub-query and the timestamp at which the subsequent INSERT executes are different system times. Under clock skew between Workers, a row that expires between the read time and write time may produce inconsistent freshness evaluations.

### 6.4 Asynchronous Lineage Propagation

`cascadeRevocation` and `cascadeExpiration` execute as fire-and-await within the current request but emit multiple sequential D1 write statements. Under partial failure (e.g., D1 write timeout after first statement), the revocation cascade may be partially applied. This creates a window where:
- `continuity_registry` shows REVOKED
- `authority_registry` still shows ACTIVE
- `validation_registry` not yet updated

The routes check each registry independently, so a partial cascade can produce inconsistent cross-registry state.

---

## 7. Continuity Supersession Semantics

### 7.1 Current Supersession Model

The current model is **advisory supersession**:
- Supersession is detected by the NOT EXISTS anti-join at query time
- The superseded node retains `status='ACTIVE'`
- No status transition, no cascade, no downstream invalidation occurs at supersession time
- The superseded node passes all status-based barriers: `c.status='ACTIVE'` in execute WHERE, `status IN ('ACTIVE','VALIDATED','RESERVED')` in authority reads, `continuityIsRevokedOrAmbiguous` (returns false)

### 7.2 Supersession vs. Revocation

| Property | Revocation | Advisory Supersession |
|----------|-----------|----------------------|
| Status transition | YES: `status='REVOKED'` | NO: parent remains `ACTIVE` |
| Cascade to authority_registry | YES: `status='REVOKED'` | NO |
| Cascade to validation_registry | YES: `status='REVOKED', result='INVALID'` | NO |
| Detectable at write-side barrier | YES: `status='ACTIVE'` check fails | NO: `status='ACTIVE'` check passes |
| Topology-stable | YES (status persists in all replicas once propagated) | NO (depends on child row visibility per replica) |

### 7.3 Supersession Convergence Under Concurrent Creation

Under concurrent creation of two child continuities C2a and C2b from parent C:
- Both see C as leaf at read time (no children)
- Both insert rows with `parent_continuity_id=C`
- `resolveCurrentContinuityIdentity` will subsequently find multiple leafless candidates and use `ORDER BY issued_at DESC, continuity_id DESC LIMIT 1` as tiebreaker
- This is a **lineage fork**: the canonical leaf is non-deterministic until one of the two children is revoked
- `CLOSURE_DRIFT_CLASSES.ANCESTRY_CYCLE` and `CLOSURE_DRIFT_CLASSES.ORPHANED_SUBTREE` in `continuity-lineage-closure-hardening.ts` classify related conditions, but these are post-hoc evidence tools, not pre-write prevention

---

## 8. Required Authoritative Barrier Expansions

### 8.1 Execute Write Barrier — Leaf-Lineage Extension (Highest Priority)

**Current condition (line 7785):**
```sql
AND EXISTS (SELECT 1 FROM continuity_registry c
              WHERE c.continuity_id=?7
                AND c.status='ACTIVE'
                AND c.revoked_at IS NULL
                AND c.expires_at>?6)
```

**Required addition (conceptual — this is analysis, not implementation):**
```sql
AND NOT EXISTS (SELECT 1 FROM continuity_registry child
                  WHERE child.parent_continuity_id=?7
                    AND child.session_id=<session_id_param>
                    AND child.identity_id=<identity_id_param>
                    AND child.status='ACTIVE'
                    AND child.revoked_at IS NULL
                    AND child.expires_at>?6)
```

**Effect:** The execution INSERT would atomically verify leaf status. A superseded parent would cause `meta.changes === 0`, triggering the existing "revoked_continuity" rejection path. This is the single highest-leverage closure target.

### 8.2 Authority Write Barrier — Conditional Insert

**Current:** Unconditional `INSERT INTO authority_registry` (line 7559).  
**Required:** Convert to conditional INSERT…SELECT with WHERE clause including ACTIVE check AND NOT EXISTS (active child), scoped to `(session_id, identity_id)`.  
**Effect:** Authority cannot be issued for a non-leaf continuity, even under race conditions.

### 8.3 Validation Nonce Barrier — Leaf-Lineage Extension

**Current:** `INSERT OR IGNORE INTO invocation_registry` prevents nonce replay but not stale-leaf nonce issuance.  
**Required:** Add NOT EXISTS (active child) condition to the invocation INSERT, or validate leaf-lineage within the same D1 batch.  
**Effect:** Nonce cannot be reserved against a non-leaf continuity.

### 8.4 Supersession Status Transition (Structural)

**Required:** When a child continuity is created (at the `/continuity` INSERT), atomically mark the parent as `status='SUPERSEDED'` (or trigger `cascadeRevocation` on the parent).  
**Effect:** Supersession becomes authoritative. All existing `status='ACTIVE'` checks immediately close the stale-parent execution surface. The NOT EXISTS anti-join becomes a secondary advisory check. Topology lag is mitigated because status propagation (a write) eventually reaches all replicas.

---

## 9. Deterministic Freshness Convergence Gaps

### Gap 1: Read-Write Non-Atomicity

**Description:** `resolveCurrentContinuityIdentity` is called at time T0 as a read. The INSERT/UPDATE that the result guards executes at time T1 > T0. No transaction or serialization mechanism binds T0 result to T1 write.  
**Deterministic convergence:** NOT GUARANTEED.

### Gap 2: Write-Side Barrier Leaf Absence

**Description:** The execute INSERT WHERE EXISTS (the only write-side conditional barrier in the system) does not include the NOT EXISTS (active child) condition. The leaf check is entirely pre-write.  
**Deterministic convergence:** NOT GUARANTEED at the write barrier level.

### Gap 3: No SUPERSEDED Status State

**Description:** Supersession is detected by the absence of a child row. The parent's `status='ACTIVE'` never changes at supersession time. All `status`-based barriers pass for superseded parents.  
**Deterministic convergence:** NOT GUARANTEED. Convergence requires the NOT EXISTS query to see the child row, which is topology-dependent.

### Gap 4: Cross-Region Anti-Join Inconsistency

**Description:** The NOT EXISTS anti-join in `resolveCurrentContinuityIdentity` evaluates on the D1 replica serving the current request. Different Workers in different regions may evaluate the same anti-join on replicas at different replication offsets.  
**Deterministic convergence:** NOT GUARANTEED across concurrent cross-region requests.

### Gap 5: Partial Cascade Visibility

**Description:** `cascadeRevocation` and `cascadeExpiration` execute multiple sequential D1 write statements (continuity_registry UPDATE, authority_registry UPDATE, validation_registry UPDATE, invocation_registry UPDATE). These are not wrapped in a single D1 transaction. A partial failure mid-cascade leaves the system in a state where some registries reflect revocation and others do not.  
**Deterministic convergence:** NOT GUARANTEED for the post-cascade state until all cascade statements complete and propagate.

### Gap 6: Lineage Fork Non-Determinism

**Description:** Concurrent creation of two child continuities from the same parent produces a lineage fork. The tiebreaker (`ORDER BY issued_at DESC, continuity_id DESC LIMIT 1`) in `resolveCurrentContinuityIdentity` produces a deterministic result per query, but different replicas with different row visibility may return different "canonical" leaves.  
**Deterministic convergence:** NOT GUARANTEED until the fork is resolved (one child revoked, or replica catch-up completes).

---

## 10. Closure-State Classification

Each continuity freshness path is classified below.

### PATH-01: resolveCurrentContinuityIdentity — Leaf Detection

| Property | Assessment |
|----------|-----------|
| Current Closure State | PARTIAL |
| Barrier Coverage | Advisory only — no write-side enforcement |
| Advisory vs Authoritative | Advisory |
| Failure Conditions | Concurrent child creation, topology lag, lineage fork |
| Recursive Dependencies | None (single-level NOT EXISTS) |
| Replay Dependencies | None directly |
| Topology Dependencies | HIGH — NOT EXISTS result topology-dependent |
| Deterministic Convergence Status | NOT GUARANTEED |
| Required Closure | Move NOT EXISTS check into execute/authority/validate write barriers atomically |
| Closure Risk Level | CRITICAL |

### PATH-02: /authority Write Barrier

| Property | Assessment |
|----------|-----------|
| Current Closure State | OPEN |
| Barrier Coverage | None — unconditional INSERT |
| Advisory vs Authoritative | N/A (no barrier) |
| Failure Conditions | Any concurrent child creation in the advisory gap |
| Recursive Dependencies | Depends on resolveCurrentContinuityIdentity result |
| Replay Dependencies | Authority_id uniqueness (UUID), no structural replay barrier |
| Topology Dependencies | HIGH — relies on advisory PATH-01 |
| Deterministic Convergence Status | NOT GUARANTEED |
| Required Closure | Conditional INSERT with NOT EXISTS (active child) |
| Closure Risk Level | HIGH |

### PATH-03: /validate Write Barrier (Nonce)

| Property | Assessment |
|----------|-----------|
| Current Closure State | OPEN (for leaf-lineage) / CLOSED (for nonce replay) |
| Barrier Coverage | Nonce replay: CLOSED. Leaf-lineage: OPEN |
| Advisory vs Authoritative | Nonce check: Authoritative. Leaf check: Advisory |
| Failure Conditions | Stale-leaf nonce issuance; concurrent child creation in advisory gap |
| Recursive Dependencies | Depends on resolveCurrentContinuityIdentity result |
| Replay Dependencies | CLOSED via invocation_registry UNIQUE constraint |
| Topology Dependencies | MEDIUM — invocation_registry write is primary-routed; leaf check is advisory |
| Deterministic Convergence Status | NOT GUARANTEED for leaf-lineage; GUARANTEED for nonce replay |
| Required Closure | Add NOT EXISTS (active child) condition to invocation INSERT |
| Closure Risk Level | HIGH |

### PATH-04: /execute Write Barrier

| Property | Assessment |
|----------|-----------|
| Current Closure State | PARTIAL |
| Barrier Coverage | Continuity ACTIVE status: CLOSED. Leaf-lineage: OPEN |
| Advisory vs Authoritative | ACTIVE check: Authoritative. Leaf check: Advisory |
| Failure Conditions | Superseded ACTIVE parent satisfies WHERE EXISTS; concurrent child creation after advisory check |
| Recursive Dependencies | Inherits PATH-01 advisory result |
| Replay Dependencies | CLOSED via invocation_registry RESERVED check (inside WHERE EXISTS) |
| Topology Dependencies | HIGH for leaf check; LOW for ACTIVE/RESERVED status checks once written |
| Deterministic Convergence Status | PARTIAL — guaranteed against explicitly revoked parents; not guaranteed against superseded ACTIVE parents |
| Required Closure | Add NOT EXISTS (active child) inside execution WHERE EXISTS clause |
| Closure Risk Level | CRITICAL |

### PATH-05: /proof Freshness Checks

| Property | Assessment |
|----------|-----------|
| Current Closure State | PARTIAL |
| Barrier Coverage | Freshness windows: Advisory-authoritative (fail-closed on stale). Leaf-lineage: Advisory |
| Advisory vs Authoritative | isFresh(): enforced pre-write (soft authoritative). continuityIsRevokedOrAmbiguous(): Advisory (does not check leaf). resolveCurrentContinuityIdentity: Advisory |
| Failure Conditions | Superseded ACTIVE continuity passes all proof checks |
| Recursive Dependencies | Inherits PATH-01 advisory result |
| Replay Dependencies | CLOSED via decision_hash UNIQUE constraint and proof deduplication logic |
| Topology Dependencies | MEDIUM — bounded by authority consumption (single execution) |
| Deterministic Convergence Status | PARTIAL — bounded blast radius per authority, but stale-leaf proof issuance possible |
| Required Closure | Add NOT EXISTS (active child) condition inside proof INSERT; or rely on PATH-02/PATH-04 closure |
| Closure Risk Level | MEDIUM (bounded by authority consumption) |

### PATH-06: Supersession Propagation

| Property | Assessment |
|----------|-----------|
| Current Closure State | OPEN |
| Barrier Coverage | None — no status transition at supersession time |
| Advisory vs Authoritative | Advisory (implicit via NOT EXISTS detection) |
| Failure Conditions | Any scenario where parent remains ACTIVE after child creation |
| Recursive Dependencies | All downstream paths that check status='ACTIVE' |
| Replay Dependencies | None |
| Topology Dependencies | CRITICAL — advisory NOT EXISTS depends on replica visibility |
| Deterministic Convergence Status | NOT GUARANTEED |
| Required Closure | Introduce SUPERSEDED status transition at child creation time; or include NOT EXISTS in all write-side barriers |
| Closure Risk Level | CRITICAL |

### PATH-07: Recursive Ancestry Validation (resolveContinuityLineage)

| Property | Assessment |
|----------|-----------|
| Current Closure State | CONTAINED |
| Barrier Coverage | Ancestor ACTIVE/expiry/revocation checks: Strong advisory with cascading side effects |
| Advisory vs Authoritative | Advisory reads with authoritative write side-effects (cascadeRevocation on detection) |
| Failure Conditions | Partial cascade visibility; topology lag on revocation propagation |
| Recursive Dependencies | Reads each ancestor sequentially; subject to inter-statement visibility |
| Replay Dependencies | None |
| Topology Dependencies | MEDIUM — each sequential ancestor read may see different replica states |
| Deterministic Convergence Status | CONTAINED (cycle detection is definitive; expiry/revocation convergence depends on cascade completion) |
| Required Closure | None for ancestor freshness itself; closure gap is the absence of descendant/leaf checks |
| Closure Risk Level | LOW (for ancestor path specifically) |

### PATH-08: Cascade Revocation Atomicity

| Property | Assessment |
|----------|-----------|
| Current Closure State | PARTIAL |
| Barrier Coverage | Multiple sequential UPDATE statements, no wrapping transaction |
| Advisory vs Authoritative | Each individual statement is atomic; the sequence is not |
| Failure Conditions | Partial application of cascade (continuity REVOKED, authority still ACTIVE) |
| Recursive Dependencies | Recursive CTE for lineage traversal (CLOSED for depth ≤ 32) |
| Replay Dependencies | None |
| Topology Dependencies | HIGH — each UPDATE propagates to replicas independently |
| Deterministic Convergence Status | PARTIAL — eventually consistent once all statements execute and propagate |
| Required Closure | Wrap cascade statements in D1 batch or transaction (if supported); or use single CTE spanning all registries |
| Closure Risk Level | HIGH |

---

## 11. Highest-Leverage Closure Targets

Ranked by impact and implementation locality:

### Target 1 (Critical): Add NOT EXISTS to Execute Write Barrier

**Location:** `src/index.ts:7785–7788` — the WHERE clause of the execution INSERT  
**What must change:** Add `AND NOT EXISTS (SELECT 1 FROM continuity_registry child WHERE child.parent_continuity_id = <continuity_id_param> AND child.status='ACTIVE' AND child.revoked_at IS NULL AND child.expires_at > <now_param>)` inside the existing WHERE EXISTS block  
**Why:** This is the only write-side atomic barrier in the system. Closing this gap prevents superseded parent execution atomically, regardless of advisory check timing or topology lag.  
**Required closure:** CLOSED  
**Risk if not closed:** Superseded parent continuity can successfully execute under concurrent child creation or topology lag.

### Target 2 (Critical): Introduce SUPERSEDED Status Transition

**Location:** `/continuity` INSERT handler — when a child continuity row is inserted  
**What must change:** Atomically `UPDATE continuity_registry SET status='SUPERSEDED' WHERE continuity_id = <parent_continuity_id>` in the same D1 batch as the child INSERT  
**Why:** Converts advisory supersession detection (NOT EXISTS) into authoritative status-based detection. All existing `status='ACTIVE'` checks immediately close. Eliminates topology dependency for supersession visibility. Enables cascadeRevocation to be triggered by status change.  
**Required closure:** CLOSED (for all downstream barriers that check status)  
**Risk if not closed:** Supersession remains advisory and topology-dependent across all paths.

### Target 3 (High): Add NOT EXISTS to Authority Write Barrier

**Location:** `src/index.ts:7559` — authority_registry INSERT  
**What must change:** Convert to conditional INSERT…SELECT with WHERE clause including NOT EXISTS (active child)  
**Why:** Prevents stale-leaf authority issuance. Closes the upstream entry point, reducing the blast radius for all downstream paths.  
**Required closure:** CLOSED  
**Risk if not closed:** Authority can be issued for non-leaf continuity, which then flows through compile/validate/execute/proof pipeline.

### Target 4 (High): Add NOT EXISTS to Validation Nonce Barrier

**Location:** `src/index.ts:7692` — invocation_registry INSERT  
**What must change:** Add NOT EXISTS (active child) condition to INSERT; or check leaf-lineage within same D1 batch as nonce insertion  
**Why:** Nonce reservation against a stale leaf consumes the replay-prevention slot while remaining against non-canonical lineage.  
**Required closure:** CLOSED  
**Risk if not closed:** Nonce reserved for non-leaf continuity; downstream execution path sees reserved nonce as valid.

### Target 5 (Medium): Wrap Cascade Revocation in D1 Batch

**Location:** `src/index.ts:2476–2506` — `invalidateContinuityLineage`  
**What must change:** Collect all UPDATE statements into a single `env.DB.batch()` call  
**Why:** Eliminates partial-cascade visibility window. Either all registry rows are updated together or none are.  
**Required closure:** CLOSED for cascade atomicity  
**Risk if not closed:** Partial revocation propagation leaves cross-registry state inconsistent.

---

## 12. Canonical Next-Layer Recommendations

### R1: Authoritative Supersession via Status Transition

The core architectural gap is that continuity supersession is advisory (NOT EXISTS) rather than authoritative (status=SUPERSEDED). The highest-leverage structural change is to introduce a `SUPERSEDED` status (or trigger `cascadeRevocation` on the parent) at child continuity creation time. This converts the leaf-freshness problem from a distributed read-consistency problem into a write-ordering problem, which D1's write consistency model can handle.

**Constraint:** This must be analyzed as a semantic change, not just an implementation change. The meaning of `SUPERSEDED` must be precisely defined: does it cascade to authority_registry? Does it block proof reads? Does it affect the reconciliation/observability routes?

### R2: Execute Barrier as the Immediate High-Confidence Target

If R1 is scoped for a future analysis cycle, the immediate highest-confidence closure is the NOT EXISTS addition to the execute INSERT WHERE EXISTS clause. This is additive (doesn't change existing logic, only adds a condition), atomically enforced by D1's INSERT…SELECT semantics, and closes the most consequential failure mode (stale-parent execution).

### R3: Classify Superseded Continuities in Closure Hardening Module

`src/continuity-lineage-closure-hardening.ts` currently classifies: DETACHED, ORPHANED_SUBTREE, ANCESTRY_CYCLE, ANCESTRY_DEPTH_EXCEEDED, FRESHNESS_CHAIN_VIOLATION, LINEAGE_EQUIVALENCE_DRIFT, REVOKED_ANCESTOR_PROPAGATION. It does not have a `SUPERSEDED_ANCESTOR` or `NON_LEAF_EXECUTION` drift class. Adding these would enable the evidence-only analysis routes to surface supersession conditions in reconciliation reporting.

### R4: D1 Write Routing for Leaf-Critical Operations

For the topology-lag failure modes (FM-2, FM-4), application-level mitigations include: routing all leaf-sensitive reads through D1's primary endpoint (if available), or implementing an optimistic-concurrency check (read leaf at T0, write with conditional WHERE asserting no child created since T0). This is a distributed systems design choice that requires analysis of D1's consistency APIs.

### R5: Audit resolveCurrentContinuityIdentity Scope Binding

The NOT EXISTS sub-query scopes child detection to `(session_id, identity_id)`. This means a child created under a different `session_id` (but same `identity_id`, i.e., same user with a new session) would not block the NOT EXISTS. Determine whether cross-session leaf detection is required for identity-scoped continuity lineage.

### R6: Lineage Fork Detection at /continuity Creation

The `/continuity` creation path should detect whether the requested `parent_continuity_id` already has an ACTIVE child (lineage fork). If the current semantics allow only one active child per parent, a conditional INSERT with NOT EXISTS (existing ACTIVE child with same parent) would prevent forks at the source rather than requiring post-hoc detection.

---

## Summary Table: Closure States by Path

| Path | Current State | Required State | Closure Risk |
|------|--------------|---------------|-------------|
| resolveCurrentContinuityIdentity leaf detection | PARTIAL | CLOSED | CRITICAL |
| /authority write barrier (leaf) | OPEN | CLOSED | HIGH |
| /validate write barrier (leaf) | OPEN | CLOSED | HIGH |
| /execute write barrier (leaf) | PARTIAL | CLOSED | CRITICAL |
| /proof write barrier (leaf) | PARTIAL | CLOSED | MEDIUM |
| Supersession status propagation | OPEN | CLOSED | CRITICAL |
| Cascade revocation atomicity | PARTIAL | CLOSED | HIGH |
| Recursive ancestry validation | CONTAINED | CONTAINED | LOW |
| Topology lag (anti-join) | OPEN | CONTAINED | HIGH |
| Lineage fork prevention | OPEN | CLOSED | HIGH |

---

*Analysis produced against: `src/index.ts`, `src/continuity-lineage-closure-hardening.ts`, `src/distributed-continuity-lineage-reconciliation.ts`, `schema.sql`, `migrations/`.*  
*No runtime state was mutated. No authority was issued. No execution was triggered. AI output is not authority. Proposal ≠ legitimacy.*
