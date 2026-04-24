function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json" }
  })
}

type Env = {
  DB: D1Database
  GITHUB_TOKEN?: string
  GITHUB_OWNER?: string
  GITHUB_REPO?: string
}

type AuthorityRecord = {
  decision_id: string
  owner: string
  intent: string
  scope: string
  constraints: string
  expiry: string
  status: string
  created_at: string
  updated_at: string
}

type Target = {
  system: "github_actions"
  action: "workflow_dispatch"
  workflow: string
  ref: string
  inputs: Record<string, string>
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`).join(",")}}`
}

async function sha256(input: unknown): Promise<string> {
  const data = new TextEncoder().encode(canonicalize(input))
  const digest = await crypto.subtle.digest("SHA-256", data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

async function readJson(request: Request): Promise<any | null> {
  try {
    return await request.json()
  } catch {
    return null
  }
}

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

function nowIso(): string {
  return new Date().toISOString()
}

function buildTarget(body: any): Target {
  const targetInput = asObject(body.target)
  const workflow = String(targetInput.workflow || body.workflow || "governed-dispatch-target.yml")
  const ref = String(targetInput.ref || body.ref || "main")

  return {
    system: "github_actions",
    action: "workflow_dispatch",
    workflow,
    ref,
    inputs: {}
  }
}

function buildAuthority(body: any) {
  return {
    decision_id: String(body.decision_id || crypto.randomUUID()),
    owner: String(body.owner || "unknown"),
    intent: String(body.intent || "deploy_production"),
    scope: asObject(body.scope),
    constraints: asObject(body.constraints),
    expiry: String(body.expiry || new Date(Date.now() + 60 * 60 * 1000).toISOString()),
    status: "ACTIVE",
    created_at: nowIso(),
    updated_at: nowIso()
  }
}

async function findAuthority(env: Env, decisionId: string): Promise<AuthorityRecord | null> {
  return env.DB.prepare("SELECT * FROM authorities WHERE decision_id = ?1").bind(decisionId).first<AuthorityRecord>()
}

async function updateAuthorityStatus(env: Env, decisionId: string, status: string) {
  await env.DB.prepare("UPDATE authorities SET status = ?1, updated_at = ?2 WHERE decision_id = ?3")
    .bind(status, nowIso(), decisionId)
    .run()
}

async function insertAuthority(env: Env, authority: ReturnType<typeof buildAuthority>) {
  await env.DB.prepare(
    `INSERT INTO authorities (
      decision_id, owner, intent, scope, constraints, expiry, status, created_at, updated_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`
  )
    .bind(
      authority.decision_id,
      authority.owner,
      authority.intent,
      JSON.stringify(authority.scope),
      JSON.stringify(authority.constraints),
      authority.expiry,
      authority.status,
      authority.created_at,
      authority.updated_at
    )
    .run()
}

async function insertCompile(
  env: Env,
  payload: { decision_id: string; aeo: unknown; object_hash: string; status: string; created_at: string }
) {
  await env.DB.prepare(
    `INSERT INTO compile_registry (compile_id, decision_id, aeo, object_hash, status, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
  )
    .bind(crypto.randomUUID(), payload.decision_id, JSON.stringify(payload.aeo), payload.object_hash, payload.status, payload.created_at)
    .run()
}

async function latestCompile(env: Env, decisionId: string) {
  return env.DB.prepare("SELECT * FROM compile_registry WHERE decision_id = ?1 ORDER BY created_at DESC LIMIT 1")
    .bind(decisionId)
    .first<any>()
}

async function insertValidation(env: Env, decisionId: string, result: "VALID" | "NULL", validatedHash: string | null) {
  await env.DB.prepare(
    `INSERT INTO validation_registry (validation_id, decision_id, validator_result, validated_object_hash, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5)`
  )
    .bind(crypto.randomUUID(), decisionId, result, validatedHash, nowIso())
    .run()
}

async function latestValidation(env: Env, decisionId: string) {
  return env.DB.prepare("SELECT * FROM validation_registry WHERE decision_id = ?1 ORDER BY created_at DESC LIMIT 1")
    .bind(decisionId)
    .first<any>()
}

async function insertExecution(env: Env, execution: any) {
  await env.DB.prepare(
    `INSERT INTO execution_registry (
      execution_id, decision_id, system, action, target, validated_object_hash, executed_object_hash,
      github_run_id, commit_sha, workflow_name, status, created_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`
  )
    .bind(
      execution.execution_id,
      execution.decision_id,
      execution.system,
      execution.action,
      JSON.stringify(execution.target),
      execution.validated_object_hash,
      execution.executed_object_hash,
      execution.github_run_id,
      execution.commit_sha,
      execution.workflow_name,
      execution.status,
      execution.created_at
    )
    .run()
}

async function findExecution(env: Env, executionId: string) {
  return env.DB.prepare("SELECT * FROM execution_registry WHERE execution_id = ?1").bind(executionId).first<any>()
}

async function executionByDecision(env: Env, decisionId: string) {
  return env.DB.prepare("SELECT * FROM execution_registry WHERE decision_id = ?1 ORDER BY created_at DESC LIMIT 1")
    .bind(decisionId)
    .first<any>()
}

async function insertProof(env: Env, proof: any) {
  await env.DB.prepare(
    `INSERT INTO proof_registry (
      proof_id, execution_id, decision_id, github_run_id, commit_sha, workflow_name, proof_timestamp, status, created_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`
  )
    .bind(
      proof.proof_id,
      proof.execution_id,
      proof.decision_id,
      proof.github_run_id,
      proof.commit_sha,
      proof.workflow_name,
      proof.timestamp,
      proof.status,
      proof.created_at
    )
    .run()
}

async function dispatchWorkflow(env: Env, target: Target, decisionId: string, objectHash: string): Promise<Response> {
  if (!env.GITHUB_TOKEN || !env.GITHUB_OWNER || !env.GITHUB_REPO) {
    throw new Error("Missing GITHUB_TOKEN, GITHUB_OWNER, or GITHUB_REPO")
  }

  const url = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/actions/workflows/${target.workflow}/dispatches`
  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28"
    },
    body: JSON.stringify({
      ref: target.ref,
      inputs: {
        decision_id: decisionId,
        validated_object_hash: objectHash,
        ...target.inputs
      }
    })
  })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === "/" && request.method === "GET") {
      return new Response("MindShift Runtime Live")
    }

    if (url.pathname === "/authority" && request.method === "POST") {
      const body = await readJson(request)
      if (!body) {
        return json({ error: "Invalid JSON" }, 400)
      }

      const authority = buildAuthority(body)
      const existing = await findAuthority(env, authority.decision_id)
      if (existing) {
        return json({ status: "BLOCKED", reason: "decision_id already exists" }, 409)
      }

      await insertAuthority(env, authority)
      return json(authority)
    }

    if (url.pathname === "/compile" && request.method === "POST") {
      const body = await readJson(request)
      if (!body?.decision_id) {
        return json({ error: "Missing decision_id" }, 400)
      }

      const authority = await findAuthority(env, String(body.decision_id))
      if (!authority) {
        return json({ error: "authority not found" }, 404)
      }

      const scope = JSON.parse(authority.scope)
      const validation = {
        validator: "omega",
        allowed_results: ["VALID", "NULL"]
      }
      const target = buildTarget(body)
      const aeo = {
        intent: authority.intent,
        scope,
        validation,
        target,
        finality: {
          proof_required: true,
          authority_consumes_on_proof: true
        }
      }
      const compiledHash = await sha256(aeo)

      await insertCompile(env, {
        decision_id: authority.decision_id,
        aeo,
        object_hash: compiledHash,
        status: "COMPILED",
        created_at: nowIso()
      })

      return json({ decision_id: authority.decision_id, aeo, compiled_object_hash: compiledHash })
    }

    if (url.pathname === "/validate" && request.method === "POST") {
      const body = await readJson(request)
      if (!body?.decision_id) {
        return json({ result: "NULL", reason: "Missing decision_id" }, 400)
      }

      const authority = await findAuthority(env, String(body.decision_id))
      const compiled = await latestCompile(env, String(body.decision_id))

      let result: "VALID" | "NULL" = "NULL"
      let validatedHash: string | null = null

      if (authority && compiled && authority.status === "ACTIVE" && new Date(authority.expiry).getTime() > Date.now()) {
        result = "VALID"
        validatedHash = compiled.object_hash
      }

      await insertValidation(env, String(body.decision_id), result, validatedHash)
      return json({ result, decision_id: body.decision_id, validated_object_hash: validatedHash })
    }

    if (url.pathname === "/execute" && request.method === "POST") {
      const body = await readJson(request)
      if (!body?.decision_id) {
        return json({ status: "BLOCKED", reason: "Missing decision_id" }, 400)
      }

      const decisionId = String(body.decision_id)
      const authority = await findAuthority(env, decisionId)
      if (!authority) {
        return json({ status: "BLOCKED", reason: "authority not found" }, 404)
      }

      if (authority.status !== "ACTIVE") {
        return json({ status: "BLOCKED", reason: `authority status is ${authority.status}` }, 409)
      }

      const existingExecution = await executionByDecision(env, decisionId)
      if (existingExecution) {
        return json({ status: "BLOCKED", reason: "decision_id already executed" }, 409)
      }

      const compiled = await latestCompile(env, decisionId)
      const validation = await latestValidation(env, decisionId)
      if (!compiled || !validation || validation.validator_result !== "VALID") {
        return json({ status: "BLOCKED", reason: "missing VALID validator state" }, 409)
      }

      const validatedObjectHash = String(body.validated_object_hash || validation.validated_object_hash || "")
      if (!validatedObjectHash) {
        return json({ status: "BLOCKED", reason: "validated_object_hash is required" }, 400)
      }

      const compiledAeo = JSON.parse(compiled.aeo)
      const executedObject = {
        intent: compiledAeo.intent,
        scope: compiledAeo.scope,
        validation: compiledAeo.validation,
        target: compiledAeo.target,
        finality: compiledAeo.finality
      }
      const executedObjectHash = await sha256(executedObject)

      if (validatedObjectHash !== executedObjectHash) {
        return json({
          status: "BLOCKED",
          reason: "validated_object_hash != executed_object_hash",
          validated_object_hash: validatedObjectHash,
          executed_object_hash: executedObjectHash
        }, 409)
      }

      const target = compiledAeo.target as Target
      let dispatchStatus = 0
      let githubRunId: string | null = null

      try {
        const dispatchResponse = await dispatchWorkflow(env, target, decisionId, validatedObjectHash)
        dispatchStatus = dispatchResponse.status

        const runIdHeader = dispatchResponse.headers.get("x-github-request-id")
        if (runIdHeader) {
          githubRunId = runIdHeader
        }

        if (!dispatchResponse.ok) {
          return json({ status: "FAILED", reason: "GitHub workflow_dispatch failed", github_status: dispatchStatus }, 502)
        }
      } catch (error: any) {
        return json({ status: "FAILED", reason: error?.message || "dispatch error" }, 500)
      }

      const execution = {
        execution_id: crypto.randomUUID(),
        decision_id: decisionId,
        system: "github_actions",
        action: "workflow_dispatch",
        target,
        validated_object_hash: validatedObjectHash,
        executed_object_hash: executedObjectHash,
        github_run_id: githubRunId,
        commit_sha: String(body.commit_sha || "pending"),
        workflow_name: target.workflow,
        status: "EXECUTED_PENDING_PROOF",
        created_at: nowIso()
      }

      await insertExecution(env, execution)
      await updateAuthorityStatus(env, decisionId, "EXECUTED_PENDING_PROOF")

      return json({
        status: execution.status,
        execution_id: execution.execution_id,
        decision_id: decisionId,
        validated_object_hash: validatedObjectHash,
        executed_object_hash: executedObjectHash
      })
    }

    if (url.pathname === "/proof" && request.method === "POST") {
      const body = await readJson(request)
      if (!body?.execution_id || !body?.decision_id || !body?.commit_sha || !body?.workflow_name) {
        return json({ status: "FAILED", reason: "Missing execution_id, decision_id, commit_sha, or workflow_name" }, 400)
      }

      const execution = await findExecution(env, String(body.execution_id))
      if (!execution) {
        return json({ status: "FAILED", reason: "execution not found" }, 404)
      }

      if (execution.decision_id !== body.decision_id) {
        return json({ status: "FAILED", reason: "decision mismatch" }, 409)
      }

      const proof = {
        proof_id: crypto.randomUUID(),
        execution_id: String(body.execution_id),
        decision_id: String(body.decision_id),
        github_run_id: body.github_run_id ? String(body.github_run_id) : execution.github_run_id,
        commit_sha: String(body.commit_sha),
        workflow_name: String(body.workflow_name),
        timestamp: String(body.timestamp || nowIso()),
        status: "PROVED",
        created_at: nowIso()
      }

      await insertProof(env, proof)
      await updateAuthorityStatus(env, proof.decision_id, "CONSUMED")

      return json({ status: "PROVED", proof })
    }

    if (url.pathname === "/replay-test" && request.method === "GET") {
      const decisionId = `replay-${crypto.randomUUID()}`
      const authority = buildAuthority({
        decision_id: decisionId,
        owner: "replay_test",
        intent: "deploy_production",
        scope: { layer: "Runtime -> GitHub Deploy Boundary" },
        constraints: { allow_once: true }
      })
      await insertAuthority(env, authority)

      const target = buildTarget({})
      const aeo = {
        intent: authority.intent,
        scope: authority.scope,
        validation: { validator: "omega", allowed_results: ["VALID", "NULL"] },
        target,
        finality: { proof_required: true, authority_consumes_on_proof: true }
      }
      const objectHash = await sha256(aeo)
      await insertCompile(env, {
        decision_id: decisionId,
        aeo,
        object_hash: objectHash,
        status: "COMPILED",
        created_at: nowIso()
      })
      await insertValidation(env, decisionId, "VALID", objectHash)

      const execution = {
        execution_id: crypto.randomUUID(),
        decision_id: decisionId,
        system: "github_actions",
        action: "workflow_dispatch",
        target,
        validated_object_hash: objectHash,
        executed_object_hash: objectHash,
        github_run_id: "simulated-run",
        commit_sha: "simulated-commit",
        workflow_name: target.workflow,
        status: "EXECUTED_PENDING_PROOF",
        created_at: nowIso()
      }
      await insertExecution(env, execution)
      await updateAuthorityStatus(env, decisionId, "EXECUTED_PENDING_PROOF")

      const secondAttemptBlocked = (await executionByDecision(env, decisionId)) ? "BLOCKED" : "EXECUTED"

      return json({
        decision_id: decisionId,
        sequence: ["EXECUTED", secondAttemptBlocked],
        reason: "same decision_id cannot execute twice"
      })
    }

    return json({ error: "Not found" }, 404)
  }
}
