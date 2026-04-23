function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json" }
  })
}

const EXECUTION_WEBHOOK_URL = "https://webhook.site/7957d61a-a8bf-4738-a5e6-e8c25a881642"

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
        decision_id: decisionId,
        intent,
        timestamp,
        source: "mindshift-demo"
      })
    })

    return {
      execution_id: executionId,
      status: upstream.ok ? "EXECUTED" : "FAILED",
      webhook_url: EXECUTION_WEBHOOK_URL,
      upstream_status: upstream.status
    }
  } catch (error: any) {
    return {
      execution_id: executionId,
      status: "FAILED",
      webhook_url: EXECUTION_WEBHOOK_URL,
      upstream_status: null,
      error: error?.message || "Webhook request failed"
    }
  }
}

function buildProof(execution: any) {
  return {
    proof_id: crypto.randomUUID(),
    execution_id: execution.execution_id,
    status: execution.status === "EXECUTED" ? "RECORDED" : "SKIPPED"
  }
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    // Root
    if (url.pathname === "/") {
      return new Response("MindShift Runtime Live")
    }

    // AUTHORITY
    if (url.pathname === "/authority" && request.method === "POST") {
      const body = await readJson(request)
      if (!body) {
        return jsonResponse({ status: "FAILED", error: "Invalid JSON body" }, 400)
      }

      const authority = buildAuthority(body)
      return jsonResponse(authority)
    }

    // COMPILE
    if (url.pathname === "/compile" && request.method === "POST") {
      const body = await readJson(request)
      if (!body) {
        return jsonResponse({ status: "FAILED", error: "Invalid JSON body" }, 400)
      }

      const authority = buildAuthority(body)
      const aeo = buildAeo(authority)
      return jsonResponse(aeo)
    }

    // VALIDATE
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

    // EXECUTE (real webhook execution)
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

    // PROOF
    if (url.pathname === "/proof" && request.method === "POST") {
      const body = await readJson(request)
      if (!body) {
        return jsonResponse({ status: "FAILED", error: "Invalid JSON body" }, 400)
      }

      const execution = {
        execution_id: body.execution_id || crypto.randomUUID(),
        status: body.status || "EXECUTED"
      }

      const proof = buildProof(execution)
      return jsonResponse(proof)
    }

    // Browser end-to-end demo route
    if (url.pathname === "/browser-test" && request.method === "GET") {
      const authority = buildAuthority({
        owner: "browser_test",
        intent: "demo_run",
        scope: { mode: "demo" },
        constraints: { safe: true }
      })

      const aeo = buildAeo(authority)
      const validation = buildValidation(aeo)

      const execution = await executeWebhook(authority.decision_id, authority.intent)
      const proof = buildProof(execution)

      return jsonResponse({
        authority,
        aeo,
        validation,
        execution,
        proof
      })
    }

    return new Response("Not Found", { status: 404 })
  }
}
