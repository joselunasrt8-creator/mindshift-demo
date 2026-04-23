function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json" }
  })
}

const EXECUTION_WEBHOOK_URL = "https://webhook.site/7957d61a-a8bf-4738-a5e6-e8c25a881642"

// Beginner-friendly in-memory execution log.
// This lets /proof verify that an execution_id came from a real /execute webhook call.
const executionRecords = new Map<
  string,
  {
    execution_id: string
    status: string
    webhook_url: string
    upstream_status: number | null
    timestamp: string
    decision_id: string
    intent: string
  }
>()

async function readJson(request: Request): Promise<any | null> {
  try {
    return await request.json()
  } catch {
    return null
  }
}

function buildAuthority(body: any) {
  return {
    authority_id: crypto.randomUUID(),
    decision_id: body.decision_id || crypto.randomUUID(),
    owner: body.owner || "unknown",
    intent: body.intent || "unspecified",
    scope: body.scope || {},
    constraints: body.constraints || {},
    status: "AUTHORIZED"
  }
}

function buildAeo(authority: any) {
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

async function executeWebhook(decisionId: string, intent: string) {
  const executionId = crypto.randomUUID()
  const timestamp = new Date().toISOString()

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

    const execution = {
      execution_id: executionId,
      status: upstream.ok ? "EXECUTED" : "FAILED",
      webhook_url: EXECUTION_WEBHOOK_URL,
      upstream_status: upstream.status,
      timestamp,
      decision_id: decisionId,
      intent
    }

    executionRecords.set(executionId, execution)
    return execution
  } catch (error: any) {
    const execution = {
      execution_id: executionId,
      status: "FAILED",
      webhook_url: EXECUTION_WEBHOOK_URL,
      upstream_status: null,
      timestamp,
      decision_id: decisionId,
      intent
    }

    executionRecords.set(executionId, execution)
    return {
      ...execution,
      error: error?.message || "Webhook request failed"
    }
  }
}

function buildProof(body: any, execution: any) {
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

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === "/") {
      return new Response("MindShift Runtime Live")
    }

    if (url.pathname === "/authority" && request.method === "POST") {
      const body = await readJson(request)
      if (!body) {
        return jsonResponse({ status: "FAILED", error: "Invalid JSON body" }, 400)
      }

      const authority = buildAuthority(body)
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

      const authority = buildAuthority(body)
      const aeo = buildAeo(authority)
      const validation = buildValidation(aeo)
      return jsonResponse(validation)
    }

    if (url.pathname === "/execute" && request.method === "POST") {
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

      const execution = await executeWebhook(body.decision_id, body.intent)
      const statusCode = execution.status === "FAILED" ? 502 : 200
      return jsonResponse(execution, statusCode)
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

      const execution = executionRecords.get(body.execution_id)
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
      return jsonResponse(proof)
    }

    if (url.pathname === "/browser-test" && request.method === "GET") {
      const step1Authority = buildAuthority({
        owner: "browser_test",
        decision_id: `decision-${crypto.randomUUID()}`,
        intent: "demo_run",
        scope: { mode: "demo" },
        constraints: { safe: true }
      })

      const step2Aeo = buildAeo(step1Authority)
      const step3Validation = buildValidation(step2Aeo)
      const step4Execution = await executeWebhook(step3Validation.decision_id, step3Validation.intent)

      const step5Proof = buildProof(
        {
          execution_id: step4Execution.execution_id,
          decision_id: step4Execution.decision_id,
          surface: "webhook",
          proof_reference: `${step4Execution.webhook_url}#${step4Execution.execution_id}`
        },
        step4Execution
      )

      return jsonResponse({
        step_1_authority: step1Authority,
        step_2_aeo: step2Aeo,
        step_3_validation: step3Validation,
        step_4_execution: step4Execution,
        step_5_proof: step5Proof
      })
    }

    return new Response("Not Found", { status: 404 })
  }
}
