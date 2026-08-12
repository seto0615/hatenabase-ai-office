"use client";

import { useEffect, useRef } from "react";

export interface TickerItem {
  key: number;
  emoji: string;
  color: string;
  who: string;
  text: string;
  tone: "info" | "work" | "done" | "error";
}

export default function Ticker({ items }: { items: TickerItem[] }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items]);

  return (
    <div className="ticker">
      <div className="tickerHead">
        <span className="tickerDot" />
        社内実況
      </div>
      <div className="tickerBody" ref={ref}>
        {items.length === 0 ? (
          <div className="tickerEmpty">まだ誰も動いていません。</div>
        ) : (
          items.map((item) => (
            <div className={`tickerRow tone-${item.tone}`} key={item.key}>
              <span className="tickerWho" style={{ ["--agent" as string]: item.color }}>
                <i>{item.emoji}</i>
                {item.who}
              </span>
              <span className="tickerText">{item.text}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
