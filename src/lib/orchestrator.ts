import { addUsage, emptyUsage, getClient, runTurn, type TurnUsage } from "./anthropic";
import { PM, PM_ID, STAFF, getAgent, rosterForPm } from "./agents";
import { PM_PREFIX, WORKER_PREFIX } from "./company";
import { dedupeArtifacts, extractArtifacts } from "./artifacts";
import type { Artifact, ChatMessage, Plan, PlanTask, ServerEvent } from "./types";

const MAX_TASKS = 6;
const MAX_WAVE = 2;

export interface RunInput {
  message: string;
  history: ChatMessage[];
}

type Emit = (event: ServerEvent) => void;

interface TaskResult {
  task: PlanTask;
  title: string;
  output: string;
  ok: boolean;
}

export async function runOffice(input: RunInput, emit: Emit, signal?: AbortSignal) {
  const client = getClient();
  const runId = Math.random().toString(36).slice(2, 10);
  emit({ t: "start", runId });

  // 勘定 合の帳簿。全ターンの消費をここに積む
  const ledger: TurnUsage = emptyUsage();
  const book = (usage: TurnUsage) => addUsage(ledger, usage);

  emit({ t: "pm_status", text: "社長の指示を読んでいます" });
  const plan = await makePlan(client, input, book, signal);
  emit({ t: "plan", plan });

  const results: TaskResult[] = [];

  for (let wave = 1; wave <= MAX_WAVE; wave++) {
    const batch = plan.tasks.filter((t) => t.wave === wave);
    if (batch.length === 0) continue;

    emit({
      t: "pm_status",
      text:
        wave === 1
          ? `${batch.length}名に割り振りました`
          : `${batch.length}名が引き継ぎます`,
    });

    const done = await Promise.all(
      batch.map((task) => runStaffTask(client, task, input, results, book, emit, signal)),
    );
    results.push(...done);
  }

  emit({ t: "pm_status", text: "報告をまとめています" });
  const summary = await synthesize(client, input, plan, results, book, emit, signal);

  const artifacts = dedupeArtifacts([
    ...results.flatMap((r) => extractArtifacts(r.task.agent, r.title, r.output)),
    ...extractArtifacts(PM_ID, PM.title, summary),
  ]);
  if (artifacts.length > 0) emit({ t: "artifacts", items: artifacts });

  emit({ t: "usage", totals: { inputTokens: ledger.inputTokens, outputTokens: ledger.outputTokens, cacheReadTokens: ledger.cacheReadTokens, cacheWriteTokens: ledger.cacheWriteTokens, usd: ledger.usd, calls: ledger.calls } });
  emit({ t: "done" });
}

/* ------------------------------------------------------------------ *
 * 1. PMがタスクを分解する
 * ------------------------------------------------------------------ */

function planSchema(): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      summary: {
        type: "string",
        description: "社長に向けた方針を1〜2文。誰も動かさない場合は理由を書く。",
      },
      tasks: {
        type: "array",
        description: `割り振るタスク。最大${MAX_TASKS}件。同じ社員に2件振らない。`,
        items: {
          type: "object",
          properties: {
            agent: { type: "string", enum: STAFF.map((a) => a.id) },
            task: {
              type: "string",
              description:
                "その社員だけで完結できるタスク文。会社名・期限・制約・前提をすべて書き込む。",
            },
            wave: {
              type: "integer",
              enum: [1, 2],
              description: "1 は並列で先に走る。2 は wave 1 の全成果を受け取ってから走る。",
            },
          },
          required: ["agent", "task", "wave"],
          additionalProperties: false,
        },
      },
    },
    required: ["summary", "tasks"],
    additionalProperties: false,
  };
}

async function makePlan(
  client: ReturnType<typeof getClient>,
  input: RunInput,
  book: (usage: TurnUsage) => void,
  signal?: AbortSignal,
): Promise<Plan> {
  const system = [
    PM_PREFIX,
    PM.prompt,
    `# 社員名簿（この中からのみ選ぶ）\n\n${rosterForPm()}`,
    `# 出力\n\nJSONのみを返す。summary と tasks の2キー。tasks は最大${MAX_TASKS}件。`,
  ].join("\n\n---\n\n");

  const result = await runTurn({
    client,
    model: PM.model,
    effort: PM.effort,
    maxTokens: 16000,
    system,
    jsonSchema: planSchema(),
    signal,
    messages: [
      ...historyToMessages(input.history),
      { role: "user", content: input.message },
    ],
  });

  book(result.usage);

  if (result.refused) {
    throw new Error(result.note ?? "指示の解釈が拒否されました。");
  }

  return normalizePlan(result.text);
}

function normalizePlan(raw: string): Plan {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim());
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end <= start) {
      return { summary: "指示の分解に失敗しました。PMが直接お答えします。", tasks: [] };
    }
    try {
      parsed = JSON.parse(raw.slice(start, end + 1));
    } catch {
      return { summary: "指示の分解に失敗しました。PMが直接お答えします。", tasks: [] };
    }
  }

  const obj = parsed as { summary?: unknown; tasks?: unknown };
  const summary = typeof obj.summary === "string" ? obj.summary : "";
  const rawTasks = Array.isArray(obj.tasks) ? obj.tasks : [];

  const seen = new Set<string>();
  const tasks: PlanTask[] = [];
  for (const item of rawTasks) {
    const t = item as { agent?: unknown; task?: unknown; wave?: unknown };
    const agent = typeof t.agent === "string" ? t.agent : "";
    const task = typeof t.task === "string" ? t.task.trim() : "";
    if (!agent || !task) continue;
    if (agent === PM_ID || !getAgent(agent) || seen.has(agent)) continue;
    seen.add(agent);
    const wave = t.wave === 2 ? 2 : 1;
    tasks.push({ agent, task, wave });
    if (tasks.length >= MAX_TASKS) break;
  }

  // wave 2 しか無い場合は前倒しする（待つ相手がいないため）
  if (tasks.length > 0 && tasks.every((t) => t.wave === 2)) {
    for (const t of tasks) t.wave = 1;
  }

  return { summary, tasks };
}

/* ------------------------------------------------------------------ *
 * 2. 社員がタスクを実行する
 * ------------------------------------------------------------------ */

async function runStaffTask(
  client: ReturnType<typeof getClient>,
  task: PlanTask,
  input: RunInput,
  earlier: TaskResult[],
  book: (usage: TurnUsage) => void,
  emit: Emit,
  signal?: AbortSignal,
): Promise<TaskResult> {
  const agent = getAgent(task.agent);
  const title = agent?.title ?? task.agent;

  if (!agent) {
    emit({ t: "agent_error", id: task.agent, message: "社員が見つかりません" });
    return { task, title, output: "", ok: false };
  }

  emit({ t: "agent_start", id: agent.id, task: task.task });

  const system = [WORKER_PREFIX, agent.prompt].join("\n\n---\n\n");

  const sections = [
    `# あなたへのタスク\n\n${task.task}`,
    `# 参考: 社長の指示（原文）\n\n${input.message}\n\n※ 優先するのは上のタスク文です。原文は文脈の確認にのみ使ってください。`,
  ];

  if (task.wave === 2 && earlier.length > 0) {
    const handoff = earlier
      .filter((r) => r.ok && r.output.trim())
      .map((r) => `## ${r.title}（${r.task.agent}）の報告\n\n${r.output}`)
      .join("\n\n");
    if (handoff) sections.push(`# 先に上がってきた同僚の報告\n\n${handoff}`);
  }

  let output = "";
  try {
    const result = await runTurn({
      client,
      model: agent.model,
      effort: agent.effort,
      tools: agent.tools,
      maxTokens: 32000,
      system,
      signal,
      messages: [{ role: "user", content: sections.join("\n\n---\n\n") }],
      onText: (text) => {
        output += text;
        emit({ t: "agent_delta", id: agent.id, text });
      },
      onNotice: (text) => emit({ t: "agent_notice", id: agent.id, text }),
    });

    book(result.usage);

    if (result.refused) {
      emit({ t: "agent_error", id: agent.id, message: result.note ?? "応答が拒否されました" });
      return { task, title, output: result.note ?? "", ok: false };
    }

    emit({ t: "agent_done", id: agent.id, chars: output.length });
    return { task, title, output, ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    emit({ t: "agent_error", id: agent.id, message });
    return { task, title, output: output || `（エラー: ${message}）`, ok: false };
  }
}

/* ------------------------------------------------------------------ *
 * 3. PMが統合して社長に報告する
 * ------------------------------------------------------------------ */

async function synthesize(
  client: ReturnType<typeof getClient>,
  input: RunInput,
  plan: Plan,
  results: TaskResult[],
  book: (usage: TurnUsage) => void,
  emit: Emit,
  signal?: AbortSignal,
): Promise<string> {
  const system = [
    PM_PREFIX,
    PM.prompt,
    `# 今回のフェーズ\n\n社員の報告は出揃っています。社長に返す最終回答だけを書いてください。分解のやり直しはしません。`,
  ].join("\n\n---\n\n");

  const reports = results.length
    ? results
        .map(
          (r) =>
            `## ${r.title}（${r.task.agent}）${r.ok ? "" : " — 失敗"}\n\n担当タスク: ${
              r.task.task
            }\n\n${r.output || "（出力なし）"}`,
        )
        .join("\n\n---\n\n")
    : "（今回は社員を動かしていません。あなた自身の判断で回答してください）";

  const content = [
    `# 社長の指示\n\n${input.message}`,
    plan.summary ? `# あなたが立てた方針\n\n${plan.summary}` : "",
    `# 社員からの報告\n\n${reports}`,
  ]
    .filter(Boolean)
    .join("\n\n---\n\n");

  let text = "";
  const result = await runTurn({
    client,
    model: PM.model,
    effort: PM.effort,
    maxTokens: 32000,
    system,
    signal,
    messages: [...historyToMessages(input.history), { role: "user", content }],
    onText: (chunk) => {
      text += chunk;
      emit({ t: "pm_delta", text: chunk });
    },
  });

  book(result.usage);

  if (result.refused && !text) {
    const note = result.note ?? "応答が拒否されました。";
    emit({ t: "pm_delta", text: note });
    return note;
  }

  return text;
}

/* ------------------------------------------------------------------ */

function historyToMessages(history: ChatMessage[]): Record<string, unknown>[] {
  // 直近の数往復だけを渡す（プロンプトの肥大とキャッシュ破壊を避ける）
  return history
    .slice(-6)
    .filter((m) => m.content.trim())
    .map((m) => ({ role: m.role, content: m.content }));
}
