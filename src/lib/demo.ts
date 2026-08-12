import type { ServerEvent } from "./types";

/**
 * `?demo=1` で動くオフラインのデモ台本。
 * APIキーを使わずにオフィスの動きだけを見せたいときに使う（社内デモ・撮影用）。
 */
export interface DemoStep {
  after: number;
  event: ServerEvent;
}

const RESEARCH = [
  "## 結論\n",
  "電子帳簿保存法の電子取引データ保存は、2024年1月以降すべての事業者で義務化済み。",
  "宥恕措置は終了し、現在は「猶予措置」に切り替わっている。\n\n",
  "## わかったこと\n",
  "- 保存要件は真実性の確保と可視性の確保の2本立て\n",
  "- 猶予措置は相当の理由があると認められる場合に適用\n",
];

const CONTRA = [
  "## 判定\n",
  "条件付きで成立。\n\n",
  "## 反証\n",
  "1. 【重大度: 中】猶予措置を恒久的な免除と読める書き方になっている\n",
  "   - 猶予措置はダウンロード要求への応答が前提。無条件ではない\n",
];

const PM_REPORT = [
  "## 結論\n\n",
  "電子取引データの電子保存は義務化済みで、紙保存への差し戻しはできません。",
  "ただし猶予措置があるため、要件を満たせない事業者にも当面の逃げ道は残っています。\n\n",
  "## 論点\n\n",
  "| 項目 | 現状 | 対応 |\n|---|---|---|\n",
  "| 真実性の確保 | タイムスタンプ or 訂正削除規程 | 規程整備が最短 |\n",
  "| 可視性の確保 | 検索要件3項目 | ファイル名ルールで代替可 |\n\n",
  "## 反証チームからの指摘\n\n",
  "猶予措置はダウンロード要求への応答が前提です。無条件の免除ではない点を提案時に明示してください。\n",
];

export function demoScript(): DemoStep[] {
  const steps: DemoStep[] = [];
  let t = 0;
  const push = (gap: number, event: ServerEvent) => {
    t += gap;
    steps.push({ after: t, event });
  };

  push(0, { t: "start", runId: "demo" });
  push(500, { t: "pm_status", text: "社長の指示を読んでいます" });
  push(1400, {
    t: "plan",
    plan: {
      summary: "制度の現状を調べたうえで、反証を当ててから報告します。",
      tasks: [
        { agent: "researcher", task: "電子帳簿保存法の電子取引データ保存の現行要件を調べる", wave: 1 },
        { agent: "accountant", task: "実務上の対応コストを整理する", wave: 1 },
        { agent: "contrarian", task: "調査結果に反証をかける", wave: 2 },
      ],
    },
  });

  push(300, { t: "pm_status", text: "2名に割り振りました" });
  push(200, {
    t: "agent_start",
    id: "researcher",
    task: "電子帳簿保存法の電子取引データ保存の現行要件を調べる",
  });
  push(100, { t: "agent_start", id: "accountant", task: "実務上の対応コストを整理する" });
  push(700, { t: "agent_notice", id: "researcher", text: "Web検索中…" });

  for (const chunk of RESEARCH) push(420, { t: "agent_delta", id: "researcher", text: chunk });
  push(400, { t: "agent_done", id: "researcher", chars: 480 });
  push(600, { t: "agent_done", id: "accountant", chars: 310 });

  push(500, { t: "pm_status", text: "1名が引き継ぎます" });
  push(200, { t: "agent_start", id: "contrarian", task: "調査結果に反証をかける" });
  for (const chunk of CONTRA) push(460, { t: "agent_delta", id: "contrarian", text: chunk });
  push(400, { t: "agent_done", id: "contrarian", chars: 260 });

  push(700, { t: "pm_status", text: "報告をまとめています" });
  for (const chunk of PM_REPORT) push(340, { t: "pm_delta", text: chunk });
  push(400, {
    t: "usage",
    totals: {
      inputTokens: 128400,
      outputTokens: 21300,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      usd: 2.35,
      calls: 5,
    },
  });
  push(300, { t: "done" });

  return steps;
}
