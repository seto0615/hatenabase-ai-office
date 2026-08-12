"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Office3D from "./Office3D";
import StaffRail from "./StaffRail";
import PhaseBar from "./PhaseBar";
import ChatPanel from "./ChatPanel";
import Ticker, { type TickerItem } from "./Ticker";
import ArtifactPanel from "./ArtifactPanel";
import { demoScript } from "@/lib/demo";
import type {
  AgentCard,
  AgentRuntime,
  Artifact,
  ChatMessage,
  Island,
  Phase,
  Plan,
  ServerEvent,
  UsageTotals,
} from "@/lib/types";

interface Props {
  islands: Island[];
  agents: AgentCard[];
  pm: AgentCard;
  configured: boolean;
  engine: "api" | "claude-cli";
}

export default function OfficeApp({ islands, agents, pm, configured, engine }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [statuses, setStatuses] = useState<Record<string, AgentRuntime>>({});
  const [ticker, setTicker] = useState<TickerItem[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [pmDraft, setPmDraft] = useState("");
  const [pmStatus, setPmStatus] = useState("指示をお待ちしています");
  const [phase, setPhase] = useState<Phase>("idle");
  const [voice, setVoice] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demo, setDemo] = useState(false);
  /** 直近の実行の消費と、セッション累計（勘定 合の帳簿） */
  const [lastUsage, setLastUsage] = useState<UsageTotals | null>(null);
  const [sessionUsd, setSessionUsd] = useState(0);
  /** 風景を見たいときにパネルをたたむ */
  const [panelsHidden, setPanelsHidden] = useState(false);

  const agentBuf = useRef<Record<string, string>>({});
  const pmBuf = useRef("");
  const dirty = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const voiceTimer = useRef<number | null>(null);

  useEffect(() => {
    setDemo(new URLSearchParams(window.location.search).has("demo"));
  }, []);

  useEffect(
    () => () => {
      if (voiceTimer.current) window.clearTimeout(voiceTimer.current);
    },
    [],
  );

  const staff = useMemo(() => agents.filter((a) => a.id !== pm.id), [agents, pm.id]);

  const byId = useMemo(() => {
    const map: Record<string, AgentCard> = {};
    for (const a of agents) map[a.id] = a;
    return map;
  }, [agents]);

  const pushTicker = useCallback(
    (agentId: string, text: string, tone: TickerItem["tone"]) => {
      const card = byId[agentId];
      // キーは直前の状態から導出する。ref だと再入で重複することがある
      setTicker((prev) => [
        ...prev.slice(-59),
        {
          key: (prev[prev.length - 1]?.key ?? 0) + 1,
          emoji: card?.emoji ?? "•",
          color: card?.color ?? "#8a7c6a",
          who: card?.person ?? agentId,
          text,
          tone,
        },
      ]);
    },
    [byId],
  );

  /* 差分は ref に溜めて一定間隔で描画する（1文字ごとの再描画を避ける） */
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      if (!dirty.current) return;
      dirty.current = false;
      setPmDraft(pmBuf.current);
      setStatuses((prev) => {
        const next = { ...prev };
        for (const [agentId, buffer] of Object.entries(agentBuf.current)) {
          const current = next[agentId];
          if (!current || current.status !== "working") continue;
          next[agentId] = { ...current, snippet: tail(buffer), chars: buffer.length };
        }
        return next;
      });
    }, 140);
    return () => window.clearInterval(id);
  }, [running]);

  const handleEvent = useCallback(
    (event: ServerEvent) => {
      switch (event.t) {
        case "start":
          setPhase("受領");
          break;

        case "pm_status":
          setPmStatus(event.text);
          pushTicker("pm", event.text, "info");
          if (event.text.includes("引き継")) setPhase("反証・校閲");
          else if (event.text.includes("まとめ")) setPhase("報告");
          break;

        case "plan":
          setPhase("分解");
          setPlan(event.plan);
          setStatuses((prev) => {
            const next = { ...prev };
            for (const task of event.plan.tasks) {
              next[task.agent] = { status: "queued", task: task.task, chars: 0 };
            }
            return next;
          });
          if (event.plan.tasks.length === 0) {
            pushTicker("pm", "社員は動かさず、自分で回答します", "info");
            setPhase("報告");
          }
          break;

        case "agent_start":
          setPhase((p) => (p === "反証・校閲" ? p : "実行"));
          setStatuses((prev) => ({
            ...prev,
            [event.id]: { status: "working", task: event.task, chars: 0 },
          }));
          pushTicker(event.id, `着手: ${shorten(event.task, 60)}`, "work");
          break;

        case "agent_notice":
          setStatuses((prev) => ({
            ...prev,
            [event.id]: {
              ...(prev[event.id] ?? { status: "working", chars: 0 }),
              notice: event.text,
            },
          }));
          pushTicker(event.id, event.text, "work");
          break;

        case "agent_delta":
          agentBuf.current[event.id] = (agentBuf.current[event.id] ?? "") + event.text;
          dirty.current = true;
          break;

        case "agent_done":
          setStatuses((prev) => ({
            ...prev,
            [event.id]: {
              ...(prev[event.id] ?? { status: "done", chars: 0 }),
              status: "done",
              chars: event.chars,
              notice: undefined,
              snippet: undefined,
              walkKey: Date.now(),
            },
          }));
          pushTicker(event.id, `報告を提出（${event.chars.toLocaleString()}字）`, "done");
          break;

        case "agent_error":
          setStatuses((prev) => ({
            ...prev,
            [event.id]: {
              ...(prev[event.id] ?? { status: "error", chars: 0 }),
              status: "error",
              message: event.message,
            },
          }));
          pushTicker(event.id, event.message, "error");
          break;

        case "pm_delta":
          pmBuf.current += event.text;
          dirty.current = true;
          break;

        case "artifacts":
          setArtifacts(event.items);
          pushTicker("pm", `成果物 ${event.items.length}件を受け取りました`, "done");
          break;

        case "usage": {
          const u = event.totals;
          setLastUsage(u);
          setSessionUsd((prev) => prev + u.usd);
          pushTicker(
            "accountant",
            u.usd > 0
              ? `経費精算: 入力${formatTokens(u.inputTokens)} + 出力${formatTokens(u.outputTokens)} = 約$${u.usd.toFixed(2)}`
              : `経費精算: 入力${formatTokens(u.inputTokens)} + 出力${formatTokens(u.outputTokens)}（定額内）`,
            "info",
          );
          break;
        }

        case "done":
          setPhase("完了");
          break;

        case "error":
          setError(event.message);
          pushTicker("pm", event.message, "error");
          break;
      }
    },
    [pushTicker],
  );

  const submit = useCallback(
    async (text: string) => {
      if (running) return;

      const history = messages;
      setMessages([...history, { role: "user", content: text }]);
      setError(null);
      setPlan(null);
      setArtifacts([]);
      setPmDraft("");
      setPmStatus("指示を読んでいます");
      setPhase("受領");
      setStatuses({});
      agentBuf.current = {};
      pmBuf.current = "";
      dirty.current = false;
      setRunning(true);

      setVoice(text);
      if (voiceTimer.current) window.clearTimeout(voiceTimer.current);
      voiceTimer.current = window.setTimeout(() => setVoice(null), 8000);

      pushTicker("pm", "社長から指示を受け取りました", "info");

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        if (demo) {
          await playDemo(handleEvent, controller.signal);
          return;
        }

        const res = await fetch("/api/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text, history }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          const detail = await res.json().catch(() => null);
          throw new Error(detail?.error ?? `サーバーエラー (${res.status})`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const chunks = buffer.split("\n\n");
          buffer = chunks.pop() ?? "";
          for (const chunk of chunks) {
            const line = chunk.trim();
            if (!line.startsWith("data:")) continue;
            try {
              handleEvent(JSON.parse(line.slice(5).trim()) as ServerEvent);
            } catch {
              /* 壊れた行は無視する */
            }
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          pushTicker("pm", "社長の指示で中断しました", "error");
        } else {
          const message = err instanceof Error ? err.message : String(err);
          setError(message);
          pushTicker("pm", message, "error");
        }
      } finally {
        abortRef.current = null;
        const finalText = pmBuf.current.trim();
        setPmDraft("");
        if (finalText) {
          setMessages((prev) => [...prev, { role: "assistant", content: finalText }]);
        }
        setStatuses((prev) => {
          const next = { ...prev };
          for (const [id, state] of Object.entries(next)) {
            if (state.status === "working" || state.status === "queued") {
              next[id] = { ...state, status: "done", notice: undefined, snippet: undefined };
            }
          }
          return next;
        });
        setPmStatus("指示をお待ちしています");
        setPhase("完了");
        setRunning(false);
      }
    },
    [demo, handleEvent, messages, pushTicker, running],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const busyCount = Object.values(statuses).filter(
    (s) => s.status === "working" || s.status === "queued",
  ).length;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brandMark" />
          <div>
            <div className="brandName">はてなベース AI OFFICE</div>
          </div>
        </div>

        <PhaseBar phase={phase} />

        <div className="topMeta">
          <span className={`pill${running ? " pill--live" : ""}`}>
            {running ? (busyCount > 0 ? `稼働中 ${busyCount}名` : "PM対応中") : "待機中"}
          </span>
          {engine === "claude-cli" ? (
            <span className="pill pill--flat">定額モード</span>
          ) : (
            lastUsage && (
              <span
                className="pill pill--cost"
                title={`直近の実行: API呼び出し${lastUsage.calls}回 / 入力${lastUsage.inputTokens.toLocaleString()}tk / 出力${lastUsage.outputTokens.toLocaleString()}tk`}
              >
                今回 ${lastUsage.usd.toFixed(2)}・累計 ${sessionUsd.toFixed(2)}
              </span>
            )
          )}
          {demo && <span className="pill pill--muted">デモ</span>}
          {!configured && !demo && <span className="pill pill--warn">APIキー未設定</span>}
          <button
            type="button"
            className="pill pill--btn"
            onClick={() => setPanelsHidden((v) => !v)}
          >
            {panelsHidden ? "パネルを出す" : "風景だけ見る"}
          </button>
        </div>
      </header>

      <div className="world">
        <Office3D
          islands={islands}
          pm={pm}
          statuses={statuses}
          running={running}
          pmStatus={pmStatus}
          phase={phase === "idle" ? "待機中" : phase}
          voice={voice}
        />

        {!panelsHidden && (
          <>
            <aside className="float float--staff">
              <StaffRail staff={staff} statuses={statuses} />
            </aside>

            <aside className="float float--ticker">
              <Ticker items={ticker} />
            </aside>

            <aside className="float float--monitor">
              <div className="monitorHead">
                成果物モニター
                {artifacts.length > 0 && <span className="monitorCount">{artifacts.length}</span>}
              </div>
              <div className="monitorBody">
                <ArtifactPanel items={artifacts} />
              </div>
            </aside>

            <aside className="float float--chat">
              <div className="chatHead">社長の間</div>
              <ChatPanel
                messages={messages}
                pmDraft={pmDraft}
                plan={plan}
                running={running}
                error={error}
                onSubmit={submit}
                onStop={stop}
              />
            </aside>
          </>
        )}
      </div>
    </div>
  );
}

/** APIを叩かずに台本どおりイベントを流す。 */
async function playDemo(
  handle: (event: ServerEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const steps = demoScript();
  const started = performance.now();
  for (const step of steps) {
    const wait = step.after - (performance.now() - started);
    if (wait > 0) await sleep(wait, signal);
    if (signal.aborted) throw abortError();
    handle(step.event);
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      window.clearTimeout(timer);
      reject(abortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function abortError(): Error {
  const err = new Error("aborted");
  err.name = "AbortError";
  return err;
}

function formatTokens(n: number): string {
  if (n >= 10000) return `${Math.round(n / 1000).toLocaleString()}千tk`;
  return `${n.toLocaleString()}tk`;
}

function tail(buffer: string): string {
  const lines = buffer
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const last = lines[lines.length - 1] ?? "";
  const clean = last
    .replace(/^[#>\-*|\d.\s]+/, "")
    .replace(/[*`|]/g, "")
    .trim();
  if (!clean) return "書いています…";
  return clean.length > 38 ? `${clean.slice(0, 38)}…` : clean;
}

function shorten(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}
