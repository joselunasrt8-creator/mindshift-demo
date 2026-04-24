# Next Coded Prompt — Production Path (GitHub Deploy Boundary)

**Layer:** Cognition → Structure → Routing → Binding  
**Status:** Non-Operative  
**Intent Class:** Non-Executable Intent (Tier 1 Trusted Internal)

## Copy/Paste Prompt

You are generating implementation code and configuration for a **governed production deployment boundary**.

### Mission
Create a minimal, real GitHub deploy integration where **production deploys are only possible via my MindShift Worker boundary**.

The deployment chain must be strictly enforced as:

`Authority → AEO Compile → Ω Validation → Execute → Proof`

If any stage fails, deployment must stop immediately.

---

## Existing Boundary
I already have a Cloudflare Worker with these endpoints:
- `POST /authority`
- `POST /compile`
- `POST /validate`
- `POST /execute`
- `POST /proof`

---

## Required Deliverables

### 1) GitHub Actions workflow (mandatory)
Create:
- `.github/workflows/governed-deploy.yml`

Trigger:
- `workflow_dispatch` only

Inputs:
- `service` (string, required)
- `environment` (string, required, must equal `production`)

### 2) Block direct production deploy paths
- Disable or remove existing workflows that can deploy directly to production.
- Ensure governed deploy is the only production-capable path.
- Add explicit guard checks that fail if a non-governed trigger attempts production release.

### 3) Pre-execution gate (critical)
Before any deploy action:
1. Call `POST /authority` to create authority object.
2. Call `POST /compile` to produce AEO.
3. Call `POST /validate` and require `status == "VALID"`.

If validation result is anything other than `VALID`, fail closed immediately.

### 4) Execution gate
Only after `VALID`:
- Call `POST /execute` to trigger deployment (or safe simulation mode if explicitly configured).

### 5) Proof gate
After execute:
- Call `POST /proof`
- Persist proof artifact in workflow artifacts.

### 6) Exact object integrity rule (non-bypassable)
- The object sent to `/execute` must be byte-for-byte equivalent to the object that passed `/validate`.
- Implement digest/hash lock (e.g., SHA-256) between validate and execute payload.
- Fail if hash mismatch is detected.

### 7) Secrets and config
Use GitHub repository secrets:
- `WORKER_URL`
- `API_KEY` (if required by Worker auth)

Do not hardcode sensitive values.

### 8) Output format required from you
Return all of the following:
1. Full GitHub Actions YAML (complete, runnable).
2. Example `curl` **and** `fetch` calls for each endpoint.
3. Minimal Worker-side adjustments required to support this flow.
4. Clear inline comments for each security and governance checkpoint.

---

## Hard Constraints
- Beginner-friendly, but production-safe.
- Minimal abstraction; clear procedural flow.
- Fail closed on any error.
- No bypass path to production.
- No alternate direct deploy workflow.

---

## Acceptance Criteria
Implementation is accepted only if:
1. Production deploy is impossible without successful `VALID` result from boundary.
2. `/execute` payload is cryptographically bound to validated payload.
3. Proof is generated and stored for every successful execution.
4. Workflow trigger surface is restricted to governed dispatch path.

Return production-ready output.
