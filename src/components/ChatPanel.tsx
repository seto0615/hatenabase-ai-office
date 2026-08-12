"use client";

import { useEffect, useRef, useState } from "react";
import { renderMarkdown } from "@/lib/markdown";
import type { ChatMessage, Plan } from "@/lib/types";

interface Props {
  messages: ChatMessage[];
  pmDraft: string;
  plan: Plan | null;
  running: boolean;
  error: string | null;
  onSubmit: (text: string) => void;
  onStop: () => void;
}

const SUGGESTIONS = [
  "インボイス制度の少額特例、2026年時点の適用条件を調べて反証もかけて",
  "freee導入を検討中の製造業（従業員40名）向けの提案資料を1本つくって",
  "初回商談のお礼メールを書いて。次回は再来週で日程候補を3つ入れる",
  "経理AXのX投稿を3案。社内で実際にやった作業ベースで",
];

export default function ChatPanel({
  messages,
  pmDraft,
  plan,
  running,
  error,
  onSubmit,
  onStop,
}: Props) {
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, pmDraft, plan]);

  const send = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || running) return;
    onSubmit(trimmed);
    setText("");
  };

  return (
    <div className="chat">
      <div className="chatScroll" ref={scrollRef}>
        {messages.length === 0 && !running && (
          <div className="chatIntro">
            <p className="chatIntroLead">
              指示を1つ書いてください。PMが受け取り、必要な社員だけを動かします。
            </p>
            <div className="chips">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" className="chip" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`msg msg--${m.role}`}>
            <div className="msgWho">{m.role === "user" ? "社長" : "PM"}</div>
            {m.role === "user" ? (
              <div className="msgBody msgBody--plain">{m.content}</div>
            ) : (
              <div
                className="msgBody md"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }}
              />
            )}
          </div>
        ))}

        {plan && running && (
          <div className="planCard">
            <div className="planHead">PMの割り振り</div>
            {plan.summary && <p className="planSummary">{plan.summary}</p>}
            {plan.tasks.length === 0 ? (
              <p className="planNone">今回は社員を動かさず、PMが直接お答えします。</p>
            ) : (
              <ol className="planList">
                {plan.tasks.map((t) => (
                  <li key={t.agent}>
                    <span className="planAgent">{t.agent}</span>
                    <span className="planWave">W{t.wave}</span>
                    <span className="planTask">{t.task}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}

        {running && pmDraft && (
          <div className="msg msg--assistant">
            <div className="msgWho">PM</div>
            <div
              className="msgBody md"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(pmDraft) }}
            />
          </div>
        )}

        {error && <div className="chatError">{error}</div>}
      </div>

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <textarea
          className="composerInput"
          value={text}
          placeholder={running ? "社員が作業中です…" : "社長の指示を書く（⌘/Ctrl + Enter で送信）"}
          rows={3}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              send(text);
            }
          }}
        />
        {running ? (
          <button type="button" className="btn btn--stop" onClick={onStop}>
            停止
          </button>
        ) : (
          <button type="submit" className="btn btn--send" disabled={!text.trim()}>
            指示を出す
          </button>
        )}
      </form>
    </div>
  );
}
