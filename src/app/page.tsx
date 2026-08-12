import OfficeApp from "@/components/OfficeApp";
import { AGENT_CARDS, floorPlan } from "@/lib/agents";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <OfficeApp
      floors={floorPlan()}
      agents={AGENT_CARDS}
      configured={Boolean(process.env.ANTHROPIC_API_KEY)}
    />
  );
}
