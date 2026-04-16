export async function handleRequest(request) {
  const decisionId = request.headers.get("x-decision-id");
  const signature = request.headers.get("x-signature");

  if (decisionId !== "MS-DEMO-001" || signature !== "demo-signature-v1") {
    return new Response("NULL — blocked", { status: 403 });
  }

  return new Response(
    JSON.stringify({
      system: "mindshift",
      status: "VALID",
      message: "Cloudflare Worker deployed from governed pipeline"
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}