# mindshift-demo

Cloudflare Worker runtime backed by D1.

## Commands

### 1) Apply schema
```bash
npx wrangler d1 execute mindshift-demo-prod --remote --file schema.sql
```

### 2) Apply D1 migrations (governed deploy prerequisite)
```bash
npx wrangler d1 migrations apply mindshift-demo-prod --remote
```

### 3) Deploy
```bash
npx wrangler deploy
```

### 4) Test deterministic replay behavior
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

## PR validation gate (MindShift VALID | NULL)

This repository can enforce the merge path below for pull requests into `main`:

`PR -> MindShift /validate-pr -> VALID | NULL -> merge allowed or blocked`

### 1) Required GitHub Actions workflow

Workflow file: `.github/workflows/mindshift-validate-pr.yml`

What it does:
1. Triggers on pull requests (`opened`, `synchronize`, `reopened`).
2. Runs only when the base branch is `main`.
3. Collects repo, base branch, PR number, and changed files.
4. Sends payload to `POST /validate-pr`.
5. Fails closed if response is not `{"result":"VALID"}`.

### 2) Validation payload shape

```json
{
  "repo": "owner/repo",
  "base_branch": "main",
  "pr_number": 42,
  "changed_files": ["src/index.ts", "README.md"]
}
```

### 3) Example request (curl)

```bash
curl -sS -X POST "https://your-worker.example.workers.dev/validate-pr" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{
    "repo": "owner/repo",
    "base_branch": "main",
    "pr_number": 42,
    "changed_files": ["src/index.ts", "README.md"]
  }'
```

### 4) Example request (fetch)

```js
const response = await fetch('https://your-worker.example.workers.dev/validate-pr', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-api-key': process.env.MINDSHIFT_API_KEY ?? ''
  },
  body: JSON.stringify({
    repo: 'owner/repo',
    base_branch: 'main',
    pr_number: 42,
    changed_files: ['src/index.ts', 'README.md']
  })
});

const data = await response.json();
console.log(data);
```

### 5) Minimal Cloudflare Worker handler (`/validate-pr`)

```js
export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/validate-pr') {
      const payload = await request.json();
      const { repo, base_branch, pr_number, changed_files } = payload;

      // Replace this placeholder logic with your MindShift validation model.
      const isValidShape =
        typeof repo === 'string' &&
        typeof base_branch === 'string' &&
        Number.isInteger(pr_number) &&
        Array.isArray(changed_files);

      if (!isValidShape) {
        return Response.json(
          {
            result: 'NULL',
            reasons: ['Invalid payload shape']
          },
          { status: 400 }
        );
      }

      // Example policy: mark VALID by default.
      return Response.json({ result: 'VALID' });
      // or Response.json({ result: 'NULL', reasons: ['Policy failed'] }, { status: 200 });
    }

    return new Response('Not found', { status: 404 });
  }
};
```

### 6) Enable branch protection (required)

In GitHub: `Settings -> Branches -> Add branch protection rule` for branch name pattern `main`.

Enable all of the following:
1. **Require a pull request before merging**.
2. **Require status checks to pass before merging**.
   - Add required check: **`mindshift-validate-pr`**.
3. **Restrict who can push to matching branches** (or equivalent rule in rulesets) so direct pushes to `main` are blocked.
4. (Recommended) Enable **Do not allow bypassing the above settings**.

Also add repository secrets:
- `MINDSHIFT_WORKER_URL` = your Worker base URL
- `MINDSHIFT_API_KEY` = API key used by your Worker (if enforced)

Once enabled, PRs to `main` cannot merge unless MindShift returns `VALID`.
