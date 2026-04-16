export default {
  async fetch(request) {
    if (request.method !== "POST") {
      return new Response("NULL — POST only", { status: 405 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response("NULL — invalid JSON", { status: 400 });
    }

    const aeo = body?.aeo;

    if (!aeo) {
      return new Response("NULL — missing AEO", { status: 403 });
    }

    const required = ["intent", "scope", "validation", "target", "finality"];
    for (const key of required) {
      if (!(key in aeo)) {
        return new Response(`NULL — missing ${key}`, { status: 403 });
      }
    }

    const decisionId = aeo?.validation?.decision_id;
    const signature = aeo?.validation?.signature;

    if (decisionId !== "MS-DEMO-001" || signature !== "demo-signature-v1") {
      return new Response("NULL — blocked", { status: 403 });
    }

    if (aeo.intent !== "send_webhook") {
      return new Response("NULL — invalid intent", { status: 403 });
    }

    if (aeo.target?.system !== "webhook") {
      return new Response("NULL — invalid target system", { status: 403 });
    }

    const webhookUrl = aeo.target?.url;
    if (!webhookUrl) {
      return new Response("NULL — missing webhook url", { status: 403 });
    }

    const outboundPayload = {
      decision_id: decisionId,
      event: aeo.scope?.event || "mindshift.test",
      message: "Governed execution occurred"
    };

    let upstream;
    try {
      upstream = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(outboundPayload)
      });
    } catch {
      return new Response("NULL — conduit failed", { status: 502 });
    }

    return new Response(
      JSON.stringify({
        system: "mindshift",
        status: "VALID",
        message: "WEBHOOK SENT",
        proof: {
          upstream_status: upstream.status
        }
      }),
      {
        headers: { "Content-Type": "application/json" }
      }
    );
  }
};