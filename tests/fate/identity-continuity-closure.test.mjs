import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { verifyContinuityLineage } from '../../src/runtime/continuity/verifyContinuityLineage.ts'

const hash = (lineage) => createHash('sha256').update(JSON.stringify(lineage.map((n) => n.continuity_id))).digest('hex')

const session = { session_id: 's1', identity_id: 'i1', continuity_status: 'ACTIVE', expires_at: '2099-01-01T00:00:00.000Z' }
const root = { continuity_id: 'c1', session_id: 's1', identity_id: 'i1', parent_continuity_id: '', continuity_hash: 'h1', status: 'ACTIVE', expires_at: '2099-01-01T00:00:00.000Z' }

test('continuity closure rejects missing session lineage', () => {
  const out = verifyContinuityLineage({ session: null, continuity: root, continuityById: new Map(), computeLineageHash: hash })
  assert.deepEqual(out, { ok: false, reason: 'missing_session_lineage' })
})

test('continuity closure rejects missing continuity lineage', () => {
  const out = verifyContinuityLineage({ session, continuity: null, continuityById: new Map(), computeLineageHash: hash })
  assert.deepEqual(out, { ok: false, reason: 'missing_continuity_lineage' })
})

test('continuity closure rejects orphan/ambiguous/cycle/depth/hash mismatch', () => {
  assert.equal(verifyContinuityLineage({ session, continuity: { ...root, parent_continuity_id: 'missing' }, continuityById: new Map(), computeLineageHash: hash }).reason, 'orphan_continuity_lineage')
  assert.equal(verifyContinuityLineage({ session, continuity: { ...root, parent_continuity_id: 'p' }, continuityById: new Map([['p', [root, root]]]), computeLineageHash: hash }).reason, 'ambiguous_continuity_lineage')
  const cyc = { ...root, continuity_id: 'c2', parent_continuity_id: 'c2' }
  assert.equal(verifyContinuityLineage({ session, continuity: cyc, continuityById: new Map([['c2', cyc]]), computeLineageHash: hash }).reason, 'continuity_cycle_detected')
  const child = { ...root, continuity_id: 'c3', parent_continuity_id: 'c1' }
  assert.equal(verifyContinuityLineage({ session, continuity: child, continuityById: new Map([['c1', root]]), computeLineageHash: hash, maxDepth: 1 }).reason, 'continuity_depth_exceeded')
  assert.equal(verifyContinuityLineage({ session, continuity: root, continuityById: new Map(), computeLineageHash: hash, expectedLineageHash: 'bad' }).reason, 'continuity_hash_mismatch')
})

test('no new runtime route introduced and docs contain canonical chain', () => {
  const indexSource = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')
  assert.match(indexSource, /const CANONICAL_RUNTIME_ROUTES = \["\/session", "\/continuity", "\/authority", "\/compile", "\/validate", "\/execute", "\/proof"\]/)
  const doc = readFileSync(new URL('../../docs/identity-continuity-closure.md', import.meta.url), 'utf8')
  assert.match(doc, /No valid identity chain\s*→ no valid authority\s*→ no valid execution/)
})
