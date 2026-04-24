# mindshift-demo

Cloudflare Worker runtime backed by D1.

## Build Start: First Enforced Surface

This runtime enforces one boundary:

`Authority -> AEO -> Ω Validator -> Boundary -> GitHub Actions -> Proof`

### Endpoints

- `POST /authority`
- `POST /compile`
- `POST /validate`
- `POST /execute`
- `POST /proof`
- `GET /replay-test`

### Enforcement rules

- Validator returns only `VALID` or `NULL`.
- Deploy execution is blocked unless `validated_object_hash == executed_object_hash`.
- Target is fixed to GitHub Actions `workflow_dispatch`.
- Authority status transitions: `ACTIVE -> EXECUTED_PENDING_PROOF -> CONSUMED`.
- Replay with the same `decision_id` is blocked.

## Commands

### 1) Apply schema

```bash
npx wrangler d1 execute mindshift-demo-prod --remote --file schema.sql
```

### 2) Local migration

```bash
npm run d1:migrate:local
```

### 3) Deploy

```bash
npm run deploy
```
