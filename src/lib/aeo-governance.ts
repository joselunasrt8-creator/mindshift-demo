import { canonicalize, normalize } from '../canonical.js'

export type CanonicalAEO = {
  intent: string
  scope: Record<string, unknown>
  validation: Record<string, unknown>
  target: Record<string, unknown>
  finality: Record<string, unknown>
}

export const REQUIRED_AEO_KEYS = ["intent", "scope", "validation", "target", "finality"] as const

function isPlainRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v)
}

function canonicalRecord(v: unknown): Record<string, unknown> | null {
  const normalized = normalize(v)
  return isPlainRecord(normalized) ? normalized as Record<string, unknown> : null
}

export { canonicalize }

export function toCanonicalAeo(input: unknown): CanonicalAEO | null {
  if (!isPlainRecord(input)) return null
  const keys = Object.keys(input).sort()
  if (keys.length !== REQUIRED_AEO_KEYS.length) return null
  if (keys.join("|") !== [...REQUIRED_AEO_KEYS].sort().join("|")) return null
  const intent = String(input.intent ?? "")
  const scope = canonicalRecord(input.scope)
  const validation = canonicalRecord(input.validation)
  const target = canonicalRecord(input.target)
  const finality = canonicalRecord(input.finality)
  if (!intent || !scope || !validation || !target || !finality) return null
  return Object.freeze({ intent, scope, validation, target, finality })
}
