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

    if (aeo.validation.decision_id !== "MS-DEMO-001") {
      return new Response("NULL — invalid decision", { status: 403 });
    }

    if (aeo.validation.signature !== "demo-signature-v1") {
      return new Response("NULL — invalid signature", { status: 403 });
    }

    if (aeo.intent !== "hello_world") {
      return new Response("NULL — invalid intent", { status: 403 });
    }

    if (aeo.target.system !== "cloudflare_worker") {
      return new Response("NULL — invalid target", { status: 403 });
    }

    return new Response(
      JSON.stringify({
        system: "mindshift",
        status: "VALID",
        message: "AEO ACCEPTED"
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  }
};