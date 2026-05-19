# Identity Continuity Closure

## Invariant
No valid identity chain → no valid authority → no valid execution.

Canonical runtime chain:
/session → /continuity → /authority → /compile → /validate → /execute → /proof

## Failure classes
- missing_session_lineage
- missing_continuity_lineage
- revoked_session_lineage
- revoked_continuity_lineage
- expired_session_lineage
- expired_continuity_lineage
- orphan_continuity_lineage
- ambiguous_continuity_lineage
- continuity_cycle_detected
- continuity_depth_exceeded
- continuity_hash_mismatch
- continuity_reconciliation_failed

## Enforcement points
- Session + continuity lineage verification blocks authority legitimacy.
- Validation/execution/proof are invalid when continuity lineage cannot be reconciled.
- Replay checks include continuity lineage validity (revoked/expired/orphan/mismatch => NULL).
- Revocation propagation invalidates authority, validation, execution eligibility, invocation eligibility, and proof persistence eligibility.

## Reconciliation behavior
Cross-registry reconciliation quarantines continuity drift as evidence-only classifications:
- ORPHAN_CONTINUITY_LINEAGE
- AMBIGUOUS_CONTINUITY_LINEAGE
- CONTINUITY_REVOCATION_DRIFT
- CONTINUITY_EXPIRATION_DRIFT
- CONTINUITY_REPLAY_MISMATCH

Reconciliation is read-only and never creates authority, proof, or runtime mutations.

## Non-authority statement
Telemetry, logs, and reconciliation artifacts are non-authoritative evidence only. They cannot create continuity, authority, execution, or proof legitimacy.
