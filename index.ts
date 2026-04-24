function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json" }
  })
}

// Cloudflare Worker environment bindings.
type Env = {
  DB: D1Database
  GITHUB_TOKEN: string
}

type GithubDeployTarget = {
  system: "github_actions"
  action: "deploy"
  repo: string
  branch: string
  workflow: string
  inputs?: Record<string, string>
}

async function readJson(request: Request): Promise<any | null> {
  try {
    return await request.json()
  } catch {
    return null
  }
}

function parseJsonObject(value: unknown) {
  if (value && typeof value === "object") {
    return value as Record<string, unknown>
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value)
      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, unknown>
      }
    } catch {
      return {}
    }
  }

  return {}
}

function ensureDeployConstraints(constraints: Record<string, unknown>) {
  // Beginner-friendly guardrails: make production deploy requirements explicit.
  return {
    ...constraints,
    repo: String(constraints.repo || ""),
    branch: String(constraints.branch || ""),
    workflow: String(constraints.workflow || ""),
    max_executions: Number(constraints.max_executions ?? 1)
  }
}

function buildAuthority(body: any) {
  const constraints = ensureDeployConstraints(parseJsonObject(body.constraints))
  const scope = parseJsonObject(body.scope)

  // Keep authority objects small and explicit so the flow is easy to follow.
  return {
    authority_id: crypto.randomUUID(),
    decision_id: body.decision_id || crypto.randomUUID(),
    owner: body.owner || "unknown",
    intent: body.intent || "deploy_production",
    scope,
    constraints,
    status: "ACTIVE",
    created_at: new Date().toISOString()
  }
}

function buildAeo(authority: any, target: GithubDeployTarget) {
  // AEO contains the exact target details needed for execution on GitHub Actions.
  return {
    aeo_id: crypto.randomUUID(),
    authority_id: authority.authority_id,
    decision_id: authority.decision_id,
    intent: authority.intent,
    scope: authority.scope,
    constraints: authority.constraints,
    validation: {
      authority_id: authority.authority_id,
      decision_id: authority.decision_id,
      max_executions: authority.constraints.max_executions
    },
    target,
    finality: {
      proof_required: true
    },
    status: "COMPILED"
  }
}

function parseGithubTarget(input: any): GithubDeployTarget | null {
  if (!input || typeof input !== "object") {
    return null
  }

  if (input.system !== "github_actions" || input.action !== "deploy") {
    return null
  }

  if (!input.repo || !input.branch || !input.workflow) {
    return null
  }

  return {
    system: "github_actions",
    action: "deploy",
    repo: String(input.repo),
    branch: String(input.branch),
    workflow: String(input.workflow),
    inputs: input.inputs && typeof input.inputs === "object" ? input.inputs : undefined
  }
}

function targetFromAuthority(authority: any): GithubDeployTarget | null {
  const constraints = ensureDeployConstraints(parseJsonObject(authority.constraints))

  if (!constraints.repo || !constraints.branch || !constraints.workflow) {
    return null
  }

  return {
    system: "github_actions",
    action: "deploy",
    repo: constraints.repo,
    branch: constraints.branch,
    workflow: constraints.workflow
  }
}

function buildValidation(aeo: any) {
  // Validation marks the compiled object as valid for this controlled deploy flow.
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

async function executeGithubDeploy(env: Env, authority: any, target: GithubDeployTarget) {
  // This adapter is the governed execution boundary for production deploys.
  const executionId = crypto.randomUUID()
  const timestamp = new Date().toISOString()
  let status = "FAILED"
  let upstreamStatus: number | null = null

  const dispatchUrl = `https://api.github.com/repos/${target.repo}/actions/workflows/${target.workflow}/dispatches`

  try {
    const upstream = await fetch(dispatchUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        "X-GitHub-Api-Version": "2022-11-28"
      },
      body: JSON.stringify({
        ref: target.branch,
        inputs: {
          ...target.inputs,
          decision_id: authority.decision_id,
          authority_id: authority.authority_id
        }
      })
    })

    upstreamStatus = upstream.status
    status = upstream.ok ? "EXECUTED" : "FAILED"
  } catch {
    status = "FAILED"
  }

  const execution = {
    execution_id: executionId,
    decision_id: authority.decision_id,
    intent: authority.intent,
    webhook_url: dispatchUrl,
    upstream_status: upstreamStatus,
    status,
    timestamp,
    target,
    execution_event: {
      system: target.system,
      action: target.action,
      repo: target.repo,
      branch: target.branch,
      workflow: target.workflow
    }
  }

  await saveExecution(env, execution)
  return execution
}

function buildProof(body: any, execution: any) {
  // Proof records reference execution + GitHub run evidence.
  return {
    proof_id: crypto.randomUUID(),
    execution_id: body.execution_id,
    decision_id: body.decision_id,
    surface: body.surface || "github_actions",
    proof_reference: body.proof_reference || `github_run:${body.run_id || "unknown"}`,
    run_id: body.run_id,
    commit_sha: body.commit_sha,
    environment_url: body.environment_url || null,
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
      JSON.stringify({
        proof_reference: proof.proof_reference,
        run_id: proof.run_id,
        commit_sha: proof.commit_sha,
        environment_url: proof.environment_url
      }),
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

async function validateAuthority(env: Env, body: any) {
  const validationId = crypto.randomUUID()

  if (!body.decision_id) {
    return {
      ok: false,
      code: 400,
      payload: {
        validation_id: validationId,
        decision_id: null,
        status: "FAILED",
        result: "INVALID",
        message: "Missing decision_id. Provide the decision_id from POST /authority."
      }
    }
  }

  const authority = await findAuthorityByDecisionId(env, body.decision_id)
  if (!authority) {
    return {
      ok: false,
      code: 404,
      payload: {
        validation_id: validationId,
        decision_id: body.decision_id,
        status: "FAILED",
        result: "INVALID",
        message: "authority not found"
      }
    }
  }

  if (!isAuthorityUsableForExecution(authority.status)) {
    const message =
      String(authority.status).toUpperCase() === "CONSUMED"
        ? "authority already consumed"
        : `Authority exists, but status '${authority.status}' is not valid for execution.`

    return {
      ok: false,
      code: 409,
      payload: {
        validation_id: validationId,
        decision_id: body.decision_id,
        status: "FAILED",
        result: "INVALID",
        message
      }
    }
  }

  const validation = {
    validation_id: validationId,
    decision_id: body.decision_id,
    result: "VALID",
    status: "VALIDATED",
    message: "Authority is ACTIVE and valid for execution."
  }

  return {
    ok: true,
    code: 200,
    payload: validation,
    authority
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

      if (!authority.constraints.repo || !authority.constraints.branch || !authority.constraints.workflow) {
        return jsonResponse(
          {
            status: "FAILED",
            error: "constraints.repo, constraints.branch, and constraints.workflow are required"
          },
          400
        )
      }

      if (authority.constraints.max_executions !== 1) {
        return jsonResponse(
          {
            status: "FAILED",
            error: "constraints.max_executions must be 1 for non-bypassable production deploy flow"
          },
          400
        )
      }

      await saveAuthority(env, authority)
      return jsonResponse(authority)
    }

    if (url.pathname === "/compile" && request.method === "POST") {
      const body = await readJson(request)
      if (!body) {
        return jsonResponse({ status: "FAILED", error: "Invalid JSON body" }, 400)
      }

      if (!body.decision_id) {
        return jsonResponse({ status: "FAILED", error: "Missing decision_id" }, 400)
      }

      const authority = await findAuthorityByDecisionId(env, body.decision_id)
      if (!authority) {
        return jsonResponse(
          {
            status: "FAILED",
            error: "No authority found for decision_id. Create authority first."
          },
          404
        )
      }

      const target = targetFromAuthority(authority)
      if (!target) {
        return jsonResponse(
          {
            status: "FAILED",
            error: "Authority constraints must define repo, branch, workflow for GitHub deploy target."
          },
          409
        )
      }

      const aeo = buildAeo(authority, target)
      return jsonResponse(aeo)
    }

    if (url.pathname === "/validate" && request.method === "POST") {
      const body = await readJson(request)
      if (!body) {
        return jsonResponse({ status: "FAILED", error: "Invalid JSON body" }, 400)
      }

      const result = await validateAuthority(env, body)
      return jsonResponse(result.payload, result.code)
    }

    if (url.pathname === "/execute" && request.method === "POST") {
      const body = await readJson(request)
      if (!body) {
        return jsonResponse({ status: "FAILED", error: "Invalid JSON body" }, 400)
      }

      if (!body.intent) {
        return jsonResponse({ status: "FAILED", error: "Missing intent" }, 400)
      }

      // Critical rule: do not dispatch a production deploy unless validation passes.
      const validation = await validateAuthority(env, body)
      if (!validation.ok || !validation.authority) {
        return jsonResponse(
          {
            status: "FAILED",
            decision_id: body.decision_id || null,
            result: "NOT_EXECUTED",
            message: "execution blocked",
            validation: validation.payload
          },
          validation.code
        )
      }

      const target = targetFromAuthority(validation.authority)
      if (!target) {
        return jsonResponse(
          {
            status: "FAILED",
            decision_id: body.decision_id,
            result: "NOT_EXECUTED",
            message: "execution blocked",
            error: "Authority constraints are missing deploy target fields (repo, branch, workflow)."
          },
          409
        )
      }

      try {
        const execution = await executeGithubDeploy(env, validation.authority, target)
        if (execution.status === "EXECUTED") {
          // Replay prevention: consume authority immediately after successful dispatch.
          await consumeAuthority(env, body.decision_id)
        }

        const statusCode = execution.status === "FAILED" ? 502 : 200
        return jsonResponse(execution, statusCode)
      } catch (error: any) {
        return jsonResponse(
          {
            status: "FAILED",
            decision_id: body.decision_id,
            result: "NOT_EXECUTED",
            message: "Execution failed while dispatching GitHub workflow or writing execution record.",
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

      const required = ["execution_id", "decision_id", "surface", "run_id", "commit_sha"]
      const missing = required.filter((key) => !body[key])
      if (missing.length > 0) {
        return jsonResponse({ status: "FAILED", error: `Missing fields: ${missing.join(", ")}` }, 400)
      }

      const execution = await findExecution(env, body.execution_id)
      if (!execution) {
        return jsonResponse(
          {
            status: "FAILED",
            error: "Unknown execution_id. Run /execute first so proof is tied to a real GitHub dispatch execution."
          },
          404
        )
      }

      if (execution.status !== "EXECUTED") {
        return jsonResponse(
          {
            status: "FAILED",
            error: "Proof can only be recorded after a successful execution."
          },
          409
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

      // Keep this idempotent and explicit: consuming again is harmless and clarifies lifecycle.
      await consumeAuthority(env, body.decision_id)

      return jsonResponse(proof)
    }

    if (url.pathname === "/browser-test" && request.method === "GET") {
      const step1Authority = buildAuthority({
        owner: "browser_test",
        decision_id: `decision-${crypto.randomUUID()}`,
        intent: "deploy_production",
        scope: { mode: "demo" },
        constraints: {
          repo: "octo-org/octo-repo",
          branch: "main",
          workflow: "deploy.yml",
          max_executions: 1
        }
      })
      await saveAuthority(env, step1Authority)

      const step2Target = targetFromAuthority(step1Authority)
      const step2Aeo = buildAeo(step1Authority, step2Target as GithubDeployTarget)
      const step3Validation = buildValidation(step2Aeo)

      const step4Execution = {
        execution_id: crypto.randomUUID(),
        decision_id: step3Validation.decision_id,
        intent: step3Validation.intent,
        webhook_url: `https://api.github.com/repos/${(step2Target as GithubDeployTarget).repo}/actions/workflows/${
          (step2Target as GithubDeployTarget).workflow
        }/dispatches`,
        upstream_status: 204,
        status: "EXECUTED",
        timestamp: new Date().toISOString()
      }
      await saveExecution(env, step4Execution)

      const step5Proof = buildProof(
        {
          execution_id: step4Execution.execution_id,
          decision_id: step4Execution.decision_id,
          surface: "github_actions",
          run_id: "123456789",
          commit_sha: "abc123def456",
          environment_url: "https://prod.example.com"
        },
        step4Execution
      )
      await saveProof(env, step5Proof)
      await consumeAuthority(env, step1Authority.decision_id)

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
