# Conformance Pack v1 — External Adoption Guide

Stage 3 install-base expansion path for external repositories.

---

## Purpose

This guide explains how an external repository can adopt
`conformance/pack-v1` — the portable ContinuityOS legitimacy invariant
verification pack — without access to the canonical ContinuityOS runtime.

The pack is zero-dependency, self-contained, and produces machine-readable
evidence that your codebase understands the core legitimacy invariants.

---

## Target Audience

Repository owners and maintainers who want to:

- verify their execution surfaces comply with ContinuityOS legitimacy semantics
- emit conformance evidence as part of a CI pipeline
- earn and display a conformance badge
- participate in the ContinuityOS install-base expansion

No familiarity with the canonical ContinuityOS runtime is required.

---

## Prerequisites

- Node.js 18 or later
- A Git repository you control
- No additional npm packages are required

---

## Copy / Install Options

### Option A — Direct copy

```bash
cp -r /path/to/mindshift-demo/conformance/pack-v1 ./conformance/pack-v1
```

### Option B — Sparse checkout (no full clone)

```bash
git clone --depth 1 --filter=blob:none --sparse \
  https://github.com/joselunasrt8-creator/mindshift-demo
cd mindshift-demo
git sparse-checkout set conformance/pack-v1
cp -r conformance/pack-v1 /path/to/your-repo/conformance/
```

After copying, your repository layout should include:

```
conformance/pack-v1/
  README.md
  harness.mjs
  fixtures/
    aeo-valid.json
    aeo-mutated.json
    aeo-missing-key.json
    continuity-intact.json
    continuity-detached.json
    replay-consumed.json
    replay-resurrection-attempt.json
  vectors/
    validator.json
    replay.json
    proof.json
    convergence.json
```

Commit the entire `conformance/pack-v1/` directory to your repository.

---

## Run Command

```bash
node conformance/pack-v1/harness.mjs
```

Exit code 0 = all 15 checks pass.
Exit code 1 = at least one check failed.

To capture output for submission or CI artifact upload:

```bash
node conformance/pack-v1/harness.mjs 2>&1 | tee conformance-pack-v1-output.txt
```

The harness also writes a structured JSON evidence artifact alongside itself:

```
conformance/pack-v1/conformance-pack-v1-evidence.json
```

---

## Expected Output

A fully passing run produces:

```
=== ContinuityOS MindShift — Conformance Pack v1 ===
Stage: 3  |  Mode: Evidence-Only  |  Authority: None

Invariants:
  If no valid object exists → nothing happens
  validated_object == executed_object
  capability ≠ authority
  proof existence ≠ distributed finality
  conformance ≠ execution authority

[VALIDATOR] validator.json
  VALIDATOR-01 PASS — valid AEO: all required fields present; mutation_capable false
  VALIDATOR-02 PASS — mutated AEO: mutation_capable true; _mutation_marker present — fails closed (NULL)
  VALIDATOR-03 PASS — AEO missing governed_tool_envelope_id — fails closed (NULL)
  VALIDATOR-04 PASS — canonical hash: deterministic across two computations of the same object [sha256: ...]

[REPLAY] replay.json
  REPLAY-01 PASS — consumed nonce: replay_state CONSUMED; restoration_eligible false — any reuse returns NULL
  REPLAY-02 PASS — replay resurrection attempt: resurrection_claim true on CONSUMED nonce — NULL enforced
  REPLAY-03 PASS — unused nonce: replay_state UNUSED — eligible for first-and-only use

[PROOF] proof.json
  PROOF-01 PASS — append-only: proof state forward transitions only; backwards transitions forbidden
  PROOF-02 PASS — detached continuity: null predecessor lineage — classified DETACHED; no valid authority path
  PROOF-03 PASS — proof existence ≠ finality: local_proof_exists=true with global_quorum_attested=false — LOCAL_VALID only

[CONVERGENCE] convergence.json
  CONV-01 PASS — local-only context: quorum_size 1, result_claim LOCAL_VALID — GLOBAL_VALID is forbidden
  CONV-02 PASS — partition detected: partition_detected true — execution suspended; PARTITION_SUSPENDED
  CONV-03 PASS — conflicting proof roots: conflicting_proof_roots true — CONFLICTED classification
  CONV-04 PASS — quorum disagreement: quorum_disagree true — AMBIGUOUS; GLOBAL_VALID is forbidden
  CONV-05 PASS — settled convergence: converged and epoch_match true — CONVERGED (not GLOBAL_VALID; conformance ≠ authority)

CONFORMANCE_EVIDENCE_OBSERVED
VALIDATION_FAIL_CLOSED_CONFIRMED
REPLAY_CONSUMPTION_PRESERVED
PROOF_APPEND_ONLY_CONFIRMED
CONVERGENCE_CLASSIFICATION_CORRECT
PACK_V1_CONFORMANCE_COMPLETE

=== Summary ===
Total:  15  |  PASS: 15  |  FAIL: 0
Authority created:         false
Deployment performed:      false
Runtime mutation capable:  false
Production proof emitted:  false

CONFORMANCE_EVIDENCE_OBSERVED
```

The machine-readable pass signals are the terminal lines:

```
PACK_V1_CONFORMANCE_COMPLETE
CONFORMANCE_EVIDENCE_OBSERVED
```

---

## Evidence Artifact Format

The JSON evidence file (`conformance-pack-v1-evidence.json`) contains:

| Signal | Meaning |
|--------|---------|
| `CONFORMANCE_EVIDENCE_OBSERVED` | Harness ran to completion |
| `VALIDATION_FAIL_CLOSED_CONFIRMED` | Invalid objects produce NULL (not partial results) |
| `REPLAY_CONSUMPTION_PRESERVED` | Consumed nonces cannot be reused or resurrected |
| `PROOF_APPEND_ONLY_CONFIRMED` | Proof state transitions are forward-only |
| `CONVERGENCE_CLASSIFICATION_CORRECT` | Convergence states are classified correctly |
| `PACK_V1_CONFORMANCE_COMPLETE` | All 15 checks passed |

The JSON evidence file records `authority_created: false`, `deployment_performed: false`,
`runtime_mutation_capable: false`, and `production_proof_emitted: false`.

---

## Badge Semantics

Add the conformance badge to your README once a full-pass run is captured:

```markdown
[![ContinuityOS Conformant](https://img.shields.io/badge/ContinuityOS-Conformant-4caf50?style=flat-square)](https://github.com/your-org/your-repo/blob/main/conformance-pack-v1-output.txt)
```

Update the link to point to your committed evidence file.

### What the badge proves

| Claim | Verified by |
|-------|-------------|
| Invalid objects fail closed (NULL) | VALIDATOR-02, VALIDATOR-03 |
| Required field absence → NULL | VALIDATOR-03 |
| Canonical hash is deterministic | VALIDATOR-04 |
| Consumed nonce blocks reuse | REPLAY-01 |
| Resurrection attempt returns NULL | REPLAY-02 |
| Proof state is append-only | PROOF-01 |
| Local proof ≠ distributed finality | PROOF-03 |
| Single-node result is LOCAL_VALID only | CONV-01 |
| Partition suspends execution | CONV-02 |
| Quorum disagreement produces AMBIGUOUS | CONV-04 |

### What the badge does NOT prove

```
badge ≠ authority
badge ≠ execution permission
badge ≠ security certification
badge ≠ distributed finality
badge ≠ production proof
```

| Claim | Status |
|-------|--------|
| Production deployment has occurred | NOT implied |
| Authority has been granted | NOT implied |
| The system is secure in all respects | NOT implied |
| GLOBAL_VALID has been reached | NOT implied |
| Distributed finality has been achieved | NOT implied |
| Legal or regulatory compliance | NOT implied |
| Real-world external adoption exists | NOT implied |

---

## Limitations

- The pack runs against fixed fixtures. It does not inspect your live runtime.
- Pass evidence is point-in-time. Re-run after any changes to governed workflows,
  the legitimacy runtime, or the conformance pack itself.
- The harness does not connect to any network and cannot validate remote state.
- A passing run classifies invariant compatibility. It does not grant execution
  permission, authority, or legitimacy status within the ContinuityOS runtime.

---

## Non-Operative Boundary

This pack is documentation and evidence infrastructure only.

```
conformance evidence ≠ authority
pack output ≠ production proof
harness execution ≠ runtime validation
badge ≠ execution permission
observability ≠ legitimacy
fixture pass ≠ deployed enforcement
```

All fixtures carry `_non_operative: true`.
All vector suites carry `non_operative: true, observability_only: true,
runtime_mutation_capable: false`.

Running the pack:

- does not create authority
- does not perform deployment
- does not generate production proof
- does not mutate runtime state
- does not consume replay nonces
- does not widen execution eligibility
- does not require network access
- does not require the ContinuityOS runtime

---

## Install-Base Interpretation

Install-base for Conformance Pack v1 is not measured by:

- stars
- downloads
- prompt invocations
- chatbot sessions

Install-base means:

```
workflow dependency
+ execution dependency
+ governance dependency
```

The first measurable install-base unit is:

```
external repository runs legitimacy conformance evidence
before treating an execution surface as governed
```

A repository that commits `conformance/pack-v1/`, runs it in CI, and gates
governed execution on a passing harness result is the minimum adoption unit.

---

## CI Integration Example

Add a GitHub Actions job to run the pack on every push:

```yaml
# .github/workflows/conformance.yml
name: Conformance Pack v1

on:
  push:
    branches: ["**"]
  pull_request:

jobs:
  conformance-pack-v1:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"

      - name: Run Conformance Pack v1
        run: |
          node conformance/pack-v1/harness.mjs 2>&1 | tee conformance-pack-v1-output.txt
          grep -q "PACK_V1_CONFORMANCE_COMPLETE" conformance-pack-v1-output.txt

      - name: Upload evidence artifact
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: conformance-pack-v1-evidence
          path: |
            conformance-pack-v1-output.txt
            conformance/pack-v1/conformance-pack-v1-evidence.json
```

The `grep` step fails the job if `PACK_V1_CONFORMANCE_COMPLETE` is absent,
ensuring the workflow gates on a clean pass.

---

## Integration Checklist

- [ ] `conformance/pack-v1/` is copied into the repository
- [ ] `node conformance/pack-v1/harness.mjs` runs without errors (exit code 0)
- [ ] Output ends with `PACK_V1_CONFORMANCE_COMPLETE`
- [ ] `conformance-pack-v1-output.txt` is captured and committed (or uploaded as CI artifact)
- [ ] `conformance/pack-v1/conformance-pack-v1-evidence.json` is present
- [ ] CI workflow runs the harness on every push or PR
- [ ] Badge markup is added to README (linking to evidence file)
- [ ] No runtime code was modified during adoption
- [ ] No authority claims have been added to documentation
- [ ] Evidence file is treated as observability, not as proof of deployment

---

## Contributor Workflow

Contributions to the pack itself should be submitted upstream to
`joselunasrt8-creator/mindshift-demo` via governed pull request.

When updating a local copy of the pack:

1. Pull the latest `conformance/pack-v1/` from the upstream repository.
2. Re-run `node conformance/pack-v1/harness.mjs` and confirm 15/15 pass.
3. Commit the updated pack and new evidence file together.
4. Do not modify fixture or vector files unless you are intentionally testing
   a failure case — modified fixtures invalidate the evidence signal.

---

## Governance Boundary Statement

This pack is a portable verification tool. It does not alter the governance
model of any repository that adopts it.

```
conformance evidence ≠ runtime governance
pack adoption ≠ ContinuityOS runtime deployment
harness pass ≠ authority grant
evidence artifact ≠ proof finality
install-base participation ≠ runtime membership
```

Repositories that run the pack are verifying invariant compatibility.
They are not enrolling in the ContinuityOS runtime, acquiring authority,
or gaining execution permissions of any kind.

The canonical invariants remain:

```
If no valid object exists → nothing happens.

Proposal ≠ authority.
Capability ≠ permission.
Visibility ≠ legitimacy.

validated_object == executed_object.

No valid continuity lineage
→ no valid authority
→ no valid execution.
```

These invariants hold regardless of conformance pack adoption status.
