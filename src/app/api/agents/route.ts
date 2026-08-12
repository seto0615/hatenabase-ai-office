import { AGENT_CARDS, roomPlan } from "@/lib/agents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    configured:
      Boolean(process.env.ANTHROPIC_API_KEY) || process.env.OFFICE_ENGINE === "claude-cli",
    engine: process.env.OFFICE_ENGINE === "claude-cli" ? "claude-cli" : "api",
    count: AGENT_CARDS.length,
    agents: AGENT_CARDS,
    islands: roomPlan(),
  });
}
