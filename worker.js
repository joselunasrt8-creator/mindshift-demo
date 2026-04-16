export default {
  async fetch(request, env) {
    const decisionId = request.headers.get("x-decision-id");
    const signature = request.headers.get("x-signature");

    if (!decisionId || !signature) {
      return new Response("NULL — missing authority", { status: 403 });
    }

    const aeo = {
      intent: "hello_world",
      scope: {
        path: new URL(request.url).pathname,
        method: request.method
      },
      validation: {
        decision_id: decisionId,
        signature: signature
      },
      target: {
        system: "cloudflare_worker",
        action: "respond"
      },
      finality: {
        proof_required: false
      }
    };

    const validateResponse = await fetch(`${env.VALIDATOR_URL}/validate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(aeo)
    });

    if (!validateResponse.ok) {
      return new Response("NULL — validator unreachable", { status: 403 });
    }

    const verdict = await validateResponse.json();

    if (verdict.verdict !== "VALID") {
      return new Response("NULL — execution not allowed", { status: 403 });
    }

    return new Response("Hello World!", { status: 200 });
  }
};