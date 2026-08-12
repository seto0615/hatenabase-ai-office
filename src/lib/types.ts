export type ToolName = "web_search" | "web_fetch";
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

/** `.agents/*.md` 1ファイル = AI社員1名。ビルド時に生成される。 */
export interface AgentDef {
  id: string;
  title: string;
  role: string;
  /** キャラクターとしての氏名（例: 出典 確） */
  person: string;
  kana: string;
  /** 着手時に吹き出しへ出す一言 */
  greeting: string;
  /** 完了時に吹き出しへ出す一言 */
  report: string;
  description: string;
  model: string;
  effort: Effort;
  tools: ToolName[];
  floor: number;
  room: string;
  emoji: string;
  color: string;
  prompt: string;
}

/** 画面に渡す社員情報（システムプロンプトは含めない）。 */
export type AgentCard = Omit<AgentDef, "prompt">;

export interface PlanTask {
  agent: string;
  task: string;
  wave: number;
}

export interface Plan {
  summary: string;
  tasks: PlanTask[];
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface Artifact {
  id: string;
  agent: string;
  agentTitle: string;
  kind: "html" | "markdown" | "text";
  title: string;
  content: string;
}

/** 画面上の社員の状態。 */
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

/** 部署ごとのデスクの島。 */
export interface Island {
  key: number;
  room: string;
  members: AgentCard[];
}

/** 上部に出す進行フェーズ。 */
export type Phase = "idle" | "受領" | "分解" | "実行" | "反証・校閲" | "報告" | "完了";

export const PHASES: Phase[] = ["受領", "分解", "実行", "反証・校閲", "報告"];

/** SSE で画面に流すイベント。 */
export type ServerEvent =
  | { t: "start"; runId: string }
  | { t: "pm_status"; text: string }
  | { t: "plan"; plan: Plan }
  | { t: "agent_start"; id: string; task: string }
  | { t: "agent_notice"; id: string; text: string }
  | { t: "agent_delta"; id: string; text: string }
  | { t: "agent_done"; id: string; chars: number }
  | { t: "agent_error"; id: string; message: string }
  | { t: "pm_delta"; text: string }
  | { t: "artifacts"; items: Artifact[] }
  | { t: "done" }
  | { t: "error"; message: string };
