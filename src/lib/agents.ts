import { AGENTS } from "@/generated/agents";
import type { AgentCard, AgentDef } from "./types";

export const PM_ID = "pm";

export const ALL_AGENTS: AgentDef[] = AGENTS;

export const PM: AgentDef = (() => {
  const pm = AGENTS.find((a) => a.id === PM_ID);
  if (!pm) throw new Error(".agents/pm.md が見つかりません");
  return pm;
})();

/** PMを除いた実働メンバー。 */
export const STAFF: AgentDef[] = AGENTS.filter((a) => a.id !== PM_ID);

export function getAgent(id: string): AgentDef | undefined {
  return AGENTS.find((a) => a.id === id);
}

/** 画面用（システムプロンプトを落とす）。 */
export function toCard(a: AgentDef): AgentCard {
  const { prompt: _prompt, ...card } = a;
  void _prompt;
  return card;
}

export const AGENT_CARDS: AgentCard[] = AGENTS.map(toCard);

/** 階ごとにまとめたフロア構成。上の階から順に返す。 */
export function floorPlan(): { floor: number; room: string; members: AgentCard[] }[] {
  const byFloor = new Map<number, AgentCard[]>();
  for (const a of AGENT_CARDS) {
    const list = byFloor.get(a.floor) ?? [];
    list.push(a);
    byFloor.set(a.floor, list);
  }
  return [...byFloor.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([floor, members]) => ({
      floor,
      room: members[0]?.room ?? `${floor}F`,
      members,
    }));
}

/** PMが「誰に振るか」を判断するための社員名簿。 */
export function rosterForPm(): string {
  return STAFF.map(
    (a) =>
      `- ${a.id} — ${a.title}（${a.role}）: ${a.description}${
        a.tools.length ? ` [Web検索可]` : ""
      }`,
  ).join("\n");
}
