import OfficeApp from "@/components/OfficeApp";
import { AGENT_CARDS, PM, roomPlan, toCard } from "@/lib/agents";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <OfficeApp
      islands={roomPlan()}
      agents={AGENT_CARDS}
      pm={toCard(PM)}
      configured={Boolean(process.env.ANTHROPIC_API_KEY)}
    />
  );
}
