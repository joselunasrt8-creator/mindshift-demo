# LEGACY_SURFACES

MODE B — STRUCTURED ARTIFACT

Status: Non-Operative

Purpose:
Classify historical or legacy runtime surfaces that could confuse sovereignty claims.

## Current classifications

| Surface | Classification | Notes |
|---|---|---|
| server.js | unresolved bypass candidate | Must be verified as non-operative or removed from deployable paths |
| gateway.js | unresolved bypass candidate | Must be verified as non-operative or removed from deployable paths |
| worker.js | unresolved bypass candidate | Must be verified as non-operative or removed from deployable paths |
| registry.js | unresolved bypass candidate | Must be verified as non-operative or removed from deployable paths |
| aeo.json | non-operative fixture | Machine-readable example object only |
| old proof artifacts | documentation/evidence | Not canonical runtime proof authority |

## Canonical runtime

```text
/session
→ /authority
→ /compile
→ /validate
→ /execute
→ /proof
```

## Closure rule

Any executable surface capable of state mutation outside the canonical runtime chain remains:

```text
BYPASS_CANDIDATE
```
