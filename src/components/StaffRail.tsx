"use client";

import type { AgentCard, AgentRuntime, AgentStatus } from "@/lib/types";

const LABEL: Record<AgentStatus, string> = {
  idle: "待機",
  queued: "着席",
  working: "作業中",
  done: "報告済",
  error: "停止",
};

const ORDER: Record<AgentStatus, number> = {
  working: 0,
  queued: 1,
  error: 2,
  done: 3,
  idle: 4,
};

export default function StaffRail({
  staff,
  statuses,
}: {
  staff: AgentCard[];
  statuses: Record<string, AgentRuntime>;
}) {
  const rows = [...staff].sort((a, b) => {
    const sa = statuses[a.id]?.status ?? "idle";
    const sb = statuses[b.id]?.status ?? "idle";
    if (ORDER[sa] !== ORDER[sb]) return ORDER[sa] - ORDER[sb];
    return b.floor - a.floor;
  });

  return (
    <div className="rail">
      <div className="railHead">社員 {staff.length}名</div>
      <div className="railBody">
        {rows.map((member) => {
          const state = statuses[member.id] ?? { status: "idle" as const, chars: 0 };
          return (
            <div
              className={`railRow is-${state.status}`}
              key={member.id}
              style={{ ["--agent" as string]: member.color }}
              title={state.task || member.description}
            >
              <i className="railDot" />
              <span className="railName">
                <b>{member.person}</b>
                <em>{member.role}</em>
              </span>
              <span className="railState">
                {LABEL[state.status]}
                {state.chars > 0 && state.status !== "idle"
                  ? ` ${state.chars.toLocaleString()}字`
                  : ""}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
