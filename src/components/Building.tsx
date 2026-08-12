"use client";

import type { AgentCard } from "@/lib/types";

export type AgentStatus = "idle" | "queued" | "working" | "done" | "error";

export interface AgentRuntime {
  status: AgentStatus;
  task?: string;
  notice?: string;
  snippet?: string;
  chars: number;
  message?: string;
  /** 値が変わるたびに「席を立って報告に行く」アニメーションが1回走る */
  walkKey?: number;
}

export interface FloorGroup {
  floor: number;
  room: string;
  members: AgentCard[];
}

/** 書類がフロア間を移動している最中を表す。 */
export interface Delivery {
  key: number;
  from: number;
  to: number;
  color: string;
}

interface Props {
  floors: FloorGroup[];
  statuses: Record<string, AgentRuntime>;
  running: boolean;
  pmStatus: string;
  deliveries: Delivery[];
  roofFloor: number;
}

const STATUS_LABEL: Record<AgentStatus, string> = {
  idle: "待機",
  queued: "着席",
  working: "作業中",
  done: "報告済",
  error: "停止",
};

/** シャフトを1フロア上がるのにかける秒数 */
const HOP_SECONDS = 0.34;

export default function Building({
  floors,
  statuses,
  running,
  pmStatus,
  deliveries,
  roofFloor,
}: Props) {
  return (
    <div className={`building${running ? " is-live" : ""}`}>
      <div className="roof">
        <Mosaic />
        <div className="roofName">HATENABASE AI OFFICE</div>
      </div>

      <div className="floor floor--exec">
        <div className="floorTag">
          <span className="floorNum">RF</span>
          <span className="floorRoom">社長室</span>
        </div>
        <div className="desks">
          <div className={`desk desk--boss${running ? " is-watching" : ""}`}>
            <div className="bubble bubble--boss">{running ? pmStatus : "指示をどうぞ"}</div>
            <div className="avatar avatar--boss">
              <span className="avatarFace">🧑‍💼</span>
            </div>
            <div className="deskSurface" />
            <div className="nameplate">
              <b>世戸口</b>
              <span>社長</span>
            </div>
          </div>
        </div>
        <Shaft floor={roofFloor} deliveries={deliveries} top />
      </div>

      {floors.map((group) => {
        const busy = group.members.some((m) => statuses[m.id]?.status === "working");
        return (
          <div className={`floor${busy ? " is-busy" : ""}`} key={group.floor}>
            <div className="floorTag">
              <span className="floorNum">{group.floor}F</span>
              <span className="floorRoom">{group.room}</span>
            </div>
            <div className="desks">
              {group.members.map((member, index) => {
                const state = statuses[member.id] ?? { status: "idle" as const, chars: 0 };
                return <Desk key={member.id} member={member} state={state} index={index} />;
              })}
            </div>
            <Shaft floor={group.floor} deliveries={deliveries} />
          </div>
        );
      })}

      <div className="lobby">
        <span className="lobbyDoor" />
        <span className="lobbyText">ENTRANCE</span>
        <span className="lobbyDoor" />
      </div>
    </div>
  );
}

/** 各フロア右端の書類シャフト。通過中の書類だけを描く。 */
function Shaft({
  floor,
  deliveries,
  top = false,
}: {
  floor: number;
  deliveries: Delivery[];
  top?: boolean;
}) {
  const passing = deliveries.filter((d) => floor >= d.from && floor <= d.to);
  return (
    <div className={`shaft${top ? " shaft--top" : ""}`}>
      <span className="shaftRail" />
      {passing.map((d) => (
        <span
          key={d.key}
          className="parcel"
          style={{
            ["--delay" as string]: `${(floor - d.from) * HOP_SECONDS}s`,
            ["--hop" as string]: `${HOP_SECONDS}s`,
            ["--agent" as string]: d.color,
          }}
        >
          📄
        </span>
      ))}
    </div>
  );
}

function Desk({
  member,
  state,
  index,
}: {
  member: AgentCard;
  state: AgentRuntime;
  index: number;
}) {
  const bubble =
    state.status === "working"
      ? state.notice || state.snippet || "取りかかっています…"
      : state.status === "error"
        ? state.message || "エラー"
        : state.status === "queued"
          ? "指示待ち"
          : null;

  return (
    <div
      className={`desk is-${state.status}`}
      style={{ ["--agent" as string]: member.color, ["--i" as string]: index }}
      title={state.task || member.description}
    >
      {bubble && <div className="bubble">{bubble}</div>}

      <div className="avatar">
        <span className="avatarFace">{member.emoji}</span>
        {state.status === "working" && (
          <span className="typing">
            <i />
            <i />
            <i />
          </span>
        )}
      </div>

      <div className="deskSurface">
        <span className="paper" />
        <span className="paper paper--b" />
        <span className="lamp" />
      </div>

      <div className="nameplate">
        <b>{member.title}</b>
        <span>{member.role}</span>
      </div>

      <div className="statusChip">
        <i className="dot" />
        {STATUS_LABEL[state.status]}
        {state.chars > 0 && state.status !== "idle" ? ` ${state.chars.toLocaleString()}字` : ""}
      </div>

      {state.walkKey ? (
        <span key={state.walkKey} className="walker" aria-hidden="true">
          <i className="walkerBody">{member.emoji}</i>
          <i className="walkerDoc">📄</i>
        </span>
      ) : null}
    </div>
  );
}

/** 名刺由来の幾何学モザイク。屋上のパラペットに敷く。 */
function Mosaic() {
  return (
    <svg className="mosaic" viewBox="0 0 240 24" preserveAspectRatio="none" aria-hidden="true">
      {Array.from({ length: 24 }).map((_, i) => {
        const x = i * 10;
        const up = i % 3 === 0;
        const shade = ["#12365C", "#1B4A79", "#0D2C4C", "#255C90"][i % 4];
        return (
          <polygon
            key={i}
            fill={shade}
            points={up ? `${x},24 ${x + 5},0 ${x + 10},24` : `${x},0 ${x + 10},0 ${x + 5},24`}
          />
        );
      })}
    </svg>
  );
}
