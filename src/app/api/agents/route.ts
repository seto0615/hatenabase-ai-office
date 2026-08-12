import { AGENT_CARDS, floorPlan } from "@/lib/agents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    configured: Boolean(process.env.ANTHROPIC_API_KEY),
    count: AGENT_CARDS.length,
    agents: AGENT_CARDS,
    floors: floorPlan(),
  });
}
