# PREO Registry

This directory is the canonical persistence target for Pull Request Review Evidence Object (PREO) workflow artifacts.

The `PREO_VALID` workflow writes reconstructable merge evidence into this registry path during every governed pull request validation run and uploads the same files as immutable workflow artifacts.

Required persisted files per validation run:

- `PREO.json` — canonical PREO object bound to `repo`, `pr_number`, `base_sha`, `head_sha`, changed files, reviewers, required checks, workflow results, and validity window.
- `PREO_HASH.txt` — deterministic SHA-256 hash of the canonical PREO object.
- `PREO_VALIDATION_RESULT.json` — `PREO_VALID` or `PREO_INVALID` result with fail-closed validation errors.
- `review-evidence.json` — raw review evidence used to reconstruct reviewer authority at the exact PR head SHA.
- `workflow-evidence.json` — workflow/check evidence used to reconstruct required-check legitimacy.

Invariant: no PREO artifact means no merge eligibility. The registry is evidence persistence only; it does not mutate GitHub branch protection or create alternate merge authority.
