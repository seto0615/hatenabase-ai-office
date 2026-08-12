"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentCard } from "@/lib/types";

export type AgentStatus = "idle" | "queued" | "working" | "done" | "error";

export interface AgentRuntime {
  status: AgentStatus;
  task?: string;
  notice?: string;
  snippet?: string;
  chars: number;
  message?: string;
  /** 値が変わるたびに「席を立ってPMに届けに行く」動きが1回走る */
  walkKey?: number;
}

export interface Island {
  key: number;
  room: string;
  members: AgentCard[];
}

interface Props {
  islands: Island[];
  pm: AgentCard;
  statuses: Record<string, AgentRuntime>;
  running: boolean;
  pmStatus: string;
  /** 社長が出した最新の指示（部屋の中央に「社長の声」として出す） */
  voice: string | null;
}

/* 部屋の設計サイズ。実際の表示はコンテナ幅に合わせて拡縮する */
const STAGE_W = 980;
const STAGE_H = 600;
const PM_POS = { x: 490, y: 236 };
const ROW_Y = 300;
const ROW_H = 78;

const PRINCIPLES = ["一次情報に当たる", "推測と事実を分ける", "数字には根拠を"];

interface Seat {
  member: AgentCard;
  x: number;
  y: number;
  scale: number;
}

function seatsFor(islands: Island[]): Seat[] {
  const seats: Seat[] = [];
  islands.forEach((island, row) => {
    const count = island.members.length;
    const gap = 148 + row * 12;
    const scale = 0.78 + row * 0.07;
    island.members.forEach((member, col) => {
      seats.push({
        member,
        x: PM_POS.x + (col - (count - 1) / 2) * gap,
        y: ROW_Y + row * ROW_H,
        scale,
      });
    });
  });
  return seats;
}

export default function Office({
  islands,
  pm,
  statuses,
  running,
  pmStatus,
  voice,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(1);

  const measure = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (w > 0 && h > 0) setFit(Math.min(w / STAGE_W, h / STAGE_H));
  }, []);

  useEffect(() => {
    measure();
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  const seats = seatsFor(islands);
  const pmState = statuses[pm.id] ?? { status: "idle" as const, chars: 0 };

  return (
    <div className="office" ref={wrapRef}>
      <div
        className="stage"
        style={{
          width: STAGE_W,
          height: STAGE_H,
          transform: `translateX(-50%) scale(${fit})`,
        }}
      >
        <BackWall running={running} />

        <div className="floorPlane" />

        {islands.map((island, row) => (
          <div
            className="islandSign"
            key={island.key}
            style={{
              top: ROW_Y + row * ROW_H - 26,
              left: PM_POS.x - (148 + row * 12) * (island.members.length / 2) - 96,
            }}
          >
            {island.room}
          </div>
        ))}

        {/* PMは奥の一人席。全員の報告がここに集まる */}
        <Worker
          member={pm}
          state={pmState}
          x={PM_POS.x}
          y={PM_POS.y}
          scale={0.74}
          zIndex={10}
          fallback={running ? pmStatus : null}
          isPm
        />

        {seats.map((seat, index) => (
          <Worker
            key={seat.member.id}
            member={seat.member}
            state={statuses[seat.member.id] ?? { status: "idle", chars: 0 }}
            x={seat.x}
            y={seat.y}
            scale={seat.scale}
            zIndex={20 + index}
            walkTo={{
              dx: (PM_POS.x - seat.x) / seat.scale,
              dy: (PM_POS.y - seat.y) / seat.scale,
            }}
          />
        ))}

        {voice && (
          <div className="voiceBanner" key={voice}>
            <span className="voiceLabel">社長の声</span>
            <span className="voiceText">{voice}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function BackWall({ running }: { running: boolean }) {
  return (
    <div className="backWall">
      <div className="window">
        <div className="skyline" />
      </div>

      {PRINCIPLES.map((text, i) => (
        <div className={`scroll scroll--${i}`} key={text}>
          <span>{text}</span>
        </div>
      ))}

      <div className="signboard">
        <span className="signMark" />
        HATENABASE
        <em>AI OFFICE</em>
      </div>

      <div className={`opBoard${running ? " is-live" : ""}`}>
        <div className="opBoardHead">業務ボード</div>
        <div className="opBoardBody">
          {running ? "稼働中 — 社員が作業しています" : "全員待機中 — 指示をお待ちしています"}
        </div>
      </div>
    </div>
  );
}

function Worker({
  member,
  state,
  x,
  y,
  scale,
  zIndex,
  walkTo,
  fallback,
  isPm = false,
}: {
  member: AgentCard;
  state: AgentRuntime;
  x: number;
  y: number;
  scale: number;
  zIndex: number;
  walkTo?: { dx: number; dy: number };
  fallback?: string | null;
  isPm?: boolean;
}) {
  const line = bubbleLine(member, state, fallback);

  return (
    <div
      className={`seat is-${state.status}${isPm ? " seat--pm" : ""}`}
      style={{
        left: x,
        top: y,
        zIndex,
        ["--scale" as string]: scale,
        ["--agent" as string]: member.color,
        ["--wx" as string]: `${walkTo?.dx ?? 0}px`,
        ["--wy" as string]: `${walkTo?.dy ?? 0}px`,
      }}
      title={state.task || member.description}
    >
      {line && (
        <div className="say">
          <b>{member.person}</b>
          <span>{line}</span>
        </div>
      )}

      <div
        className={`person${state.walkKey ? " is-delivering" : ""}`}
        key={state.walkKey ?? "sit"}
      >
        <span className="head">
          <i className="hair" />
          <i className="eye eye--l" />
          <i className="eye eye--r" />
        </span>
        <span className="body">
          <i className="badge">{member.emoji}</i>
        </span>
        {state.walkKey ? <span className="carry">📄</span> : null}
      </div>

      <div className="tag">
        <b>{member.person}</b>
        <span>{member.role}</span>
      </div>

      <div className="deskUnit">
        <span className="deskTop" />
        <span className="deskEdge" />
        <span className="legL" />
        <span className="legR" />
        <span className="laptop" />
        <span className="mug" />
        <span className={`monitorGlow${state.status === "working" ? " is-on" : ""}`} />
      </div>
    </div>
  );
}

function bubbleLine(
  member: AgentCard,
  state: AgentRuntime,
  fallback?: string | null,
): string | null {
  switch (state.status) {
    case "working":
      return state.notice || state.snippet || member.greeting;
    case "queued":
      return "指示を確認しています";
    case "done":
      return member.report;
    case "error":
      return state.message || "手が止まりました";
    default:
      return fallback ?? null;
  }
}
