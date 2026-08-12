"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Building, { type AgentRuntime, type Delivery, type FloorGroup } from "./Building";
import ChatPanel from "./ChatPanel";
import Ticker, { type TickerItem } from "./Ticker";
import ArtifactPanel from "./ArtifactPanel";
import { demoScript } from "@/lib/demo";
import type { AgentCard, Artifact, ChatMessage, Plan, ServerEvent } from "@/lib/types";

interface Props {
  floors: FloorGroup[];
  agents: AgentCard[];
  configured: boolean;
}

export default function OfficeApp({ floors, agents, configured }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [statuses, setStatuses] = useState<Record<string, AgentRuntime>>({});
  const [ticker, setTicker] = useState<TickerItem[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [pmDraft, setPmDraft] = useState("");
  const [pmStatus, setPmStatus] = useState("待機中");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"chat" | "artifacts">("chat");
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [demo, setDemo] = useState(false);

  // ?demo=1 でAPIを使わずに台本を再生する（社内デモ・撮影用）
  useEffect(() => {
    setDemo(new URLSearchParams(window.location.search).has("demo"));
  }, []);

  const agentBuf = useRef<Record<string, string>>({});
  const deliveryKey = useRef(0);
  const timers = useRef<number[]>([]);
  const pmBuf = useRef("");
  const dirty = useRef(false);
  const tickerKey = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const byId = useMemo(() => {
    const map: Record<string, AgentCard> = {};
    for (const a of agents) map[a.id] = a;
    return map;
  }, [agents]);

  const pmFloor = useMemo(() => byId["pm"]?.floor ?? 5, [byId]);
  const roofFloor = useMemo(
    () => floors.reduce((max, f) => Math.max(max, f.floor), 0) + 1,
    [floors],
  );

  /** 書類がシャフトを上がっていく演出を1本流す */
  const sendDelivery = useCallback((from: number, to: number, color: string) => {
    if (to <= from) return;
    deliveryKey.current += 1;
    const item: Delivery = { key: deliveryKey.current, from, to, color };
    setDeliveries((prev) => [...prev, item]);
    const life = (to - from + 1) * 380 + 700;
    const timer = window.setTimeout(() => {
      setDeliveries((prev) => prev.filter((d) => d.key !== item.key));
    }, life);
    timers.current.push(timer);
  }, []);

  useEffect(
    () => () => {
      for (const t of timers.current) window.clearTimeout(t);
    },
    [],
  );

  const pushTicker = useCallback(
    (agentId: string, text: string, tone: TickerItem["tone"]) => {
      const card = byId[agentId];
      tickerKey.current += 1;
      const item: TickerItem = {
        key: tickerKey.current,
        emoji: card?.emoji ?? "•",
        color: card?.color ?? "#8FA6C0",
        who: card?.title ?? agentId,
        text,
        tone,
      };
      setTicker((prev) => [...prev.slice(-59), item]);
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
          break;

        case "pm_status":
          setPmStatus(event.text);
          pushTicker("pm", event.text, "info");
          // PMが統合フェーズに入ったら、PM室から社長室へ報告を上げる
          if (event.text.includes("まとめ")) {
            sendDelivery(pmFloor, roofFloor, "#f2a65a");
          }
          break;

        case "plan":
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
          }
          break;

        case "agent_start":
          setStatuses((prev) => ({
            ...prev,
            [event.id]: { status: "working", task: event.task, chars: 0 },
          }));
          pushTicker(event.id, `着手: ${shorten(event.task, 70)}`, "work");
          break;

        case "agent_notice":
          setStatuses((prev) => ({
            ...prev,
            [event.id]: { ...(prev[event.id] ?? { status: "working", chars: 0 }), notice: event.text },
          }));
          pushTicker(event.id, event.text, "work");
          break;

        case "agent_delta":
          agentBuf.current[event.id] = (agentBuf.current[event.id] ?? "") + event.text;
          dirty.current = true;
          break;

        case "agent_done": {
          const card = byId[event.id];
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
          if (card) sendDelivery(card.floor, pmFloor, card.color);
          break;
        }

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
          setTab("artifacts");
          pushTicker("pm", `成果物 ${event.items.length}件を受け取りました`, "done");
          break;

        case "done":
          break;

        case "error":
          setError(event.message);
          pushTicker("pm", event.message, "error");
          break;
      }
    },
    [byId, pmFloor, pushTicker, roofFloor, sendDelivery],
  );

  const submit = useCallback(
    async (text: string) => {
      if (running) return;

      const history = messages;
      setMessages([...history, { role: "user", content: text }]);
      setError(null);
      setPlan(null);
      setArtifacts([]);
      setTab("chat");
      setPmDraft("");
      setPmStatus("指示を読んでいます");
      setStatuses({});
      setDeliveries([]);
      agentBuf.current = {};
      pmBuf.current = "";
      dirty.current = false;
      setRunning(true);
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
        setPmStatus("待機中");
        setRunning(false);
      }
    },
    [demo, handleEvent, messages, pushTicker, running],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

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
            <div className="brandSub">社長 → PM → AI社員 {agents.length - 1}名</div>
          </div>
        </div>
        <div className="topMeta">
          <span className={`pill${running ? " pill--live" : ""}`}>
            {running ? (busyCount > 0 ? `稼働中 ${busyCount}名` : "PMが対応中") : "全員待機中"}
          </span>
          {demo && <span className="pill pill--muted">デモ再生モード</span>}
          {!configured && !demo && <span className="pill pill--warn">APIキー未設定</span>}
          <span className="pill pill--muted">Claude Fable 5</span>
        </div>
      </header>

      <div className="stage">
        <section className="officeCol">
          <Building
            floors={floors}
            statuses={statuses}
            running={running}
            pmStatus={pmStatus}
            deliveries={deliveries}
            roofFloor={roofFloor}
          />
          <Ticker items={ticker} />
        </section>

        <aside className="sideCol">
          <div className="tabs">
            <button
              type="button"
              className={`tab${tab === "chat" ? " is-active" : ""}`}
              onClick={() => setTab("chat")}
            >
              社長室
            </button>
            <button
              type="button"
              className={`tab${tab === "artifacts" ? " is-active" : ""}`}
              onClick={() => setTab("artifacts")}
            >
              成果物
              {artifacts.length > 0 && <span className="tabBadge">{artifacts.length}</span>}
            </button>
          </div>

          <div className="panel">
            {tab === "chat" ? (
              <ChatPanel
                messages={messages}
                pmDraft={pmDraft}
                plan={plan}
                running={running}
                error={error}
                onSubmit={submit}
                onStop={stop}
              />
            ) : (
              <ArtifactPanel items={artifacts} />
            )}
          </div>
        </aside>
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
  if (!clean) return "作業中…";
  return clean.length > 44 ? `${clean.slice(0, 44)}…` : clean;
}

function shorten(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}
