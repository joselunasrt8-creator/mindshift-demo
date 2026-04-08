# mindshift-demo
MindShift execution boundary demo

## Architecture

```
GitHub Actions
      ↓
Validator API
      ↓
 VALID | NULL
      ↓
Execution surfaces
      ↓
Proof-of-transfer
```

GitHub Actions serves as the execution runtime. The validator API enforces governed execution rules before any surface is reached.

## Validator API

A minimal Node.js/Express server that validates execution authority before allowing governed actions to proceed.

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

**Health check:**
```bash
curl -s http://localhost:3000/health
```

Expected response:
```json
{ "status": "ok" }
```

**Valid request:**
```bash
curl -s -X POST http://localhost:3000/validate \
  -H "Content-Type: application/json" \
  -d '{
    "decision_id": "MS-DEMO-DEPLOY-001",
    "signature": "demo-signature-v1",
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
{ "status": "VALID" }
```

**Invalid request (missing aeo field):**
```bash
curl -s -X POST http://localhost:3000/validate \
  -H "Content-Type: application/json" \
  -d '{
    "decision_id": "MS-DEMO-DEPLOY-001",
    "signature": "demo-signature-v1",
    "repo": "mindshift-demo",
    "branch": "main",
    "aeo": {
      "intent": "deploy"
    }
  }'
```

Expected response:
```json
{ "status": "NULL", "reason": "Missing aeo field: scope" }
```

### Validation rules

| Field         | Required value / rule                                                                          |
|---------------|-----------------------------------------------------------------------------------------------|
| `decision_id` | Must equal `MS-DEMO-DEPLOY-001`                                                               |
| `signature`   | Must equal `demo-signature-v1`                                                                |
| `repo`        | Must equal `mindshift-demo`                                                                   |
| `branch`      | Must equal `main`                                                                             |
| `aeo`         | Object containing `intent`, `scope`, `validation`, `target`, `finality`, and `expires_at`    |
| `expires_at`  | ISO 8601 string inside `aeo`; must be a future date                                           |

The API is fail-closed: any missing or invalid field returns `{ "status": "NULL", "reason": "..." }`.

## Proof-of-transfer artifact

Every successful workflow run produces a `proof-of-transfer.json` artifact containing:

| Field                | Description                              |
|----------------------|------------------------------------------|
| `run_id`             | GitHub Actions run ID                    |
| `commit_sha`         | Commit SHA that triggered the run        |
| `repository`         | Repository full name                     |
| `timestamp`          | ISO 8601 UTC timestamp                   |
| `decision_id_hash`   | SHA-256 of the decision ID               |
| `aeo_hash`           | SHA-256 of the execution signature       |
| `execution_surfaces` | List of surfaces that were executed      |
| `validation_status`  | `valid` when all checks pass             |
