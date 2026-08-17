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

/**
 * PMの割り振り出力から社員を特定する。
 * APIモードは enum で id が保証されるが、定額モード（claude CLI）は
 * スキーマ強制が効かず「裏取 万全」「リサーチャー」等の表記で返ることがある。
 */
export function resolveAgent(name: string): AgentDef | undefined {
  const key = name.trim();
  if (!key) return undefined;
  const flat = key.replace(/[\s　]/g, "");
  return AGENTS.find(
    (a) =>
      a.id === key ||
      a.person === key ||
      a.person.replace(/[\s　]/g, "") === flat ||
      a.title === key ||
      a.title.replace(/（.+）$/, "") === key,
  );
}

/** 画面用（システムプロンプトを落とす）。 */
export function toCard(a: AgentDef): AgentCard {
  const { prompt: _prompt, ...card } = a;
  void _prompt;
  return card;
}

export const AGENT_CARDS: AgentCard[] = AGENTS.map(toCard);

/**
 * 部署ごとの島（デスクの列）。奥の列から順に返す。
 * `.agents/*.md` の `floor` が大きいほど奥に座る。PMは奥の一人席なので含めない。
 */
export function roomPlan(): { key: number; room: string; members: AgentCard[] }[] {
  const byGroup = new Map<number, AgentCard[]>();
  for (const a of AGENT_CARDS) {
    if (a.id === PM_ID) continue;
    const list = byGroup.get(a.floor) ?? [];
    list.push(a);
    byGroup.set(a.floor, list);
  }
  return [...byGroup.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([key, members]) => ({
      key,
      room: members[0]?.room ?? "オフィス",
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
