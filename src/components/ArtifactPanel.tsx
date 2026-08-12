"use client";

import { useEffect, useState } from "react";
import type { Artifact } from "@/lib/types";

export default function ArtifactPanel({ items }: { items: Artifact[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (items.length > 0) setOpenId(items[0].id);
  }, [items]);

  if (items.length === 0) {
    return (
      <div className="panelEmpty">
        成果物はまだありません。
        <br />
        資料・メール文面・デザインを依頼すると、ここに出てきます。
      </div>
    );
  }

  const current = items.find((i) => i.id === openId) ?? items[0];

  return (
    <div className="artifacts">
      <div className="artifactTabs">
        {items.map((item) => (
          <button
            key={item.id}
            className={`artifactTab${item.id === current.id ? " is-active" : ""}`}
            onClick={() => setOpenId(item.id)}
            type="button"
          >
            <span className="artifactKind">{item.kind === "html" ? "HTML" : "TEXT"}</span>
            {item.title}
          </button>
        ))}
      </div>

      <div className="artifactMeta">
        <span>{current.agentTitle}</span>
        <div className="artifactActions">
          <button type="button" onClick={() => copy(current.content)}>
            コピー
          </button>
          <button type="button" onClick={() => download(current)}>
            ダウンロード
          </button>
          {current.kind === "html" && (
            <button type="button" onClick={() => openInTab(current.content)}>
              新しいタブ
            </button>
          )}
        </div>
      </div>

      <div className="artifactView">
        {current.kind === "html" ? (
          <iframe
            className="artifactFrame"
            title={current.title}
            sandbox="allow-same-origin"
            srcDoc={current.content}
          />
        ) : (
          <pre className="artifactText">{current.content}</pre>
        )}
      </div>
    </div>
  );
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* クリップボードが使えない環境では黙って諦める */
  }
}

function download(item: Artifact) {
  const ext = item.kind === "html" ? "html" : "md";
  const type = item.kind === "html" ? "text/html" : "text/markdown";
  const blob = new Blob([item.content], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${sanitize(item.title)}.${ext}`;
  a.click();
  URL.revokeObjectURL(url);
}

function openInTab(html: string) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function sanitize(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 48) || "artifact";
}
