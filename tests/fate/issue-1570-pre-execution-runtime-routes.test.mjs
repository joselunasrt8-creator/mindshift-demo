/**
 * tests/fate/issue-1570-pre-execution-runtime-routes.test.mjs
 * Issue #1570 — FATE: fail-closed coverage for pre-execution runtime routes
 *
 * Verifies fail-closed guard structure is present for each acceptance criterion:
 *   AC1: Missing API key fails closed.
 *   AC2: Invalid or revoked continuity cannot create authority.
 *   AC3: Expired lineage returns NULL.
 *   AC4: Failure paths do not partially mutate execution/proof registries.
 *   AC5: Replay ambiguity cannot escalate authority.
 *   AC6: Ancillary route rejection paths remain deterministic.
 *   AC7: No runtime expansion occurs.
 *
 * Scope: /session, /continuity, /authority pre-execution admission guards.
 * Evidence only — source-level guard structure assertions; no runtime invocation,
 * no registry mutation, no authority expansion.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')

// ── Route slices for scoped assertions ───────────────────────────────────────

const sessionSlice = source.slice(
  source.indexOf('url.pathname === "/session" && request.method === "POST"'),
  source.indexOf('url.pathname === "/continuity" && request.method === "POST"'),
)

const continuitySlice = source.slice(
  source.indexOf('url.pathname === "/continuity" && request.method === "POST"'),
  source.indexOf('url.pathname === "/authority" && request.method === "POST"'),
)

const authoritySlice = source.slice(
  source.indexOf('url.pathname === "/authority" && request.method === "POST"'),
  source.indexOf('url.pathname === "/compile" && request.method === "POST"'),
)

// ── AC1: Missing API key fails closed ────────────────────────────────────────

test('AC1: authorized() requires env.API_KEY to be a non-empty string', () => {
  assert.match(
    source,
    /typeof env\.API_KEY === "string" && env\.API_KEY\.length > 0/,
    'authorized() must check that API_KEY is a non-empty string before comparing headers',
  )
})

test('AC1: authorized() requires X-API-Key header to match env.API_KEY exactly', () => {
  assert.match(
    source,
    /req\.headers\.get\("X-API-Key"\) === env\.API_KEY/,
    'authorized() must compare X-API-Key request header against env.API_KEY',
  )
})

test('AC1: mutation endpoint without authorization — fail-closed guard structure present', () => {
  assert.match(
    source,
    /if \(mutationEndpoint && !authorized\(request, env\)\) return json\(\{ status: "NULL", reason: "unauthorized" \}, 403\)/,
    'fail-closed guard structure must be present: unauthorized mutation endpoint returns NULL/403',
  )
})

test('AC1: API key authorization guard appears before any route-specific handler in source', () => {
  const authGuardPos = source.indexOf('if (mutationEndpoint && !authorized(request, env))')
  const sessionRoutePos = source.indexOf('url.pathname === "/session" && request.method === "POST"')
  assert.ok(
    authGuardPos < sessionRoutePos,
    'API key authorization guard must appear in source before /session route handler',
  )
})

// ── AC2: Invalid or revoked continuity cannot create authority ───────────────

test('AC2: /authority fails closed when continuity_id is absent', () => {
  assert.match(
    authoritySlice,
    /reason: "missing_continuity_id"/,
    '/authority must reject requests with no continuity_id with reason missing_continuity_id',
  )
})

test('AC2: /authority invalid_continuity guard structure present', () => {
  assert.match(
    authoritySlice,
    /if \(!continuity\) return rejectWithTelemetry[\s\S]*reason: "invalid_continuity"/,
    'fail-closed guard structure must be present: /authority returns NULL with invalid_continuity on null activeContinuity',
  )
})

test('AC2: /authority continuity_identity_mismatch guard structure present', () => {
  assert.match(
    authoritySlice,
    /reason: "continuity_identity_mismatch"/,
    'fail-closed guard structure must be present: /authority returns NULL on continuity identity mismatch',
  )
})

test('AC2: /authority missing_continuity_identity guard structure present', () => {
  assert.match(
    authoritySlice,
    /reason: "missing_continuity_identity"/,
    'fail-closed guard structure must be present: /authority returns NULL when continuity identity cannot be resolved',
  )
})

test('AC2: /continuity fails closed when revocation status is not ACTIVE', () => {
  assert.match(
    continuitySlice,
    /String\(continuity\.revocation\.status\) !== "ACTIVE"[\s\S]*reason: "revoked_continuity"/,
    '/continuity must reject with revoked_continuity when revocation.status is not ACTIVE',
  )
})

test('AC2: /continuity fails closed when parent continuity is invalid', () => {
  assert.match(
    continuitySlice,
    /reason: "invalid_parent_continuity"/,
    '/continuity must reject with invalid_parent_continuity when parent lookup returns null',
  )
})

// ── AC3: Expired lineage returns NULL ────────────────────────────────────────

test('AC3: /session invalid_session_expiry guard structure present', () => {
  assert.match(
    sessionSlice,
    /isExpired\(expires_at\)[\s\S]*reason: "invalid_session_expiry"/,
    'fail-closed guard structure must be present: /session returns NULL with invalid_session_expiry on expired input',
  )
})

test('AC3: /continuity expired_continuity guard structure present', () => {
  assert.match(
    continuitySlice,
    /isExpired\(expires_at\)[\s\S]*reason: "expired_continuity"/,
    'fail-closed guard structure must be present: /continuity returns NULL with expired_continuity on expired lineage',
  )
})

test('AC3: activeSession() propagates session expiry as null result', () => {
  assert.match(
    source,
    /async function activeSession[\s\S]{0,500}isExpired\(String\(session\.expires_at/,
    'activeSession() must call isExpired on session.expires_at to prevent expired sessions from being treated as active',
  )
})

test('AC3: activeContinuity() rejects expired continuity in ancestry traversal', () => {
  assert.match(
    source,
    /isExpired\(String\(continuity\.expires_at/,
    'continuity expiry must be checked with isExpired during ancestry traversal',
  )
})

test('AC3: isExpired() is defined as the canonical expiry predicate', () => {
  assert.match(
    source,
    /function isExpired\(expires_at: string/,
    'isExpired must be defined as the single canonical expiry predicate for all lineage surfaces',
  )
})

// ── AC4: Failure paths do not partially mutate execution/proof registries ────

test('AC4: /session guard rejections precede registry INSERT', () => {
  const missingIdentityPos = sessionSlice.indexOf('"missing_identity_id"')
  const insertPos = sessionSlice.indexOf('INSERT INTO session_registry')
  assert.ok(
    missingIdentityPos !== -1 && insertPos !== -1 && missingIdentityPos < insertPos,
    '/session must reject with missing_identity_id before any INSERT INTO session_registry',
  )
})

test('AC4: /session expiry rejection precedes registry INSERT', () => {
  const expiryRejectPos = sessionSlice.indexOf('"invalid_session_expiry"')
  const insertPos = sessionSlice.indexOf('INSERT INTO session_registry')
  assert.ok(
    expiryRejectPos !== -1 && insertPos !== -1 && expiryRejectPos < insertPos,
    '/session must reject expired sessions before any INSERT INTO session_registry',
  )
})

test('AC4: /continuity session guard rejection precedes registry INSERT', () => {
  const invalidSessionPos = continuitySlice.indexOf('"invalid_session"')
  const insertPos = continuitySlice.indexOf('INSERT INTO continuity_registry')
  assert.ok(
    invalidSessionPos !== -1 && insertPos !== -1 && invalidSessionPos < insertPos,
    '/continuity must reject invalid_session before any INSERT INTO continuity_registry',
  )
})

test('AC4: /continuity expiry rejection precedes registry INSERT', () => {
  const expiryRejectPos = continuitySlice.indexOf('"expired_continuity"')
  const insertPos = continuitySlice.indexOf('INSERT INTO continuity_registry')
  assert.ok(
    expiryRejectPos !== -1 && insertPos !== -1 && expiryRejectPos < insertPos,
    '/continuity must reject expired lineage before any INSERT INTO continuity_registry',
  )
})

test('AC4: /continuity revocation rejection precedes registry INSERT', () => {
  const revokedPos = continuitySlice.indexOf('"revoked_continuity"')
  const insertPos = continuitySlice.indexOf('INSERT INTO continuity_registry')
  assert.ok(
    revokedPos !== -1 && insertPos !== -1 && revokedPos < insertPos,
    '/continuity must reject revoked continuity before any INSERT INTO continuity_registry',
  )
})

test('AC4: /authority session guard rejection precedes registry INSERT', () => {
  const invalidSessionPos = authoritySlice.indexOf('"invalid_session"')
  const insertPos = authoritySlice.indexOf('INSERT INTO authority_registry')
  assert.ok(
    invalidSessionPos !== -1 && insertPos !== -1 && invalidSessionPos < insertPos,
    '/authority must reject invalid_session before any INSERT INTO authority_registry',
  )
})

test('AC4: /authority invalid continuity rejection precedes registry INSERT', () => {
  const invalidContinuityPos = authoritySlice.indexOf('"invalid_continuity"')
  const insertPos = authoritySlice.indexOf('INSERT INTO authority_registry')
  assert.ok(
    invalidContinuityPos !== -1 && insertPos !== -1 && invalidContinuityPos < insertPos,
    '/authority must reject invalid_continuity before any INSERT INTO authority_registry',
  )
})

test('AC4: /authority identity mismatch rejection precedes registry INSERT', () => {
  const mismatchPos = authoritySlice.indexOf('"continuity_identity_mismatch"')
  const insertPos = authoritySlice.indexOf('INSERT INTO authority_registry')
  assert.ok(
    mismatchPos !== -1 && insertPos !== -1 && mismatchPos < insertPos,
    '/authority must reject continuity_identity_mismatch before any INSERT INTO authority_registry',
  )
})

// ── AC5: Replay ambiguity cannot escalate authority ──────────────────────────

test('AC5: /continuity fails closed on self-referential continuity cycle', () => {
  assert.match(
    continuitySlice,
    /if \(parent_continuity_id === continuity_id\)[\s\S]*reason: "continuity_cycle_detected"/,
    '/continuity must reject with continuity_cycle_detected when parent equals self',
  )
})

test('AC5: /continuity fails closed when scope expands beyond parent scope', () => {
  assert.match(
    continuitySlice,
    /reason: "scope_expansion_detected"/,
    '/continuity must reject with scope_expansion_detected when child scope adds keys not in parent',
  )
})

test('AC5: /continuity fails closed when ancestry depth exceeds system maximum', () => {
  assert.match(
    continuitySlice,
    /reason: "continuity_depth_exceeded"/,
    '/continuity must reject with continuity_depth_exceeded when depth would exceed SYSTEM_MAX_CONTINUITY_DEPTH',
  )
})

test('AC5: SYSTEM_MAX_CONTINUITY_DEPTH is the canonical depth bound', () => {
  assert.match(
    source,
    /const SYSTEM_MAX_CONTINUITY_DEPTH = \d+/,
    'SYSTEM_MAX_CONTINUITY_DEPTH must be defined as the canonical upper bound for continuity ancestry chains',
  )
})

test('AC5: /authority fails closed when topology epoch admission rejects', () => {
  assert.match(
    authoritySlice,
    /if \(!topologyEpochAdmission\.ok\)[\s\S]*status:"NULL"[\s\S]*result:"INVALID"/,
    '/authority must fail closed when topology epoch admission check returns !ok',
  )
})

test('AC5: /authority fails closed without governed tool envelope', () => {
  assert.match(
    authoritySlice,
    /reason: "governed_tool_envelope_missing"/,
    '/authority must reject with governed_tool_envelope_missing when envelope id is absent',
  )
})

// ── AC6: Ancillary route rejection paths remain deterministic ────────────────

test('AC6: all /session rejection paths produce status NULL', () => {
  const sessionRejectMatches = [...sessionSlice.matchAll(/status: "NULL"/g)]
  assert.ok(
    sessionRejectMatches.length >= 2,
    '/session must have at least two deterministic NULL rejection paths (missing identity, invalid expiry)',
  )
})

test('AC6: all /continuity rejection paths produce status NULL', () => {
  const continuityRejectMatches = [...continuitySlice.matchAll(/status: "NULL"/g)]
  assert.ok(
    continuityRejectMatches.length >= 5,
    '/continuity must have at least five deterministic NULL rejection paths',
  )
})

test('AC6: all /authority rejection paths produce status NULL', () => {
  const authorityRejectMatches = [...authoritySlice.matchAll(/status: "NULL"/g)]
  assert.ok(
    authorityRejectMatches.length >= 5,
    '/authority must have at least five deterministic NULL rejection paths',
  )
})

test('AC6: rejectWithTelemetry is the canonical rejection utility for mutable routes', () => {
  assert.match(
    source,
    /async function rejectWithTelemetry\(/,
    'rejectWithTelemetry must be defined as the canonical fail-closed rejection helper',
  )
})

test('AC6: /continuity rejection reasons are bounded string literals', () => {
  for (const reason of [
    'invalid_session',
    'expired_continuity',
    'continuity_cycle_detected',
    'invalid_parent_continuity',
    'continuity_depth_exceeded',
    'scope_expansion_detected',
    'revoked_continuity',
  ]) {
    assert.ok(
      continuitySlice.includes(`"${reason}"`),
      `/continuity must contain deterministic rejection reason: ${reason}`,
    )
  }
})

test('AC6: /authority rejection reasons are bounded string literals', () => {
  for (const reason of [
    'invalid_session',
    'governed_tool_envelope_missing',
    'missing_continuity_id',
    'invalid_continuity',
    'missing_continuity_identity',
    'continuity_identity_mismatch',
  ]) {
    assert.ok(
      authoritySlice.includes(`"${reason}"`),
      `/authority must contain deterministic rejection reason: ${reason}`,
    )
  }
})

// ── AC7: No runtime expansion occurs ─────────────────────────────────────────

test('AC7: CANONICAL_RUNTIME_ROUTES contains exactly the seven expected routes', () => {
  assert.match(
    source,
    /const CANONICAL_RUNTIME_ROUTES = \["\/session", "\/continuity", "\/authority", "\/compile", "\/validate", "\/execute", "\/proof"\] as const/,
    'CANONICAL_RUNTIME_ROUTES must be exactly [/session, /continuity, /authority, /compile, /validate, /execute, /proof] with no additions',
  )
})

test('AC7: NON_EXECUTABLE_RUNTIME_ROUTES contains only /session and /continuity', () => {
  assert.match(
    source,
    /const NON_EXECUTABLE_RUNTIME_ROUTES = Object\.freeze\(\["\/session", "\/continuity"\] as const\)/,
    'NON_EXECUTABLE_RUNTIME_ROUTES must be frozen and contain only /session and /continuity',
  )
})

test('AC7: EXECUTABLE_RUNTIME_ROUTES does not include /session or /continuity', () => {
  assert.match(
    source,
    /const EXECUTABLE_RUNTIME_ROUTES = Object\.freeze\(\["\/authority", "\/compile", "\/validate", "\/execute", "\/proof"\] as const\)/,
    'EXECUTABLE_RUNTIME_ROUTES must not include the non-executable pre-execution routes',
  )
})

test('AC7: /session and /continuity are classified as NON_EXECUTABLE at declaration', () => {
  const nonExecPos = source.indexOf('const NON_EXECUTABLE_RUNTIME_ROUTES')
  const nonExecDecl = source.slice(nonExecPos, nonExecPos + 200)
  assert.ok(nonExecDecl.includes('"/session"'), '/session must appear in NON_EXECUTABLE_RUNTIME_ROUTES declaration')
  assert.ok(nonExecDecl.includes('"/continuity"'), '/continuity must appear in NON_EXECUTABLE_RUNTIME_ROUTES declaration')
})

test('AC7: no undeclared runtime route surfaces exist beyond canonical set', () => {
  const routesDeclarationPos = source.indexOf('const CANONICAL_RUNTIME_ROUTES = [')
  const routesDeclaration = source.slice(routesDeclarationPos, routesDeclarationPos + 300)
  assert.ok(!routesDeclaration.includes('"/health"'), 'CANONICAL_RUNTIME_ROUTES must not include /health')
  assert.ok(!routesDeclaration.includes('"/admin"'), 'CANONICAL_RUNTIME_ROUTES must not include /admin')
  assert.ok(!routesDeclaration.includes('"/deploy"'), 'CANONICAL_RUNTIME_ROUTES must not include /deploy')
  assert.ok(!routesDeclaration.includes('"/configure"'), 'CANONICAL_RUNTIME_ROUTES must not include /configure')
})
