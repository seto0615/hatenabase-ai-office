import Anthropic from "@anthropic-ai/sdk";
import type { Effort, ToolName } from "./types";

/**
 * Claude Fable 5 を使う前提の薄いラッパー。
 *
 * Fable 5 固有の注意（公式仕様）:
 * - thinking は常時ON。`thinking` パラメータは一切渡さない（渡すと 400）
 * - temperature / top_p / top_k は使えない（渡すと 400）
 * - assistant プレフィルは使えない
 * - 思考の生テキストは返らない。深さは output_config.effort で制御する
 * - 安全性分類器により stop_reason: "refusal" が返ることがある → fallbacks で救済する
 * - 組織のデータ保持設定が30日未満（ZDR等）だと全リクエストが 400 になる
 */

export const DEFAULT_MODEL = "claude-fable-5";
export const FALLBACK_MODEL = "claude-opus-4-8";
const FALLBACK_BETA = "server-side-fallback-2026-06-01";

const TOOL_TYPES = {
  modern: { web_search: "web_search_20260209", web_fetch: "web_fetch_20260209" },
  legacy: { web_search: "web_search_20250305", web_fetch: "web_fetch_20250910" },
} as const;

export class MissingApiKeyError extends Error {
  constructor() {
    super(
      "ANTHROPIC_API_KEY が設定されていません。Vercel の環境変数、またはローカルの .env.local に設定してください。",
    );
    this.name = "MissingApiKeyError";
  }
}

export function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new MissingApiKeyError();
  return new Anthropic({ apiKey, maxRetries: 2 });
}

/* ------------------------------------------------------------------ *
 * SDK の型定義は新しめのパラメータ（output_config / fallbacks など）に
 * 追いついていないことがあるため、必要な部分だけ自前で型を当てる。
 * ------------------------------------------------------------------ */

type ContentBlock = {
  type: string;
  text?: string;
  name?: string;
  [key: string]: unknown;
};

type FinalMessage = {
  content: ContentBlock[];
  stop_reason: string | null;
  stop_details?: { category?: string | null; explanation?: string | null } | null;
  model?: string;
};

type StreamEvent = {
  type: string;
  index?: number;
  content_block?: { type?: string; name?: string };
  delta?: { type?: string; text?: string };
};

type StreamHandle = AsyncIterable<StreamEvent> & {
  finalMessage(): Promise<FinalMessage>;
};

type Params = Record<string, unknown>;

type BetaMessages = { stream(params: Params): StreamHandle };

function betaMessages(client: Anthropic): BetaMessages {
  return client.beta.messages as unknown as BetaMessages;
}

/* ------------------------------------------------------------------ */

export interface TurnOptions {
  client: Anthropic;
  model?: string;
  system: string;
  messages: Params[];
  effort?: Effort;
  tools?: ToolName[];
  maxTokens?: number;
  /** 指定すると JSON Schema に沿った出力を強制する（構造化出力）。 */
  jsonSchema?: Record<string, unknown>;
  onText?: (text: string) => void;
  onNotice?: (text: string) => void;
  signal?: AbortSignal;
}

export interface TurnResult {
  text: string;
  refused: boolean;
  note?: string;
}

const MAX_RESUMES = 3;

export async function runTurn(opts: TurnOptions): Promise<TurnResult> {
  const {
    client,
    model = DEFAULT_MODEL,
    system,
    effort = "medium",
    tools = [],
    maxTokens = 32000,
    jsonSchema,
    onText,
    onNotice,
    signal,
  } = opts;

  const outputConfig: Params = { effort };
  if (jsonSchema) outputConfig.format = { type: "json_schema", schema: jsonSchema };

  let params: Params = {
    model,
    max_tokens: maxTokens,
    system,
    messages: [...opts.messages],
    output_config: outputConfig,
    // Fable 5 は安全性分類器で拒否することがある。拒否時は同一リクエスト内で
    // フォールバックモデルが応答する（拒否のみが対象で、レート制限等では発火しない）。
    betas: [FALLBACK_BETA],
    fallbacks: [{ model: FALLBACK_MODEL }],
  };
  if (tools.length > 0) params.tools = buildTools(tools, "modern");

  let emitted = false;
  let attempt = 0;

  for (;;) {
    try {
      return await consume(client, params, {
        onText: (t) => {
          emitted = true;
          onText?.(t);
        },
        onNotice,
        signal,
      });
    } catch (err) {
      // まだ1文字も出していない段階での 400 なら、機能を落として1度だけ再挑戦する。
      // （SDK/APIのバージョン差でパラメータが受け付けられないケースを吸収する）
      if (emitted || attempt >= 2 || !isBadRequest(err)) throw err;
      const degraded = degrade(params, describeError(err), tools);
      if (!degraded) throw err;
      params = degraded;
      attempt += 1;
    }
  }
}

interface ConsumeHandlers {
  onText?: (t: string) => void;
  onNotice?: (t: string) => void;
  signal?: AbortSignal;
}

async function consume(
  client: Anthropic,
  baseParams: Params,
  handlers: ConsumeHandlers,
): Promise<TurnResult> {
  const messages = [...(baseParams.messages as Params[])];
  const chunks: string[] = [];

  for (let resume = 0; ; resume++) {
    const params: Params = { ...baseParams, messages };
    const stream = betaMessages(client).stream(params);

    let textIndex: number | null = null;

    for await (const event of stream) {
      if (handlers.signal?.aborted) throw new Error("aborted");

      if (event.type === "content_block_start") {
        const block = event.content_block;
        if (block?.type === "text") {
          textIndex = event.index ?? null;
        } else if (block?.type === "server_tool_use") {
          handlers.onNotice?.(toolNotice(block.name));
        }
      } else if (event.type === "content_block_delta") {
        if (event.delta?.type === "text_delta" && event.index === textIndex) {
          const text = event.delta.text ?? "";
          if (text) {
            chunks.push(text);
            handlers.onText?.(text);
          }
        }
      }
    }

    const final = await stream.finalMessage();

    if (final.stop_reason === "refusal") {
      const category = final.stop_details?.category ?? "不明";
      return {
        text: chunks.join(""),
        refused: true,
        note: `安全性分類器により応答が拒否されました（分類: ${category}）。表現を変えて指示し直してください。`,
      };
    }

    // サーバー側ツール（Web検索など）が反復上限に達した場合は、続きを要求する。
    if (final.stop_reason === "pause_turn" && resume < MAX_RESUMES) {
      messages.push({ role: "assistant", content: final.content });
      handlers.onNotice?.("調査を継続中…");
      continue;
    }

    return { text: chunks.join(""), refused: false };
  }
}

function buildTools(tools: ToolName[], variant: "modern" | "legacy"): Params[] {
  const table = TOOL_TYPES[variant];
  return tools.map((name) => ({ type: table[name], name }));
}

function toolNotice(name?: string): string {
  if (name === "web_search") return "Web検索中…";
  if (name === "web_fetch") return "ページを読み込み中…";
  return "ツールを実行中…";
}

function isBadRequest(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  return status === 400 || status === 404;
}

function describeError(err: unknown): string {
  const e = err as { message?: string };
  return (e?.message ?? String(err)).toLowerCase();
}

/** 400 の内容を見て、原因になっていそうなパラメータを外した params を返す。 */
function degrade(params: Params, message: string, tools: ToolName[]): Params | null {
  const next = { ...params };

  if (message.includes("fallback") || message.includes("beta")) {
    if (next.betas || next.fallbacks) {
      delete next.betas;
      delete next.fallbacks;
      return next;
    }
  }

  if (
    (message.includes("web_search") ||
      message.includes("web_fetch") ||
      message.includes("tool")) &&
    tools.length > 0
  ) {
    const current = JSON.stringify(next.tools ?? []);
    const legacy = buildTools(tools, "legacy");
    if (current !== JSON.stringify(legacy)) {
      next.tools = legacy;
      return next;
    }
  }

  if (message.includes("output_config") || message.includes("effort") || message.includes("format")) {
    const oc = next.output_config as Params | undefined;
    if (oc && "effort" in oc) {
      const { effort: _drop, ...rest } = oc;
      void _drop;
      next.output_config = rest;
      if (Object.keys(rest).length === 0) delete next.output_config;
      return next;
    }
  }

  // 最後の手段: 追加パラメータをすべて外した素のリクエストに落とす
  if (next.betas || next.fallbacks || next.output_config) {
    delete next.betas;
    delete next.fallbacks;
    delete next.output_config;
    return next;
  }

  return null;
}
