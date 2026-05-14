# Replay Prevention Explainer Visual

Status: Public Narrative Draft

## Visual Title

```text
Replay Prevention
One Authority, One Valid Use
```

## Core Flow

```text
Authority ACTIVE
↓
Validation
↓
Execution Boundary
↓
Authority CONSUMED
↓
Replay Attempt
↓
NULL
```

## Simple Explanation

A valid action should not be reusable forever.

Once authority is consumed, the same authority cannot be replayed to trigger another reality-changing action.

## What Replay Prevention Blocks

- reused authority
- duplicate hashes
- reused nonces
- repeated deploy attempts
- cross-runtime replay attempts
- parallel execution collisions

## Core Message

```text
Permission is not reusable unless explicitly designed to be reusable.
```

## Caption

```text
MindShift prevents yesterday’s valid authority from becoming today’s unauthorized execution.
```
