// Uptime check target (plan §17 Observability). Reports process liveness only; no dependency checks yet (DB arrives in L2).
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
}
