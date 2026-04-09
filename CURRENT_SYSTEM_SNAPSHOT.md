# MindShift — Current System Snapshot

*A plain-language overview of what has been built, what it proves, and what still needs work.*

---

## What Is MindShift?

MindShift is a demonstration of **governed execution**: a system where no action can take place unless a valid authority object exists and has been independently verified. Think of it as a lock that can only be opened with a specific, cryptographically verified key — and that produces a receipt every time it is used.

The central rule is simple:

> **No valid authority → no execution. Always.**

---

## The Runtime Chain

Every action in MindShift flows through this exact sequence:

```
Authority
    ↓
AEO  (Atomic Execution Object)
    ↓
Validator
    ↓
Execution Surface
    ↓
Proof-of-Transfer
```

| Stage | Plain-language meaning |
|---|---|
| **Authority** | A human decision, identified by a unique ID (`decision_id`), authorising a specific action. |
| **AEO** | A structured description of that action: what it is, where it targets, when it expires, and what its scope is. |
| **Validator** | An independent service that inspects the AEO and the decision ID, checks the cryptographic signature, and returns either `VALID` or `NULL`. It never interprets intent — it only checks structure and signature. |
| **Execution Surface** | The system that actually does something (sends a webhook, calls an API). It only runs after the Validator returns `VALID`. |
| **Proof-of-Transfer** | A tamper-evident record, saved as a file artifact, confirming that the execution occurred and linking it back to the validated authority. |

---

## What Exists

### `server.js` — The Validator API

A small Node.js/Express web server that runs on port 3000.

**What it does:**

- Exposes `POST /validate` — the only endpoint that can authorise execution.
- Requires every request to include a bearer token (`Authorization: Bearer <token>`). Requests without a valid token are rejected with HTTP 401.
- Checks that the `decision_id` is exactly `MS-DEMO-DEPLOY-001`.
- Checks that the `repo` field is exactly `mindshift-demo`.
- Checks that the `branch` field is exactly `main`.
- Verifies the cryptographic `signature` (SHA-256 of the decision ID concatenated with the canonical form of the AEO object).
- Verifies that all required AEO fields are present: `intent`, `scope`, `validation`, `target`, `finality`, `expires_at`.
- Checks that `expires_at` is a valid future date — expired authority is rejected.
- Returns `{ "status": "VALID" }` only when every check passes. Any failure returns `{ "status": "NULL", "reason": "..." }`.
- Exposes `GET /health` (and `GET /`) as public readiness probes — these do not touch validation logic.

**Key property:** The validator is **fail-closed**. A missing field, wrong value, bad signature, or expired object all produce `NULL`. There is no partial authorisation state.

---

### `gateway.js` — The Programmatic Execution Gateway

A separate Node.js/Express server on port 4000 that acts as the programmatic entry point for execution requests.

**What it does:**

- Exposes `POST /execute` for callers that want to trigger a governed action programmatically.
- Validates that all required fields are present in the request: `decision_id`, `signature`, `target_key`, `aeo`, `run_id`, `commit_sha`.
- Resolves the target URL from a hard-coded internal allowlist keyed by `target_key`. Callers **cannot** supply their own target URL — only pre-approved keys are accepted (`api-production`, `api-staging`).
- Injects `repo` and `branch` from its own environment variables — callers cannot override these values.
- Calls the Validator (`POST /validate`) before forwarding the request. If the Validator returns anything other than `VALID`, the gateway returns HTTP 403 and the request stops there.
- Logs every execution attempt as a structured JSON record (including the validator status).
- Exposes `GET /health` as a public readiness probe.
- Fails to start entirely if `VALIDATOR_URL`, `REPO_NAME`, or `BRANCH_NAME` are not set.

**Key property:** The gateway is a scope-enforcing proxy. It prevents callers from controlling which repo, branch, or target URL is used.

---

### `aeo.json` — The Atomic Execution Object

The signed description of the one governed action in this demonstration.

```json
{
  "intent": "deploy",
  "scope": "production",
  "validation": "approved",
  "target": "api",
  "finality": "confirmed",
  "expires_at": "2027-01-01T00:00:00Z"
}
```

This file is the canonical source of truth for the AEO. The SHA-256 signature sent to the Validator is computed from this file's content (with keys sorted alphabetically). Changing any field invalidates the signature.

---

### GitHub Workflow — `mindshift-demo.yml`

Triggered on every pull request and on manual dispatch.

**Job sequence:**

1. **`validate`** — Starts the Validator API locally, waits for it to be ready, computes the AEO signature, and calls `POST /validate`. If the response is not `VALID`, the workflow fails and no execution jobs run.
2. **`execute-surface-1`** *(needs: validate)* — Sends a governed webhook to a logging endpoint (`webhook.site`).
3. **`execute-surface-2`** *(needs: validate)* — Simulates an API surface execution (logs the decision and commit).
4. **`combine-proof`** *(needs: execute-surface-1, execute-surface-2)* — Generates `proof/proof-of-transfer.json` and uploads it as a downloadable artifact named `proof-of-transfer`.

---

### GitHub Workflow — `transfer.yml`

Triggered on every push to `main` and on manual dispatch.

**Job sequence:**

1. **`validate`** — Same validation logic as `mindshift-demo.yml`: starts the Validator locally, polls for readiness, computes the signature, calls `POST /validate`, and fails closed if the response is not `VALID`.
2. **`transfer`** *(needs: validate)* — Sends the governed webhook (with rate-limit handling) and then generates and uploads `proof/proof-of-transfer.json` as artifact `proof-of-transfer`.

---

### Proof Artifact Generation

Both workflows produce a `proof-of-transfer.json` file that is stored as a GitHub Actions artifact. The proof is only generated after successful validation **and** execution. It is never generated on a failed validation path.

---

## What Has Been Proven

| Capability | Evidence |
|---|---|
| Validator rejects requests without a bearer token | `server.js` returns HTTP 401 when the `Authorization` header is missing or the token does not match `VALIDATOR_TOKEN`. |
| Validator rejects invalid or missing fields | Every required field is checked; any failure returns `{ "status": "NULL" }`. |
| Validator rejects incorrect `decision_id`, `repo`, or `branch` | Hard-coded equality checks in `server.js` prevent scope drift. |
| Validator rejects a wrong or missing cryptographic signature | SHA-256 is recomputed server-side from canonical JSON; mismatches return `NULL`. |
| Validator rejects expired authority | `expires_at` is checked against the current time; past dates return `NULL`. |
| Execution surfaces do not run without `VALID` | Both workflows use `needs: validate`; GitHub Actions will not start downstream jobs if the validate job fails. |
| Gateway prevents callers from overriding repo, branch, or target URL | `repo` and `branch` come from environment variables set at deploy time; target URLs come from an internal allowlist. |
| Gateway fails closed on any non-`VALID` response from the Validator | `validatorStatus !== 'VALID'` triggers HTTP 403 before any forwarding occurs. |
| Proof-of-transfer is only produced after successful execution | The proof job depends on both execution surface jobs completing successfully. |
| Proof-of-transfer is cryptographically linked to the AEO and decision ID | `decision_id_hash` and `aeo_hash` are SHA-256 digests computed at runtime. |
| Gateway refuses to start without required environment variables | Explicit `process.exit(1)` calls in `gateway.js` if `VALIDATOR_URL`, `REPO_NAME`, or `BRANCH_NAME` are missing. |

---

## What Is Not Yet Proven

| Area | Current gap |
|---|---|
| **Production deployment** | The execution surfaces in this demo point to `webhook.site` (a public logging endpoint) and a simulated echo. No real production system is connected. |
| **Multiple AEOs / multiple decision IDs** | The validator is hard-coded to accept only `decision_id = MS-DEMO-DEPLOY-001` and only the single `aeo.json` in this repository. A production system would need a registry of authorised AEOs. |
| **Dynamic scope enforcement** | `repo` and `branch` are validated against hard-coded strings. A production system would manage scope through configuration or a database. |
| **Token rotation and secrets management** | `VALIDATOR_TOKEN` and `DECISION_ID` are stored as GitHub Actions secrets. There is no rotation policy, revocation mechanism, or external secrets manager in place. |
| **Gateway deployed as a long-running service** | `gateway.js` exists in the repository but is not yet deployed anywhere. It is not part of the automated workflows; it is available for local testing only. |
| **Audit log persistence** | The gateway writes structured JSON logs to stdout, but these are not yet captured, forwarded, or stored durably. |
| **Proof artifact verification** | The proof artifact is uploaded to GitHub Actions storage. There is no automated step that verifies the artifact's integrity after upload or compares it against a tamper-evident store. |
| **Expiry enforcement beyond static date** | `expires_at` in `aeo.json` is currently set to `2027-01-01T00:00:00Z`. There is no automated process for updating or rotating the expiry date. |
| **Multi-environment support** | There is one environment (`main` branch, `mindshift-demo` repo). Staging, canary, or feature-branch environments are not modelled. |

---

## Validation Matrix

This table shows how each component enforces the governed execution contract.

| Check | Enforced by | How |
|---|---|---|
| Bearer token present and correct | `server.js` | Reads `Authorization` header; rejects with HTTP 401 if missing or wrong. |
| `decision_id` equals `MS-DEMO-DEPLOY-001` | `server.js` | Strict equality check; returns `NULL` on mismatch. |
| `repo` equals `mindshift-demo` | `server.js` | Strict equality check; returns `NULL` on mismatch. |
| `branch` equals `main` | `server.js` | Strict equality check; returns `NULL` on mismatch. |
| All AEO fields present (`intent`, `scope`, `validation`, `target`, `finality`, `expires_at`) | `server.js` | Iterates over required field list; returns `NULL` if any are null or empty. |
| `expires_at` is a valid future ISO 8601 date | `server.js` | Parses the string as a `Date`; checks `Date.now() < expiresAt.getTime()`. |
| Signature matches SHA-256 of `decision_id + canonicalJson(aeo)` | `server.js` | Recomputes the digest server-side; returns `NULL` on mismatch. |
| Validator returns `VALID` before execution | Both GitHub workflows | `needs: validate`; the validate job calls `POST /validate` and exits non-zero if not `VALID`. |
| Caller cannot override `repo` or `branch` | `gateway.js` | Both values are read from environment variables, not from the request body. |
| Caller cannot supply an arbitrary target URL | `gateway.js` | Target URL is resolved from an internal allowlist; unknown `target_key` returns HTTP 400. |
| Proof is only generated after execution | Both GitHub workflows | `combine-proof` / `Write Proof Artifact` steps depend on execution jobs completing. |
| Canonical JSON is deterministic | `server.js`, both workflows | Keys are sorted alphabetically at every nesting level before hashing. |

---

## Security Model

**Principle: fail closed everywhere.**

- The Validator returns `VALID` only when every single check passes. Any error, missing field, wrong value, or network failure results in `NULL` or an HTTP error — never a permissive default.
- GitHub Actions workflows exit non-zero (`exit 1`) if the Validator does not return `VALID`. Downstream execution jobs are blocked by `needs:` dependencies.
- The Gateway exits the process at startup if required environment variables are missing.
- The Gateway returns HTTP 403 (never HTTP 200) on any non-`VALID` validator response.

**Principle: scope is immutable from the execution path.**

- `repo` and `branch` are injected by the environment at deploy time in the gateway — they cannot be changed by API callers.
- Target URLs are resolved from a server-side allowlist — callers supply a key, not a URL.
- The Validator hard-codes the permissible `decision_id`, `repo`, and `branch` values — no request payload can override these.

**Principle: signatures tie authority to content.**

- The `signature` field is a SHA-256 hex digest of `decision_id` concatenated with the canonical JSON of the AEO. Changing either the decision ID or any field of the AEO produces a different signature and causes validation to fail.
- Canonical JSON (keys sorted alphabetically at all levels, no whitespace) ensures the signature is byte-for-byte identical regardless of the order in which keys appear in the original JSON.

**Principle: authentication at the boundary.**

- `POST /validate` requires a bearer token. The token is stored as a GitHub Actions secret and is never written to logs or artifacts.
- Public routes (`GET /health`, `GET /`) are read-only and carry no execution power.

**Current limitations:**

- Token and decision ID are hard-coded strings with no rotation or revocation mechanism.
- There is no rate limiting on the Validator API.
- The proof artifact is stored in GitHub Actions storage without a secondary integrity check.

---

## Proof-of-Transfer Schema

Every successful workflow run produces a `proof/proof-of-transfer.json` artifact. The file structure is:

```json
{
  "run_id": "<GitHub Actions run ID>",
  "commit_sha": "<Git commit SHA that triggered the run>",
  "repository": "<owner/repo>",
  "timestamp": "<ISO 8601 UTC timestamp of proof generation>",
  "decision_id_hash": "<SHA-256 hex digest of the decision_id string>",
  "aeo_hash": "<SHA-256 hex digest of the compact JSON of aeo.json>",
  "execution_surfaces": ["webhook", "api"],
  "validation_status": "valid",
  "expires_at": "<expires_at value from aeo.json>",
  "validated_at": "<ISO 8601 UTC timestamp matching timestamp>"
}
```

| Field | How it is computed | What it proves |
|---|---|---|
| `run_id` | GitHub Actions `${{ github.run_id }}` | Links the proof to a specific workflow run. |
| `commit_sha` | GitHub Actions `${{ github.sha }}` | Links the proof to the exact code state at execution time. |
| `repository` | GitHub Actions `${{ github.repository }}` | Confirms which repository ran the workflow. |
| `timestamp` | `date -u` at proof generation time | Records when the proof was created. |
| `decision_id_hash` | `echo -n "$DECISION_ID" \| sha256sum` | A one-way fingerprint of the decision ID (does not expose the raw secret). |
| `aeo_hash` | `jq -c . aeo.json \| sha256sum` | Fingerprint of the AEO content; changes if the AEO is modified. |
| `execution_surfaces` | Hard-coded list matching the surfaces that ran | Documents which surfaces were reached. |
| `validation_status` | Hard-coded `"valid"` in the proof step | Confirms the proof was only generated on a passing path. |
| `expires_at` | Read from `aeo.json` via `jq` | Carries forward the authority expiry into the proof record. |
| `validated_at` | Same `date -u` value as `timestamp` | Records when validation was considered complete. |

The proof artifact is uploaded to GitHub Actions artifact storage under the name `proof-of-transfer`. It is not committed to the repository.

---

## Current System Status

| Item | Status |
|---|---|
| Validator API (`server.js`) | ✅ Implemented. Passes all validation checks. Fail-closed. Ready to run locally with `npm start`. |
| Gateway (`gateway.js`) | ✅ Implemented. Enforces scope, calls Validator, blocks non-`VALID` requests. Available for local testing; not yet deployed as a service. |
| AEO (`aeo.json`) | ✅ Present. Contains all required fields. Expires 2027-01-01. |
| `mindshift-demo` workflow | ✅ Implemented. Covers validate → two execution surfaces → combined proof. Runs on pull requests and manual dispatch. |
| `transfer` workflow | ✅ Implemented. Covers validate → webhook execution → proof. Runs on push to `main` and manual dispatch. |
| Proof-of-transfer artifact | ✅ Generated and uploaded by both workflows after successful execution. |
| Production execution targets | ⚠️ Not connected. Current targets are a public logging webhook and a simulated echo step. |
| Deployed Gateway service | ⚠️ Not deployed. `gateway.js` is available locally only. |
| Multi-AEO / multi-decision support | ⚠️ Not implemented. Single hard-coded decision ID and single AEO file. |
| Token rotation / secrets management | ⚠️ Not implemented. Secrets are static GitHub Actions secrets. |
| Durable audit log | ⚠️ Not implemented. Gateway logs to stdout only. |

**Summary:** The core governance chain — Authority → AEO → Validator → Execution Surface → Proof-of-Transfer — is fully implemented and operational as a demonstration. Every enforcement rule is active, fail-closed, and verified by the workflow structure. The remaining gaps are all about connecting the prototype to real production targets, scaling to multiple authority objects, and adding operational infrastructure (secret rotation, audit storage, deployed gateway).
