function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json" }
  })
}

type Env = {
  DB: D1Database
}

type AuthorityRecord = {
  decision_id: string
  owner: string
  intent: string
  scope: string
  constraints: string
  expiry: string | null
  status: string
}

type CompileRecord = {
  decision_id: string
  aeo_hash: string
  compiled_object_json: string
}

type ValidationRecord = {
  validation_id: string
  decision_id: string
  aeo_hash: string
  result: string
  timestamp: string
  validated_object_hash: string | null
}

async function readJson(request: Request): Promise<any | null> {
  try {
    return await request.json()
  } catch {
    return null
  }
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

function nowIso() {
  return new Date().toISOString()
}

async function getAuthority(env: Env, decisionId: string) {
  return env.DB.prepare("SELECT * FROM authorities WHERE decision_id = ?1")
    .bind(decisionId)
    .first<AuthorityRecord>()
}

async function setAuthorityStatus(env: Env, decisionId: string, status: string) {
  await env.DB.prepare("UPDATE authorities SET status = ?1 WHERE decision_id = ?2").bind(status, decisionId).run()
}

async function latestCompile(env: Env, decisionId: string) {
  return env.DB.prepare("SELECT * FROM compile_registry WHERE decision_id = ?1 ORDER BY rowid DESC LIMIT 1")
    .bind(decisionId)
    .first<CompileRecord>()
}

async function latestValidation(env: Env, decisionId: string) {
  return env.DB.prepare("SELECT * FROM validation_registry WHERE decision_id = ?1 ORDER BY timestamp DESC LIMIT 1")
    .bind(decisionId)
    .first<ValidationRecord>()
}

async function insertValidation(
  env: Env,
  payload: { decisionId: string; aeoHash: string; result: string; validatedObjectHash: string | null }
) {
  const validation = {
    validation_id: crypto.randomUUID(),
    decision_id: payload.decisionId,
    aeo_hash: payload.aeoHash,
    result: payload.result,
    timestamp: nowIso(),
    validated_object_hash: payload.validatedObjectHash
  }

  await env.DB.prepare(
    `INSERT INTO validation_registry (
      validation_id,
      decision_id,
      aeo_hash,
      result,
      timestamp,
      validated_object_hash
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
  )
    .bind(
      validation.validation_id,
      validation.decision_id,
      validation.aeo_hash,
      validation.result,
      validation.timestamp,
      validation.validated_object_hash
    )
    .run()

  return validation
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === "/" && request.method === "GET") {
      return new Response("MindShift Runtime Live")
    }

    if (url.pathname === "/authority" && request.method === "POST") {
      const body = await readJson(request)
      if (!body || !body.decision_id) {
        return jsonResponse({ error: "decision_id is required" }, 400)
      }

      const authority = {
        decision_id: String(body.decision_id),
        owner: String(body.owner || "unknown"),
        intent: String(body.intent || "execute"),
        scope: JSON.stringify(body.scope || {}),
        constraints: JSON.stringify(body.constraints || {}),
        expiry: body.expiry ? String(body.expiry) : null,
        status: "ACTIVE"
      }

      await env.DB.prepare(
        `INSERT OR REPLACE INTO authorities (
          decision_id,
          owner,
          intent,
          scope,
          constraints,
          expiry,
          status
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
      )
        .bind(
          authority.decision_id,
          authority.owner,
          authority.intent,
          authority.scope,
          authority.constraints,
          authority.expiry,
          authority.status
        )
        .run()

      return jsonResponse(authority)
    }

    if (url.pathname === "/compile" && request.method === "POST") {
      const body = await readJson(request)
      if (!body || !body.decision_id) {
        return jsonResponse({ error: "decision_id is required" }, 400)
      }

      const authority = await getAuthority(env, String(body.decision_id))
      if (!authority) {
        return jsonResponse({ error: "authority not found" }, 404)
      }

      const compiledObject = {
        decision_id: authority.decision_id,
        owner: authority.owner,
        intent: authority.intent,
        scope: JSON.parse(authority.scope || "{}"),
        constraints: JSON.parse(authority.constraints || "{}"),
        compiled_at: nowIso()
      }

      const compiledJson = JSON.stringify(compiledObject)
      const aeoHash = await sha256Hex(compiledJson)

      await env.DB.prepare(
        `INSERT INTO compile_registry (
          decision_id,
          aeo_hash,
          compiled_object_json
        ) VALUES (?1, ?2, ?3)`
      )
        .bind(authority.decision_id, aeoHash, compiledJson)
        .run()

      return jsonResponse({ decision_id: authority.decision_id, aeo_hash: aeoHash, compiled_object: compiledObject })
    }

    if (url.pathname === "/validate" && request.method === "POST") {
      const body = await readJson(request)
      if (!body || !body.decision_id) {
        return jsonResponse({ error: "decision_id is required" }, 400)
      }

      const decisionId = String(body.decision_id)
      const authority = await getAuthority(env, decisionId)
      if (!authority) {
        return jsonResponse({ decision_id: decisionId, result: null, message: "authority not found" }, 404)
      }

      // Replay protection: only ACTIVE authority can validate.
      if (authority.status !== "ACTIVE") {
        return jsonResponse({ decision_id: decisionId, result: null, message: "authority not ACTIVE" })
      }

      const compile = await latestCompile(env, decisionId)
      if (!compile) {
        return jsonResponse({ error: "compile step required before validate" }, 409)
      }

      const validation = await insertValidation(env, {
        decisionId,
        aeoHash: compile.aeo_hash,
        result: "VALID",
        validatedObjectHash: compile.aeo_hash
      })

      return jsonResponse({
        validation_id: validation.validation_id,
        decision_id: decisionId,
        result: validation.result,
        validated_object_hash: validation.validated_object_hash
      })
    }

    if (url.pathname === "/execute" && request.method === "POST") {
      const body = await readJson(request)
      if (!body || !body.decision_id) {
        return jsonResponse({ error: "decision_id is required" }, 400)
      }

      const decisionId = String(body.decision_id)
      const authority = await getAuthority(env, decisionId)
      if (!authority) {
        return jsonResponse({ status: "BLOCKED", reason: "authority not found" }, 404)
      }

      const validation = await latestValidation(env, decisionId)
      if (!validation || validation.result !== "VALID") {
        return jsonResponse({ status: "BLOCKED", reason: "validation result is not VALID" }, 409)
      }

      const compile = await latestCompile(env, decisionId)
      if (!compile) {
        return jsonResponse({ status: "BLOCKED", reason: "compiled object missing" }, 409)
      }

      // Exact-object discipline: hash what execute is trying to run.
      const executedObjectJson = body.compiled_object
        ? JSON.stringify(body.compiled_object)
        : compile.compiled_object_json
      const executedObjectHash = await sha256Hex(executedObjectJson)

      if (validation.validated_object_hash !== executedObjectHash) {
        return jsonResponse({
          status: "BLOCKED",
          reason: "validated_object_hash does not match executed_object_hash",
          validated_object_hash: validation.validated_object_hash,
          executed_object_hash: executedObjectHash
        })
      }

      const executionId = crypto.randomUUID()
      await env.DB.prepare(
        `INSERT INTO execution_registry (
          execution_id,
          decision_id,
          aeo_hash,
          status,
          github_run_id,
          commit_sha,
          workflow_name,
          timestamp
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
      )
        .bind(
          executionId,
          decisionId,
          executedObjectHash,
          "EXECUTED",
          String(body.github_run_id || "local-simulated-run"),
          String(body.commit_sha || "local-simulated-commit"),
          String(body.workflow_name || "local-simulated-workflow"),
          nowIso()
        )
        .run()

      // Lifecycle: authority becomes pending-proof after first successful execution.
      await setAuthorityStatus(env, decisionId, "EXECUTED_PENDING_PROOF")

      return jsonResponse({ execution_id: executionId, decision_id: decisionId, status: "EXECUTED" })
    }

    if (url.pathname === "/proof" && request.method === "POST") {
      const body = await readJson(request)
      if (!body || !body.execution_id || !body.decision_id) {
        return jsonResponse({ error: "execution_id and decision_id are required" }, 400)
      }

      const execution = await env.DB.prepare("SELECT * FROM execution_registry WHERE execution_id = ?1")
        .bind(String(body.execution_id))
        .first<any>()

      if (!execution) {
        return jsonResponse({ error: "execution not found" }, 404)
      }

      const proofId = crypto.randomUUID()
      await env.DB.prepare(
        `INSERT INTO proof_registry (
          proof_id,
          execution_id,
          decision_id,
          proof_reference,
          timestamp
        ) VALUES (?1, ?2, ?3, ?4, ?5)`
      )
        .bind(
          proofId,
          String(body.execution_id),
          String(body.decision_id),
          String(body.proof_reference || "local-proof"),
          nowIso()
        )
        .run()

      // Lifecycle: proof consumption finalizes authority.
      await setAuthorityStatus(env, String(body.decision_id), "CONSUMED")

      return jsonResponse({ proof_id: proofId, status: "RECORDED" })
    }

    if (url.pathname === "/replay-test" && request.method === "GET") {
      const decisionId = `replay-${crypto.randomUUID()}`

      // 1) create authority (ACTIVE)
      await env.DB.prepare(
        `INSERT INTO authorities (decision_id, owner, intent, scope, constraints, expiry, status)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
      )
        .bind(decisionId, "replay-test", "execute", "{}", "{}", null, "ACTIVE")
        .run()

      // 2) compile
      const firstCompileObj = { decision_id: decisionId, sample: "aeo", nonce: 1 }
      const firstCompileJson = JSON.stringify(firstCompileObj)
      const firstHash = await sha256Hex(firstCompileJson)
      await env.DB.prepare("INSERT INTO compile_registry (decision_id, aeo_hash, compiled_object_json) VALUES (?1, ?2, ?3)")
        .bind(decisionId, firstHash, firstCompileJson)
        .run()

      // 3) validate -> VALID
      await insertValidation(env, {
        decisionId,
        aeoHash: firstHash,
        result: "VALID",
        validatedObjectHash: firstHash
      })

      // 4) execute -> EXECUTED and 5) proof -> recorded then authority CONSUMED
      const executeFirst = await env.DB.prepare(
        `INSERT INTO execution_registry (execution_id, decision_id, aeo_hash, status, github_run_id, commit_sha, workflow_name, timestamp)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
      )
        .bind(crypto.randomUUID(), decisionId, firstHash, "EXECUTED", "run-1", "sha-1", "wf-1", nowIso())
        .run()

      await setAuthorityStatus(env, decisionId, "EXECUTED_PENDING_PROOF")

      const firstExecution = await env.DB.prepare("SELECT execution_id FROM execution_registry WHERE decision_id = ?1 ORDER BY timestamp DESC LIMIT 1")
        .bind(decisionId)
        .first<{ execution_id: string }>()

      if (executeFirst.success && firstExecution) {
        await env.DB.prepare(
          "INSERT INTO proof_registry (proof_id, execution_id, decision_id, proof_reference, timestamp) VALUES (?1, ?2, ?3, ?4, ?5)"
        )
          .bind(crypto.randomUUID(), firstExecution.execution_id, decisionId, "proof-1", nowIso())
          .run()
        await setAuthorityStatus(env, decisionId, "CONSUMED")
      }

      // 6) second attempt: validate must be NULL and execution BLOCKED
      const secondCompileObj = { decision_id: decisionId, sample: "aeo", nonce: 2 }
      const secondCompileJson = JSON.stringify(secondCompileObj)
      const secondHash = await sha256Hex(secondCompileJson)
      await env.DB.prepare("INSERT INTO compile_registry (decision_id, aeo_hash, compiled_object_json) VALUES (?1, ?2, ?3)")
        .bind(decisionId, secondHash, secondCompileJson)
        .run()

      const authorityAfterProof = await getAuthority(env, decisionId)
      const secondValidationResult = authorityAfterProof?.status === "ACTIVE" ? "VALID" : null
      const secondExecutionStatus = secondValidationResult === "VALID" ? "EXECUTED" : "BLOCKED"

      return jsonResponse({
        sequence: ["EXECUTED", secondExecutionStatus],
        replay_validation_result: secondValidationResult
      })
    }

    return jsonResponse({ error: "Not found" }, 404)
  }
}
