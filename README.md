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

Expected `sequence` in the JSON response:

```json
["EXECUTED", "BLOCKED"]
```
