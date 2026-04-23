function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json" }
  })
}

const EXECUTION_WEBHOOK_URL = "https://webhook.site/7957d61a-a8bf-4738-a5e6-e8c25a881642"
const SIMULATED_SURFACE = "simulated_surface"

// Cloudflare Worker environment bindings.
type Env = {
  DB: D1Database
}

type TargetInput = {
  system: string
  action: string
}

async function readJson(request: Request): Promise<any | null> {
  try {
    return await request.json()
  } catch {
    return null
  }
}

function buildAuthority(body: any) {
  // Keep authority objects small and explicit so the flow is easy to follow.
  return {
    authority_id: crypto.randomUUID(),
    decision_id: body.decision_id || crypto.randomUUID(),
    owner: body.owner || "unknown",
    intent: body.intent || "unspecified",
    scope: body.scope || {},
    constraints: body.constraints || {},
    status: "ACTIVE",
    created_at: new Date().toISOString()
  }
}

function buildAeo(authority: any) {
  // AEO represents a compiled execution object derived from authority input.
  return {
    aeo_id: crypto.randomUUID(),
    authority_id: authority.authority_id,
    decision_id: authority.decision_id,
    intent: authority.intent,
    scope: authority.scope,
    validation: {
      authority_id: authority.authority_id
    },
    target: {
      system: "webhook",
      action: "send"
    },
    finality: {
      proof_required: true
    },
    status: "COMPILED"
  }
}

function buildValidation(aeo: any) {
  // Validation is simple in this demo: it marks the compiled object as valid.
  return {
    validation_id: crypto.randomUUID(),
    authority_id: aeo.authority_id,
    aeo_id: aeo.aeo_id,
    decision_id: aeo.decision_id,
    intent: aeo.intent,
    result: "VALID",
    status: "VALIDATED"
  }
}

function isExactObject(value: unknown) {
  // Guardrail: runtime only accepts plain objects to preserve exact-object discipline.
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

function hasOnlyKeys(body: Record<string, unknown>, allowedKeys: string[]) {
  // Fail closed when unknown top-level keys are supplied.
  return Object.keys(body).every((key) => allowedKeys.includes(key))
}

function normalizeTarget(body: Record<string, any>): TargetInput {
  // Default target keeps older clients working while allowing new simulated surface.
  return {
    system: body.target?.system || "webhook",
    action: body.target?.action || "send"
  }
}

async function findAuthorityByDecisionId(env: Env, decisionId: string) {
  // Look up the latest authority row for a decision so /validate can trust stored data.
  return env.DB.prepare("SELECT * FROM authorities WHERE decision_id = ?1 ORDER BY rowid DESC LIMIT 1")
    .bind(decisionId)
    .first<any>()
}

function isAuthorityUsableForExecution(authorityStatus: string | null | undefined) {
  // Keep this list explicit so beginners can easily update allowed statuses later.
  const allowedStatuses = ["ACTIVE"]
  return allowedStatuses.includes((authorityStatus || "").toUpperCase())
}

async function consumeAuthority(env: Env, decisionId: string) {
  // Mark authority as consumed so the same decision_id cannot execute twice.
  await env.DB.prepare("UPDATE authorities SET status = ?1 WHERE decision_id = ?2")
    .bind("CONSUMED", decisionId)
    .run()
}

async function saveAuthority(env: Env, authority: any) {
  // Save authority data to D1 (scope/constraints serialized as JSON strings).
  await env.DB.prepare(
    `INSERT INTO authorities (
      decision_id,
      owner,
      intent,
      scope,
      constraints,
      status,
      created_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
  )
    .bind(
      authority.decision_id,
      authority.owner,
      authority.intent,
      JSON.stringify(authority.scope),
      JSON.stringify(authority.constraints),
      authority.status,
      authority.created_at
    )
    .run()
}

async function saveExecution(env: Env, execution: any) {
  await env.DB.prepare(
    `INSERT INTO executions (
      execution_id,
      decision_id,
      intent,
      webhook_url,
      upstream_status,
      status,
      timestamp
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
  )
    .bind(
      execution.execution_id,
      execution.decision_id,
      execution.intent,
      execution.webhook_url,
      execution.upstream_status,
      execution.status,
      execution.timestamp
    )
    .run()
}

async function executeWebhook(env: Env, decisionId: string, intent: string, target: TargetInput) {
  // Execute the webhook and always write an execution record to D1.
  const executionId = crypto.randomUUID()
  const timestamp = new Date().toISOString()
  let status = "FAILED"
  let upstreamStatus: number | null = null

  try {
    const upstream = await fetch(EXECUTION_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        execution_id: executionId,
        decision_id: decisionId,
        intent,
        target,
        timestamp,
        source: "mindshift-demo"
      })
    })

    status = upstream.ok ? "EXECUTED" : "FAILED"
    upstreamStatus = upstream.status
  } catch {
    status = "FAILED"
  }

  const execution = {
    execution_id: executionId,
    decision_id: decisionId,
    intent,
    webhook_url: EXECUTION_WEBHOOK_URL,
    upstream_status: upstreamStatus,
    status,
    timestamp,
    surface: "webhook",
    result: {
      message: status === "EXECUTED" ? "Webhook execution completed" : "Webhook execution failed",
      target_system: target.system,
      target_action: target.action
    }
  }

  await saveExecution(env, execution)
  return execution
}

async function executeSimulated(env: Env, decisionId: string, intent: string, target: TargetInput) {
  // Simulated mode never touches an external system; it writes a structured fake result.
  const execution = {
    execution_id: crypto.randomUUID(),
    decision_id: decisionId,
    intent,
    webhook_url: `${SIMULATED_SURFACE}://${target.action}`,
    upstream_status: null,
    status: "EXECUTED",
    timestamp: new Date().toISOString(),
    surface: SIMULATED_SURFACE,
    result: {
      message: "Simulated execution completed",
      target_system: target.system,
      target_action: target.action
    }
  }

  await saveExecution(env, execution)

  return {
    execution_id: execution.execution_id,
    decision_id: execution.decision_id,
    surface: execution.surface,
    status: execution.status,
    result: execution.result,
    timestamp: execution.timestamp
  }
}

function buildProof(body: any, execution: any) {
  // Proof records reference the execution and decision they belong to.
  return {
    proof_id: crypto.randomUUID(),
    execution_id: body.execution_id,
    decision_id: body.decision_id,
    surface: body.surface,
    proof_reference: body.proof_reference,
    timestamp: new Date().toISOString(),
    status: "RECORDED",
    execution_status: execution.status
  }
}

async function saveProof(env: Env, proof: any) {
  // Persist proof records in D1.
  await env.DB.prepare(
    `INSERT INTO proofs (
      proof_id,
      execution_id,
      decision_id,
      surface,
      proof_reference,
      status,
      timestamp
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
  )
    .bind(
      proof.proof_id,
      proof.execution_id,
      proof.decision_id,
      proof.surface,
      proof.proof_reference,
      proof.status,
      proof.timestamp
    )
    .run()
}

async function findExecution(env: Env, executionId: string) {
  return env.DB.prepare("SELECT * FROM executions WHERE execution_id = ?1").bind(executionId).first<any>()
}

async function listAuthorities(env: Env) {
  // Simple debug route helper: return newest authorities first.
  return env.DB.prepare("SELECT * FROM authorities ORDER BY created_at DESC").all()
}

async function listExecutions(env: Env) {
  // Simple debug route helper: return newest executions first.
  return env.DB.prepare("SELECT * FROM executions ORDER BY timestamp DESC").all()
}

async function listProofs(env: Env) {
  // Simple debug route helper: return newest proofs first.
  return env.DB.prepare("SELECT * FROM proofs ORDER BY timestamp DESC").all()
}

async function recordsSavedForRun(env: Env, decisionId: string, executionId: string, proofId: string) {
  const [authority, execution, proof] = await Promise.all([
    env.DB.prepare("SELECT decision_id FROM authorities WHERE decision_id = ?1 ORDER BY rowid DESC LIMIT 1")
      .bind(decisionId)
      .first(),
    env.DB.prepare("SELECT execution_id FROM executions WHERE execution_id = ?1")
      .bind(executionId)
      .first(),
    env.DB.prepare("SELECT proof_id FROM proofs WHERE proof_id = ?1")
      .bind(proofId)
      .first()
  ])

  return {
    authority_saved: Boolean(authority),
    execution_saved: Boolean(execution),
    proof_saved: Boolean(proof)
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === "/") {
      return new Response("MindShift Runtime Live")
    }

    if (url.pathname === "/records/authorities" && request.method === "GET") {
      const results = await listAuthorities(env)
      return jsonResponse(results.results ?? [])
    }

    if (url.pathname === "/records/executions" && request.method === "GET") {
      const results = await listExecutions(env)
      return jsonResponse(results.results ?? [])
    }

    if (url.pathname === "/records/proofs" && request.method === "GET") {
      const results = await listProofs(env)
      return jsonResponse(results.results ?? [])
    }

    if (url.pathname === "/authority" && request.method === "POST") {
      const body = await readJson(request)
      if (!body) {
        return jsonResponse({ status: "FAILED", error: "Invalid JSON body" }, 400)
      }

      const authority = buildAuthority(body)
      await saveAuthority(env, authority)
      return jsonResponse(authority)
    }

    if (url.pathname === "/compile" && request.method === "POST") {
      const body = await readJson(request)
      if (!body) {
        return jsonResponse({ status: "FAILED", error: "Invalid JSON body" }, 400)
      }

      const authority = buildAuthority(body)
      const aeo = buildAeo(authority)
      return jsonResponse(aeo)
    }

    if (url.pathname === "/validate" && request.method === "POST") {
      const body = await readJson(request)
      if (!body) {
        return jsonResponse({ status: "FAILED", error: "Invalid JSON body" }, 400)
      }

      const validationId = crypto.randomUUID()

      // Require decision_id so validation is tied to an existing authority record.
      if (!body.decision_id) {
        return jsonResponse(
          {
            validation_id: validationId,
            decision_id: null,
            status: "FAILED",
            result: "INVALID",
            message: "Missing decision_id. Provide the decision_id from POST /authority."
          },
          400
        )
      }

      const authority = await findAuthorityByDecisionId(env, body.decision_id)
      if (!authority) {
        return jsonResponse(
          {
            validation_id: validationId,
            decision_id: body.decision_id,
            status: "FAILED",
            result: "INVALID",
            message: "No authority record found in D1 for this decision_id. Create authority first via POST /authority."
          },
          404
        )
      }

      if (!isAuthorityUsableForExecution(authority.status)) {
        const message =
          String(authority.status).toUpperCase() === "CONSUMED"
            ? "authority already consumed"
            : `Authority exists, but status '${authority.status}' is not valid for execution.`

        return jsonResponse(
          {
            validation_id: validationId,
            decision_id: body.decision_id,
            status: "FAILED",
            result: "INVALID",
            message
          },
          409
        )
      }

      // If we reach this point, the stored authority exists and is usable.
      const validation = {
        validation_id: validationId,
        decision_id: body.decision_id,
        result: "VALID",
        status: "VALIDATED",
        message: "Authority record exists in D1 and is usable for execution."
      }
      return jsonResponse(validation)
    }

    if (url.pathname === "/execute" && request.method === "POST") {
      const body = await readJson(request)
      if (!isExactObject(body)) {
        return jsonResponse({ status: "FAILED", error: "Invalid JSON body" }, 400)
      }

      const allowedKeys = ["decision_id", "intent", "scope", "target", "finality"]
      if (!hasOnlyKeys(body, allowedKeys)) {
        return jsonResponse(
          {
            status: "FAILED",
            error: "Unknown fields in /execute body. Allowed fields: decision_id, intent, scope, target, finality"
          },
          400
        )
      }

      if (!body.decision_id) {
        return jsonResponse({ status: "FAILED", error: "Missing decision_id" }, 400)
      }

      if (!body.intent) {
        return jsonResponse({ status: "FAILED", error: "Missing intent" }, 400)
      }

      const target = normalizeTarget(body)
      const allowedSystems = ["webhook", "github_actions", SIMULATED_SURFACE]
      if (!allowedSystems.includes(target.system)) {
        return jsonResponse(
          {
            status: "FAILED",
            decision_id: body.decision_id,
            result: "NOT_EXECUTED",
            message: `Unsupported target.system '${target.system}'.`
          },
          400
        )
      }

      // Fail closed: if authority is missing or invalid in D1, do not execute any target.
      const authority = await findAuthorityByDecisionId(env, body.decision_id)
      if (!authority) {
        return jsonResponse(
          {
            status: "FAILED",
            decision_id: body.decision_id,
            result: "NOT_EXECUTED",
            message: "Execution blocked: no authority record found in D1 for this decision_id."
          },
          404
        )
      }

      if (!isAuthorityUsableForExecution(authority.status)) {
        const message =
          String(authority.status).toUpperCase() === "CONSUMED"
            ? "Execution blocked: authority already consumed."
            : `Execution blocked: authority status '${authority.status}' is not ACTIVE.`

        return jsonResponse(
          {
            status: "FAILED",
            decision_id: body.decision_id,
            result: "NOT_EXECUTED",
            message
          },
          409
        )
      }

      try {
        let execution

        // Conduit branch: each target system maps to a distinct execution surface.
        if (target.system === SIMULATED_SURFACE) {
          execution = await executeSimulated(env, body.decision_id, body.intent, target)
        } else if (target.system === "webhook") {
          execution = await executeWebhook(env, body.decision_id, body.intent, target)
        } else {
          // Placeholder for future GitHub Actions adapter.
          return jsonResponse(
            {
              status: "FAILED",
              decision_id: body.decision_id,
              result: "NOT_EXECUTED",
              message: "github_actions adapter is not configured in this demo Worker yet."
            },
            501
          )
        }

        if (execution.status === "EXECUTED") {
          // Consume authority only after successful execution.
          await consumeAuthority(env, body.decision_id)
        }

        const statusCode = execution.status === "FAILED" ? 502 : 200
        return jsonResponse(execution, statusCode)
      } catch (error: any) {
        // Return a readable error for beginners instead of an uncaught Worker exception.
        return jsonResponse(
          {
            status: "FAILED",
            decision_id: body.decision_id,
            result: "NOT_EXECUTED",
            message: "Execution failed while processing target adapter or database write.",
            error: error?.message || "Unknown execution error"
          },
          500
        )
      }
    }

    if (url.pathname === "/proof" && request.method === "POST") {
      const body = await readJson(request)
      if (!body) {
        return jsonResponse({ status: "FAILED", error: "Invalid JSON body" }, 400)
      }

      const required = ["execution_id", "decision_id", "surface", "proof_reference"]
      const missing = required.filter((key) => !body[key])
      if (missing.length > 0) {
        return jsonResponse({ status: "FAILED", error: `Missing fields: ${missing.join(", ")}` }, 400)
      }

      const execution = await findExecution(env, body.execution_id)
      if (!execution) {
        return jsonResponse(
          {
            status: "FAILED",
            error: "Unknown execution_id. Run /execute first so proof is tied to a real execution."
          },
          404
        )
      }

      if (execution.decision_id !== body.decision_id) {
        return jsonResponse(
          {
            status: "FAILED",
            error: "decision_id does not match the stored execution record"
          },
          409
        )
      }

      // For simulated executions, enforce the simulated proof reference format.
      if (body.surface === SIMULATED_SURFACE && body.proof_reference !== `simulated://${body.execution_id}`) {
        return jsonResponse(
          {
            status: "FAILED",
            error: "Simulated proofs must use proof_reference format simulated://<execution_id>"
          },
          400
        )
      }

      const proof = buildProof(body, execution)
      await saveProof(env, proof)
      return jsonResponse(proof)
    }

    if (url.pathname === "/simulate-test" && request.method === "GET") {
      // Step 1: Authority (entry point for governed intent).
      const step1Authority = buildAuthority({
        owner: "simulate_test",
        decision_id: `decision-${crypto.randomUUID()}`,
        intent: "deploy_service",
        scope: { service: "api", environment: "staging" },
        constraints: { safe: true }
      })
      await saveAuthority(env, step1Authority)

      // Step 2: Compile (authority -> AEO).
      const step2Aeo = buildAeo(step1Authority)

      // Step 3: Validate (VALID | NULL discipline).
      const step3Validation = buildValidation(step2Aeo)

      // Step 4: Execute against simulated surface (no external call).
      const step4Execution = await executeSimulated(env, step2Aeo.decision_id, step2Aeo.intent, {
        system: SIMULATED_SURFACE,
        action: "deploy"
      })
      await consumeAuthority(env, step2Aeo.decision_id)

      // Step 5: Proof-of-transfer for simulated execution.
      const step5Proof = buildProof(
        {
          execution_id: step4Execution.execution_id,
          decision_id: step4Execution.decision_id,
          surface: SIMULATED_SURFACE,
          proof_reference: `simulated://${step4Execution.execution_id}`
        },
        step4Execution
      )
      await saveProof(env, step5Proof)

      const persistence = await recordsSavedForRun(
        env,
        step1Authority.decision_id,
        step4Execution.execution_id,
        step5Proof.proof_id
      )

      return jsonResponse({
        step_1_authority: step1Authority,
        step_2_compile: step2Aeo,
        step_3_validate: step3Validation,
        step_4_execute: step4Execution,
        step_5_proof: step5Proof,
        persistence
      })
    }

    if (url.pathname === "/browser-test" && request.method === "GET") {
      const step1Authority = buildAuthority({
        owner: "browser_test",
        decision_id: `decision-${crypto.randomUUID()}`,
        intent: "demo_run",
        scope: { mode: "demo" },
        constraints: { safe: true }
      })
      await saveAuthority(env, step1Authority)

      const step2Aeo = buildAeo(step1Authority)
      const step3Validation = buildValidation(step2Aeo)
      const step4Execution = await executeWebhook(env, step3Validation.decision_id, step3Validation.intent, {
        system: "webhook",
        action: "send"
      })

      const step5Proof = buildProof(
        {
          execution_id: step4Execution.execution_id,
          decision_id: step4Execution.decision_id,
          surface: "webhook",
          proof_reference: `${step4Execution.webhook_url}#${step4Execution.execution_id}`
        },
        step4Execution
      )
      await saveProof(env, step5Proof)

      const persistence = await recordsSavedForRun(
        env,
        step1Authority.decision_id,
        step4Execution.execution_id,
        step5Proof.proof_id
      )

      return jsonResponse({
        step_1_authority: step1Authority,
        step_2_aeo: step2Aeo,
        step_3_validation: step3Validation,
        step_4_execution: step4Execution,
        step_5_proof: step5Proof,
        persistence
      })
    }

    return new Response("Not Found", { status: 404 })
  }
}
