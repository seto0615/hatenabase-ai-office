"use client";

import { useEffect, useRef, useState } from "react";
import type { OfficeStage } from "@/lib/three-office/runtime";
import type { AgentCard, AgentRuntime, Island, Phase } from "@/lib/types";

interface Props {
  islands: Island[];
  pm: AgentCard;
  statuses: Record<string, AgentRuntime>;
  running: boolean;
  pmStatus: string;
  phase: Phase | string;
  voice: string | null;
}

export default function Office3D({
  islands,
  pm,
  statuses,
  running,
  pmStatus,
  phase,
  voice,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<OfficeStage | null>(null);
  const [ready, setReady] = useState(false);
  const [autoCamera, setAutoCamera] = useState(true);

  // three.js の世界は React の外で一度だけ組む
  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    if (!host) return;

    (async () => {
      const { OfficeStage } = await import("@/lib/three-office/runtime");
      if (cancelled) return;
      stageRef.current = new OfficeStage(host, islands, pm);
      setReady(true);
    })();

    return () => {
      cancelled = true;
      stageRef.current?.dispose();
      stageRef.current = null;
    };
    // islands / pm はビルド時に固定される
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 状態変化を流し込む
  useEffect(() => {
    stageRef.current?.update({ statuses, running, pmStatus, phase: String(phase) });
  }, [statuses, running, pmStatus, phase, ready]);

  useEffect(() => {
    stageRef.current?.setAutoCamera(autoCamera);
  }, [autoCamera, ready]);

  return (
    <div className="office">
      <div className="officeStage" ref={hostRef} />
      {!ready && <div className="officeLoading">オフィスを開けています…</div>}

      <button
        type="button"
        className={`camBtn${autoCamera ? " is-on" : ""}`}
        onClick={() => setAutoCamera((v) => !v)}
        title={autoCamera ? "自分でカメラを動かす" : "自動カメラに戻す"}
      >
        <i className="camDot" />
        {autoCamera ? "自動カメラ" : "手動カメラ"}
      </button>

      {!autoCamera && <div className="camHint">ドラッグで回転 / ホイールで寄り引き</div>}

      {voice && (
        <div className="voiceBanner" key={voice}>
          <span className="voiceLabel">社長の声</span>
          <span className="voiceText">{voice}</span>
        </div>
      )}
    </div>
  );
}
