# FATE Explainer

Status: Public Narrative Draft

## Simple Definition

FATE is MindShift's deterministic verification layer.

It checks whether invalid paths fail closed.

## In Simple Terms

Most systems test whether features work.

MindShift also tests whether illegitimate actions are blocked.

```text
valid path → allowed to continue
invalid path → NULL
```

## What FATE Tests

FATE can test:

- replay attempts
- authority drift
- proof inconsistency
- continuity breaks
- undeclared mutation capability
- federation authority inheritance
- deploy bypass paths
- topology drift

## Why It Matters

As AI agents and automation scale, the danger is not only bad output.

The danger is unauthorized execution.

FATE helps verify that governance rules remain intact over time.

## Core Rule

```text
Capability is not permission.
```

## FATE in One Sentence

FATE proves that invalid reality-changing paths collapse to NULL before they can execute.
