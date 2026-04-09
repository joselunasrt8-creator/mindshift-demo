# mindshift-demo
MindShift execution boundary demo

## Architecture

```
Authority
    ↓
   AEO
    ↓
Validator
    ↓
Execution Surface
    ↓
Proof-of-Transfer
```

GitHub Actions serves as the execution runtime. The validator API enforces governed execution rules before any surface is reached. The gateway enforces the same contract for programmatic callers.

## External Validator Configuration

The workflows expect the validator to be running as an always-on external service. No validator process is started inside GitHub Actions.

### Required GitHub secrets

Add the following secrets to the repository under **Settings → Secrets and variables → Actions**:

| Secret            | Description                                                                                   |
|-------------------|-----------------------------------------------------------------------------------------------|
| `VALIDATOR_URL`   | Base URL of the external validator service, without trailing slash (e.g. `https://validator.example.com`) |
| `VALIDATOR_TOKEN` | Bearer token used to authenticate requests to the external validator service                  |

The `validate` job in each workflow will:
1. Call `GET $VALIDATOR_URL/health` and fail immediately if the request fails or the HTTP status is non-2xx.
2. POST the execution request to `$VALIDATOR_URL/validate` with an `Authorization: Bearer $VALIDATOR_TOKEN` header.
3. Fail closed if the HTTP request fails or the response is anything other than `{ "status": "VALID" }`.

## Validator API

A minimal Node.js/Express server that validates execution authority before allowing governed actions to proceed. This can be deployed as a standalone service and exposed via `VALIDATOR_URL`.

### Running as a standalone local service

```bash
npm install
npm start
```

The server listens on port `3000` by default. Set the `PORT` environment variable to override.

#### Check service health

```bash
curl -s http://localhost:3000/health
```

Expected response:
```json
{ "status": "ok" }
```

#### Validate an execution request

**Valid request:**

First compute the signature (see [Computing the signature](#computing-the-signature) below), then include it in the request:

```bash
# Compute canonical signature from aeo.json
SIGNATURE=$(node -e "
  const crypto = require('crypto');
  const aeo = JSON.parse(require('fs').readFileSync('./aeo.json', 'utf8'));
  function canonicalJson(v) {
    if (v === null || typeof v !== 'object' || Array.isArray(v)) return JSON.stringify(v);
    return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonicalJson(v[k])).join(',') + '}';
  }
  process.stdout.write(crypto.createHash('sha256').update('MS-DEMO-DEPLOY-001' + canonicalJson(aeo)).digest('hex'));
")

curl -s -X POST http://localhost:3000/validate \
  -H "Content-Type: application/json" \
  -d "{
    \"decision_id\": \"MS-DEMO-DEPLOY-001\",
    \"signature\": \"$SIGNATURE\",
    \"repo\": \"mindshift-demo\",
    \"branch\": \"main\",
    \"aeo\": {
      \"expires_at\": \"2027-01-01T00:00:00Z\",
      \"finality\": \"confirmed\",
      \"intent\": \"deploy\",
      \"scope\": \"production\",
      \"target\": \"api\",
      \"validation\": \"approved\"
    }
  }"
```

> **Note:** The AEO fields in the request body must be in alphabetical key order to match the canonical signature. If you are using a client that may reorder keys, compute the signature server-side from the same canonical representation.

Expected response:
```json
{ "status": "VALID" }
```

**Invalid request (missing signature):**
```bash
curl -s -X POST http://localhost:3000/validate \
  -H "Content-Type: application/json" \
  -d '{
    "decision_id": "MS-DEMO-DEPLOY-001",
    "repo": "mindshift-demo",
    "branch": "main",
    "aeo": {
      "intent": "deploy",
      "scope": "production",
      "validation": "approved",
      "target": "api",
      "finality": "confirmed",
      "expires_at": "2027-01-01T00:00:00Z"
    }
  }'
```

Expected response:
```json
{ "status": "NULL", "reason": "Missing signature" }
```

**Invalid request (wrong signature):**
```bash
curl -s -X POST http://localhost:3000/validate \
  -H "Content-Type: application/json" \
  -d '{
    "decision_id": "MS-DEMO-DEPLOY-001",
    "signature": "wrong-signature",
    "repo": "mindshift-demo",
    "branch": "main",
    "aeo": {
      "intent": "deploy"
    }
  }'
```

Expected response:
```json
{ "status": "NULL", "reason": "Signature verification failed" }
```

### Validator request structure

The validator expects a JSON body with the following fields:

| Field         | Type   | Description                                                                 |
|---------------|--------|-----------------------------------------------------------------------------|
| `decision_id` | string | Must equal `MS-DEMO-DEPLOY-001`                                             |
| `signature`   | string | SHA-256 hex digest of `decision_id + canonicalJson(aeo)`                    |
| `repo`        | string | Repository name (must equal `mindshift-demo`)                               |
| `branch`      | string | Branch name (must equal `main`)                                             |
| `aeo`         | object | AEO object with `intent`, `scope`, `validation`, `target`, `finality`, `expires_at` |

### Validation rules

| Field         | Required value / rule                                                                          |
|---------------|-----------------------------------------------------------------------------------------------|
| `decision_id` | Must equal `MS-DEMO-DEPLOY-001`                                                               |
| `signature`   | SHA-256 hex digest of `decision_id + canonicalJson(aeo)` (keys sorted alphabetically)    |
| `repo`        | Must equal `mindshift-demo`                                                                   |
| `branch`      | Must equal `main`                                                                             |
| `aeo`         | Object containing `intent`, `scope`, `validation`, `target`, `finality`, and `expires_at`    |
| `expires_at`  | ISO 8601 string inside `aeo`; must be a future date                                           |

The API is fail-closed: any missing or invalid field returns `{ "status": "NULL", "reason": "..." }`.

#### Computing the signature

The `signature` field is the SHA-256 hex digest of the concatenation of `decision_id` and the **canonical JSON** of the `aeo` object. Canonical JSON is produced by recursively sorting all object keys alphabetically and serializing without whitespace. This makes the signature fully deterministic regardless of the insertion order of keys.

For `aeo.json` the canonical key order is: `expires_at`, `finality`, `intent`, `scope`, `target`, `validation`. Any additional fields that may be added in the future will also be sorted alphabetically at the same level.

Use the Node.js built-in `crypto` module to reproduce the exact signature:

```js
const crypto = require('crypto');
const fs = require('fs');

const decisionId = 'MS-DEMO-DEPLOY-001';
const aeo = JSON.parse(fs.readFileSync('./aeo.json', 'utf8'));

function canonicalJson(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return JSON.stringify(value);
  }
  const keys = Object.keys(value).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalJson(value[k])).join(',') + '}';
}

const signature = crypto
  .createHash('sha256')
  .update(decisionId + canonicalJson(aeo))
  .digest('hex');

console.log(signature);
```

## MindShift Gateway

The gateway (`gateway.js`) is the programmatic execution surface. It validates every incoming request through the validator before forwarding to an allowlisted target.

### Environment variables

| Variable        | Required | Description                                                        |
|-----------------|----------|--------------------------------------------------------------------|
| `VALIDATOR_URL` | Yes      | Base URL of the validator API, without trailing slash (e.g. `http://localhost:3000`) |
| `REPO_NAME`     | Yes      | Repository name bound to this gateway instance (e.g. `mindshift-demo`) |
| `BRANCH_NAME`   | Yes      | Branch name bound to this gateway instance (e.g. `main`)          |
| `GATEWAY_PORT`  | No       | Port for the gateway to listen on (default: `4000`)                |

The gateway fails closed (exits immediately) if any of `VALIDATOR_URL`, `REPO_NAME`, or `BRANCH_NAME` are unset.

### Running the gateway locally

```bash
VALIDATOR_URL=http://localhost:3000 \
REPO_NAME=mindshift-demo \
BRANCH_NAME=main \
node gateway.js
```

The gateway listens on port `4000` by default. Set the `GATEWAY_PORT` environment variable to override.

### Gateway execution endpoint

**POST /execute**

Request body:

| Field         | Type   | Required | Description                                        |
|---------------|--------|----------|----------------------------------------------------|
| `decision_id` | string | Yes      | Decision identifier                                |
| `signature`   | string | Yes      | SHA-256 hex digest of `decision_id + canonicalJson(aeo)` |
| `target_key`  | string | Yes      | Allowlisted target key (e.g. `api-production`)     |
| `aeo`         | object | Yes      | AEO object                                         |
| `run_id`      | string | Yes      | Run identifier for audit log                       |
| `commit_sha`  | string | Yes      | Commit SHA for audit log                           |

The gateway enforces that `repo` and `branch` come from its own environment — callers cannot override these values.

### Gateway execution log

Every request produces a structured log entry:

```json
{
  "event": "execution_attempt",
  "run_id": "string",
  "commit_sha": "string",
  "decision_id": "string",
  "repo": "string",
  "branch": "string",
  "target_key": "string",
  "validator_status": "string",
  "timestamp": "ISO 8601 string"
}
```

## Proof-of-transfer artifact

Every successful workflow run produces a `proof-of-transfer.json` artifact containing:

| Field                | Description                                   |
|----------------------|-----------------------------------------------|
| `run_id`             | GitHub Actions run ID                         |
| `commit_sha`         | Commit SHA that triggered the run             |
| `repository`         | Repository full name                          |
| `timestamp`          | ISO 8601 UTC timestamp                        |
| `decision_id_hash`   | SHA-256 of the decision ID                    |
| `aeo_hash`           | SHA-256 of the canonical aeo.json content     |
| `execution_surfaces` | List of surfaces that were executed           |
| `validation_status`  | `valid` when all checks pass                  |

