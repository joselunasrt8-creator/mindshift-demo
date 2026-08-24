import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import test from 'node:test'

test('execution-surface authority has one operative source and attributable derivatives', () => {
  const output = execFileSync(process.execPath, ['scripts/validate-execution-surfaces-authority.mjs'], { encoding: 'utf8' })
  assert.match(output, /ROOT_CANONICAL \(EXECUTION_SURFACES\.json\)/)
  assert.match(output, /no non-canonical enforcement consumers/)
})
