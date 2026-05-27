# Issue #1514 — OpenClaw verification bootstrap + behavioral authority typecheck

## 1) Purpose
Bounded verification-repair slice for OpenClaw Governed Envelope v1 to clear repository-local blockers inherited from #1513 without changing runtime semantics or governance scope.

## 2) Blockers inherited from #1513
1. `npm install` / `npm ci` failed with `E403` fetching `https://registry.npmjs.org/ajv`.
2. Focused OpenClaw tests failed with `ERR_MODULE_NOT_FOUND: Cannot find package 'tsx'`.
3. `npx tsc --noEmit` reported errors in `src/lib/behavioral-authority-surfaces.ts`.

## 3) Bootstrap diagnosis
Diagnosis outcome: **A. External environment registry/auth failure**.

Evidence:
- `npm config get registry` returns `https://registry.npmjs.org/` (default public registry).
- `npm install --dry-run` and `npm ci --dry-run` both fail with `E403` on `GET https://registry.npmjs.org/ajv`.
- Environment config shows proxy settings (`http-proxy` / `https-proxy`) and npm emits warnings about unknown env config keys, indicating environment-level mediation of network requests.
- No repository `.npmrc` file was found.

Conclusion:
- The repository does not appear to be misconfigured for registry selection.
- Bootstrap remains blocked by external registry access/policy for `ajv` retrieval.

## 4) Dependency state
- `tsx` declaration status: present in `devDependencies` (`^4.22.3`) and lockfile package root entries.
- `ajv` declaration status: present in `devDependencies` (`^8.17.1`).
- `ajv` bootstrap status: unresolved in this environment due to external `E403` from npm registry access path.

## 5) TypeScript repair summary
File repaired: `src/lib/behavioral-authority-surfaces.ts`.

Bounded corrections applied:
- Replaced Node `createHash` import usage with existing repository hash helper (`sha256Hex`) to avoid `node:crypto` typing dependency leakage under current TS config.
- Added explicit, narrow TypeScript types for:
  - classification constants (`as const` + union type)
  - metadata input
  - classification result shape
  - mutation risk result shape
  - function parameters and return types
- Replaced unsafe optional access/defaulting with nullish-coalescing where appropriate.

Preserved semantics:
- evidence-only classification surface.
- replay-neutral behavior.
- no authority creation.
- no execution enablement introduced.

## 6) Commands run
- `pwd`
- `git status --short`
- `git log --oneline -n 20`
- `cat package.json`
- `test -f package-lock.json && head -n 80 package-lock.json || true`
- `npm config list`
- `npm config get registry`
- `rg -n '"tsx"|"ajv"|"test"|node --test|mocha|vitest|jest' package.json package-lock.json .npmrc .github tests || true`
- `sed -n '1,260p' src/lib/behavioral-authority-surfaces.ts`
- `sed -n '1,240p' tests/issue-1467-openclaw-behavioral-authority-surfaces.test.mjs`
- `npm view ajv version --registry=https://registry.npmjs.org/ || true`
- `npm install --dry-run || true`
- `npm ci --dry-run || true`
- `npm test -- tests/issue-1467-openclaw-behavioral-authority-surfaces.test.mjs || true`
- `npx tsc --noEmit || true`
- `npm test -- tests/issue-1369-openclaw-gateway-v0.test.mjs || true`
- `npm test -- tests/issue-1464-openclaw-govern-lineage-validate-proof.test.mjs || true`
- `npm test -- tests/issue-1465-openclaw-exact-object-binding.test.mjs || true`
- `npm test -- tests/issue-1466-openclaw-policy-topology-govern-gates.test.mjs || true`
- `npm test -- tests/issue-1467-openclaw-behavioral-authority-surfaces.test.mjs || true`
- `npx tsc --noEmit || true`

## 7) Results
- `npm install --dry-run`: failed (`E403` for `ajv`).
- `npm ci --dry-run`: failed (`E403` for `ajv`).
- Focused OpenClaw tests: failed in bootstrap phase due to missing `tsx` module at runtime (consistent with blocked dependency install).
- `npx tsc --noEmit`: behavioral-authority-surfaces type errors resolved after repair in this slice.

## 8) Remaining blockers
External npm registry access/policy still blocks dependency bootstrap (`ajv` fetch `E403`), preventing installation of `tsx` and execution of OpenClaw focused test suite in this environment.

## 9) Invariant preservation note
This repair is classification/type-safety only. It preserves:
- `creates_authority = false`
- `replay_neutral = true`
- `evidence_only = true`
- visibility/classification is not treated as legitimacy/authority
- no new execution paths or permission widening

## 10) Closure determination
OpenClaw verification repair is complete for repository-local defects.
Remaining verification is blocked by external npm registry access, not repository state.
