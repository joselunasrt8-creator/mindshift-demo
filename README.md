# mindshift-demo

Cloudflare Worker runtime backed by D1.

## Commands

### 1) Apply schema
```bash
npx wrangler d1 execute mindshift-demo-prod --remote --file schema.sql
```

### 2) Deploy
```bash
npx wrangler deploy
```

### 3) Test deterministic replay behavior
```bash
curl -s https://mindshift-demo.joselunasrt8.workers.dev/replay-test
```

Expected replay safety fields in the JSON response:

```json
{
  "first_attempt": "EXECUTED",
  "authority_status_after_first": "CONSUMED",
  "replay_attempt": "BLOCKED",
  "system_result": "NON_REPLAYABLE_EXECUTION_CONFIRMED"
}
```

## Production deploys are governed by MindShift

Production deployment is locked behind `.github/workflows/governed-deploy.yml` and can only be started with `workflow_dispatch` when `environment=production` (the first non-bypassable production path in this repo).

Governed sequence (fail-closed):
1. `POST /authority`
2. `POST /compile`
3. `POST /validate`
4. If validation is not `VALID`, deployment stops (fail closed).
5. `POST /execute`
6. `POST /proof`

Proof records include:
- `run_id`
- `commit_sha`
- `workflow`
- `environment`

### Existing deploy workflows and production bypass status

- `transfer.yml`: still available for legacy/non-production flow, but now explicitly blocks production and directs users to `governed-deploy.yml`.
- `mindshift-demo.yml`, `transfer-v2-frozen.yml`, `transfer-v3.yml`, and `governed-dispatch-target.yml`: repository dispatch based examples for governed or test transfer surfaces; not the production entrypoint.

### Remaining bypass risks

- A repository admin could still manually edit workflow files on a branch and merge policy changes.
- A repository admin could still create a new workflow that deploys directly.
- Secret misuse (ex: compromised `MINDSHIFT_WORKER_URL`, `MINDSHIFT_API_KEY`, or GitHub token) could bypass intent.

Mitigations should include branch protection, required reviews/CODEOWNERS for `.github/workflows/**`, restricted environment approvals, and least-privilege secret scope.
