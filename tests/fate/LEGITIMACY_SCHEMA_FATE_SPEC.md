# Legitimacy Schema FATE Binding Specification

Status: Non-Operative

## Purpose

Define how deterministic legitimacy validators integrate into topology-aware FATE.

## Core Invariant

```text
schema-valid object
≠
execution legitimacy
```

Validation success only means:

```text
object structure is deterministic
```

## Validator Inputs

FATE should test:

- Authority objects
- ATAO objects
- AEO objects
- PREO objects
- SCO objects
- ProofObject objects
- ContinuityObject objects
- FederationEnvelope objects

## Deterministic FATE Cases

### Schema Cases

- missing required field
- unknown object type
- forbidden additional field
- malformed JSON
- missing canonicalization metadata
- missing hash-relevant field

Expected outputs:

```text
INVALID_SCHEMA
UNKNOWN_OBJECT_TYPE
NULL
```

## Topology-Aware Cases

- undeclared authority edge
- undeclared mutation capability
- replay mismatch
- continuity break
- federation authority inheritance
- runtime topology divergence

Expected outputs:

```text
TOPOLOGY_DRIFT
UNDECLARED_MUTATION_CAPABILITY
NULL
```

## Required Failure Rule

Any validator inconsistency or topology inconsistency MUST fail closed.

```text
NULL
```

## Forbidden Behavior

FATE validation must not:

- execute actions
- grant authority
- create proof
- mutate runtime state
- inherit remote authority

## Future Convergence

```text
schemas
+
validators
+
topology-aware FATE
+
governance compiler
=
continuous legitimacy verification infrastructure
```
