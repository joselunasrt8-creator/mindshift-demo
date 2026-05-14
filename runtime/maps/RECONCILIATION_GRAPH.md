# Reconciliation Graph

Status: Non-Operative

## Purpose

Define deterministic reconciliation traversal for registry verification, drift detection, and federation-safe observability.

## Canonical traversal order

```text
session_registry
→ continuity_registry
→ authority_registry
→ AEO lineage
→ proof_registry
→ replay_registry
→ federation_registry
→ reconciliation_summary
```

## Drift classes

- policy drift
- authority drift
- execution drift
- federation drift
- replay drift
- continuity drift
- proof drift

## Federation rule

Federated evidence may participate in observability and reconciliation only.

```text
remote evidence ≠ local authority
```

## Canonical reconciliation invariant

```text
registry divergence
→ DRIFT
→ quarantine or NULL
```

## Replay invariant

```text
duplicate lineage
or reused authority
→ NULL
```
