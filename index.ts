function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json" }
  })
}

const EXECUTION_WEBHOOK_URL = "https://webhook.site/7957d61a-a8bf-4738-a5e6-e8c25a881642"

// Cloudflare Worker environment bindings.
type Env = {
  DB: D1Database
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
    status: "AUTHORIZED",
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

async function executeWebhook(env: Env, decisionId: string, intent: string) {
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
    timestamp
  }

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

  return execution
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
    // Normalize trailing slashes so both `/browser-test` and `/browser-test/` work.
    const pathname = url.pathname.replace(/\/+$/, "") || "/"

    if (pathname === "/") {
      return new Response("MindShift Runtime Live")
    }

    if (pathname === "/records/authorities" && request.method === "GET") {
      const results = await listAuthorities(env)
      return jsonResponse(results.results ?? [])
    }

    if (pathname === "/records/executions" && request.method === "GET") {
      const results = await listExecutions(env)
      return jsonResponse(results.results ?? [])
    }

    if (pathname === "/records/proofs" && request.method === "GET") {
      const results = await listProofs(env)
      return jsonResponse(results.results ?? [])
    }

    if (pathname === "/authority" && request.method === "POST") {
      const body = await readJson(request)
      if (!body) {
        return jsonResponse({ status: "FAILED", error: "Invalid JSON body" }, 400)
      }

      const authority = buildAuthority(body)
      await saveAuthority(env, authority)
      return jsonResponse(authority)
    }

    if (pathname === "/compile" && request.method === "POST") {
      const body = await readJson(request)
      if (!body) {
        return jsonResponse({ status: "FAILED", error: "Invalid JSON body" }, 400)
      }

      const authority = buildAuthority(body)
      const aeo = buildAeo(authority)
      return jsonResponse(aeo)
    }

    if (pathname === "/validate" && request.method === "POST") {
      const body = await readJson(request)
      if (!body) {
        return jsonResponse({ status: "FAILED", error: "Invalid JSON body" }, 400)
      }

      const authority = buildAuthority(body)
      const aeo = buildAeo(authority)
      const validation = buildValidation(aeo)
      return jsonResponse(validation)
    }

    if (pathname === "/execute" && request.method === "POST") {
      const body = await readJson(request)
      if (!body) {
        return jsonResponse({ status: "FAILED", error: "Invalid JSON body" }, 400)
      }

      if (!body.decision_id) {
        return jsonResponse({ status: "FAILED", error: "Missing decision_id" }, 400)
      }

      if (!body.intent) {
        return jsonResponse({ status: "FAILED", error: "Missing intent" }, 400)
      }

      const execution = await executeWebhook(env, body.decision_id, body.intent)
      const statusCode = execution.status === "FAILED" ? 502 : 200
      return jsonResponse(execution, statusCode)
    }

    if (pathname === "/proof" && request.method === "POST") {
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
            error: "Unknown execution_id. Run /execute first so proof is tied to a real webhook execution."
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

      const proof = buildProof(body, execution)
      await saveProof(env, proof)
      return jsonResponse(proof)
    }

    if (pathname === "/browser-test" && request.method === "GET") {
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
      const step4Execution = await executeWebhook(env, step3Validation.decision_id, step3Validation.intent)

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
