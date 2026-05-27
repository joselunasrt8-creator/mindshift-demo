/**
 * src/telemetry/append-only-ingestion-pipeline.ts
 * Issue #1425 — Append-Only Telemetry Ingestion Pipeline
 *
 * Replay-safe, append-only telemetry ingestion pipeline for the install-base
 * dependency dashboard. Each ingested event produces an immutable log entry;
 * the pipeline log itself is an ordered, append-only sequence of such entries.
 *
 * Entry-level invariants:
 *   - Each entry is immutable after creation (sha256 hash locks content)
 *   - Entries may not be deleted, modified, or reordered
 *   - Pipeline cannot authorize execution or create legitimacy facts
 *   - Telemetry ingestion cannot mutate runtime state
 *
 * Pipeline-level invariants:
 *   - Sequence numbers are monotonically increasing from 0
 *   - Pipeline hash covers the full ordered entry sequence
 *   - mutation_allowed is always false
 *
 * Replay safety:
 *   - Each entry carries a sequence_number and previous_entry_hash for chain integrity
 *   - Re-ingesting an event with the same content produces an identical entry hash
 *   - No entry can retroactively alter a prior entry's hash
 */

import { canonicalize, sha256Hex } from '../canonical.js'

// ── Event and entry types ──────────────────────────────────────────────────────

export interface TelemetryEvent {
  readonly event_type: string
  readonly surface_id?: string
  readonly dependency_id?: string
  readonly authority_scope?: string
  readonly metrics_snapshot?: Readonly<Record<string, unknown>>
  readonly evidence_refs?: readonly string[]
}

export interface AppendOnlyTelemetryEntry {
  readonly artifact_type: 'APPEND_ONLY_TELEMETRY_ENTRY'
  readonly sequence_number: number
  readonly timestamp: string
  readonly event_type: string
  readonly surface_id: string | null
  readonly dependency_id: string | null
  readonly authority_scope: string | null
  readonly metrics_snapshot: Readonly<Record<string, unknown>>
  readonly evidence_refs: readonly string[]
  readonly previous_entry_hash: string
  readonly mutation_allowed: false
  readonly entry_hash: string
}

export interface AppendOnlyTelemetryPipeline {
  readonly artifact_type: 'APPEND_ONLY_TELEMETRY_PIPELINE'
  readonly evidence_only: true
  readonly creates_authority: false
  readonly mutates_runtime_state: false
  readonly mutation_allowed: false
  readonly entry_count: number
  readonly entries: readonly AppendOnlyTelemetryEntry[]
  readonly pipeline_hash: string
}

// ── Genesis hash (chain root for first entry) ──────────────────────────────────

const GENESIS_HASH = sha256Hex(canonicalize({ genesis: true, pipeline: 'APPEND_ONLY_TELEMETRY_PIPELINE' }))

// ── Internal helpers ───────────────────────────────────────────────────────────

function buildEntryHash(fields: Omit<AppendOnlyTelemetryEntry, 'entry_hash'>): string {
  return sha256Hex(canonicalize(fields))
}

function buildPipelineHash(entries: readonly AppendOnlyTelemetryEntry[]): string {
  return sha256Hex(
    canonicalize(entries.map((e) => ({ sequence_number: e.sequence_number, entry_hash: e.entry_hash }))),
  )
}

function normalizeMetrics(raw: unknown): Readonly<Record<string, unknown>> {
  if (raw === null || raw === undefined || typeof raw !== 'object' || Array.isArray(raw)) {
    return Object.freeze({})
  }
  return Object.freeze({ ...(raw as Record<string, unknown>) })
}

function normalizeEvidenceRefs(raw: unknown): readonly string[] {
  if (!Array.isArray(raw)) return Object.freeze([])
  return Object.freeze(raw.map(String).sort())
}

// ── Entry builder ──────────────────────────────────────────────────────────────

function buildEntry(
  event: TelemetryEvent,
  sequence_number: number,
  previous_entry_hash: string,
  timestamp: string,
): AppendOnlyTelemetryEntry {
  const core: Omit<AppendOnlyTelemetryEntry, 'entry_hash'> = {
    artifact_type: 'APPEND_ONLY_TELEMETRY_ENTRY',
    sequence_number,
    timestamp,
    event_type: String(event.event_type || 'UNKNOWN'),
    surface_id: event.surface_id ? String(event.surface_id) : null,
    dependency_id: event.dependency_id ? String(event.dependency_id) : null,
    authority_scope: event.authority_scope ? String(event.authority_scope) : null,
    metrics_snapshot: normalizeMetrics(event.metrics_snapshot),
    evidence_refs: normalizeEvidenceRefs(event.evidence_refs),
    previous_entry_hash,
    mutation_allowed: false,
  }
  return Object.freeze({ ...core, entry_hash: buildEntryHash(core) }) as AppendOnlyTelemetryEntry
}

// ── Pipeline builder ───────────────────────────────────────────────────────────

/**
 * Creates an empty append-only telemetry pipeline.
 * The pipeline hash covers the (empty) entry sequence.
 */
export function createPipeline(): AppendOnlyTelemetryPipeline {
  const entries = Object.freeze([] as AppendOnlyTelemetryEntry[])
  return Object.freeze({
    artifact_type: 'APPEND_ONLY_TELEMETRY_PIPELINE',
    evidence_only: true,
    creates_authority: false,
    mutates_runtime_state: false,
    mutation_allowed: false,
    entry_count: 0,
    entries,
    pipeline_hash: buildPipelineHash(entries),
  }) as AppendOnlyTelemetryPipeline
}

/**
 * Appends a telemetry event to the pipeline, returning a new immutable pipeline.
 * The original pipeline is not mutated.
 *
 * timestamp must be a valid ISO 8601 string. If missing or invalid, the entry
 * is still created but the timestamp is recorded as the provided string.
 *
 * Evidence only — ingestion cannot authorize execution or mutate runtime state.
 */
export function appendTelemetryEvent(
  pipeline: AppendOnlyTelemetryPipeline,
  event: TelemetryEvent,
  timestamp: string,
): AppendOnlyTelemetryPipeline {
  if (
    pipeline === null ||
    pipeline === undefined ||
    pipeline.artifact_type !== 'APPEND_ONLY_TELEMETRY_PIPELINE'
  ) {
    return createPipeline()
  }

  const previous_entry_hash =
    pipeline.entries.length > 0
      ? pipeline.entries[pipeline.entries.length - 1].entry_hash
      : GENESIS_HASH

  const entry = buildEntry(event, pipeline.entry_count, previous_entry_hash, timestamp)
  const entries = Object.freeze([...pipeline.entries, entry])

  return Object.freeze({
    artifact_type: 'APPEND_ONLY_TELEMETRY_PIPELINE',
    evidence_only: true,
    creates_authority: false,
    mutates_runtime_state: false,
    mutation_allowed: false,
    entry_count: entries.length,
    entries,
    pipeline_hash: buildPipelineHash(entries),
  }) as AppendOnlyTelemetryPipeline
}

/**
 * Builds an append-only pipeline from a batch of events.
 * Events are ingested in the order provided.
 * Fail-closed: invalid events produce entries with event_type 'UNKNOWN'.
 */
export function buildPipelineFromEvents(
  events: readonly TelemetryEvent[],
  baseTimestamp: string,
): AppendOnlyTelemetryPipeline {
  if (!Array.isArray(events) || events.length === 0) {
    return createPipeline()
  }

  let pipeline = createPipeline()
  for (const event of events) {
    const safeEvent: TelemetryEvent =
      event !== null && typeof event === 'object' && !Array.isArray(event)
        ? event
        : { event_type: 'UNKNOWN' }
    pipeline = appendTelemetryEvent(pipeline, safeEvent, baseTimestamp)
  }
  return pipeline
}

/**
 * Verifies the hash chain integrity of a pipeline.
 * Returns true when all entry hashes and previous_entry_hash links are consistent.
 * Returns false on any break in the chain (fail-closed).
 */
export function verifyPipelineIntegrity(pipeline: AppendOnlyTelemetryPipeline): boolean {
  if (
    pipeline === null ||
    pipeline === undefined ||
    pipeline.artifact_type !== 'APPEND_ONLY_TELEMETRY_PIPELINE'
  ) {
    return false
  }

  const entries = pipeline.entries
  if (entries.length === 0) return true

  let expectedPrevious = GENESIS_HASH

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]

    // Sequence number must match position
    if (entry.sequence_number !== i) return false

    // previous_entry_hash chain must be unbroken
    if (entry.previous_entry_hash !== expectedPrevious) return false

    // mutation_allowed must always be false
    if (entry.mutation_allowed !== false) return false

    // Recompute entry_hash and verify
    const { entry_hash: _excluded, ...coreFields } = entry
    const recomputed = buildEntryHash(coreFields as Omit<AppendOnlyTelemetryEntry, 'entry_hash'>)
    if (recomputed !== entry.entry_hash) return false

    expectedPrevious = entry.entry_hash
  }

  // Verify pipeline_hash
  const recomputedPipelineHash = buildPipelineHash(entries)
  return recomputedPipelineHash === pipeline.pipeline_hash
}
