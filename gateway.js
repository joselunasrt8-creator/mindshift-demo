export async function handleRequest(request) {
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

  const decisionId = aeo?.validation?.decision_id;
  const signature = aeo?.validation?.signature;

  if (decisionId !== "MS-DEMO-001" || signature !== "demo-signature-v1") {
    return new Response("NULL — blocked", { status: 403 });
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