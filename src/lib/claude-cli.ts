import { spawn } from "node:child_process";
import { emptyUsage, type TurnOptions, type TurnResult } from "./anthropic";

/**
 * 定額モード（OFFICE_ENGINE=claude-cli）。
 *
 * APIの代わりに、ローカルにインストール済みの Claude Code CLI をヘッドレス
 * （`claude -p --output-format stream-json`）で呼ぶ。課金は Claude Code の
 * サブスクリプション枠内で、APIクレジットを消費しない。
 *
 * 制約:
 * - localhost 専用（Vercel には claude CLI が無い）
 * - モデルはCLI側の指定に従う（既定 opus。OFFICE_CLI_MODEL で変更可）
 * - Web検索は Claude Code の WebSearch / WebFetch ツールで代替する
 */

export function isCliEngine(): boolean {
  return process.env.OFFICE_ENGINE === "claude-cli";
}

const CLI_TIMEOUT_MS = 8 * 60 * 1000;

export async function runCliTurn(opts: TurnOptions): Promise<TurnResult> {
  const model = process.env.OFFICE_CLI_MODEL || "opus";

  const args = [
    "-p",
    "--output-format",
    "stream-json",
    "--verbose",
    "--include-partial-messages",
    "--model",
    model,
    "--system-prompt",
    buildSystemPrompt(opts),
  ];

  if ((opts.tools ?? []).length > 0) {
    args.push("--allowedTools", "WebSearch", "WebFetch");
  } else {
    args.push("--disallowedTools", "*");
  }

  const prompt = flattenMessages(opts.messages);

  return new Promise<TurnResult>((resolve, reject) => {
    // APIキーを環境から外す。残っていると CLI がAPI課金で動いてしまう
    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY;
    delete env.ANTHROPIC_AUTH_TOKEN;

    const child = spawn("claude", args, {
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const usage = emptyUsage();
    const chunks: string[] = [];
    let sawDelta = false;
    let resultText: string | null = null;
    let stderrTail = "";
    let settled = false;

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      fail(new Error("claude CLI がタイムアウトしました（8分）"));
    }, CLI_TIMEOUT_MS);

    const onAbort = () => {
      child.kill("SIGKILL");
      fail(new Error("aborted"));
    };
    opts.signal?.addEventListener("abort", onAbort, { once: true });

    const done = (result: TurnResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onAbort);
      resolve(result);
    };
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onAbort);
      reject(err);
    };

    let buffer = "";
    child.stdout.on("data", (data: Buffer) => {
      buffer += data.toString("utf8");
      let nl: number;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        try {
          handleLine(JSON.parse(line));
        } catch {
          /* JSON以外の行は無視 */
        }
      }
    });

    child.stderr.on("data", (data: Buffer) => {
      stderrTail = (stderrTail + data.toString("utf8")).slice(-2000);
    });

    child.on("error", (err) => {
      fail(
        new Error(
          `claude CLI を起動できませんでした: ${err.message}。定額モードは claude コマンドが入っているマシンでのみ使えます。`,
        ),
      );
    });

    child.on("close", (code) => {
      const text = chunks.join("") || resultText || "";
      if (!text && code !== 0) {
        fail(new Error(`claude CLI が異常終了しました (exit ${code}): ${stderrTail.slice(-300)}`));
        return;
      }
      done({ text, refused: false, usage });
    });

    interface CliLine {
      type?: string;
      subtype?: string;
      event?: {
        type?: string;
        delta?: { type?: string; text?: string };
      };
      message?: {
        content?: { type?: string; text?: string; name?: string }[];
        usage?: Record<string, number>;
      };
      result?: string;
      usage?: Record<string, number>;
      is_error?: boolean;
    }

    const handleLine = (ev: CliLine) => {
      if (ev.type === "stream_event") {
        const delta = ev.event?.delta;
        if (ev.event?.type === "content_block_delta" && delta?.type === "text_delta" && delta.text) {
          sawDelta = true;
          chunks.push(delta.text);
          opts.onText?.(delta.text);
        }
        return;
      }

      if (ev.type === "assistant") {
        for (const block of ev.message?.content ?? []) {
          if (block.type === "tool_use") {
            opts.onNotice?.(
              block.name === "WebSearch"
                ? "Web検索中…"
                : block.name === "WebFetch"
                  ? "ページを読み込み中…"
                  : "ツールを実行中…",
            );
          } else if (block.type === "text" && block.text && !sawDelta) {
            // partial が効いていない環境ではメッセージ単位で流す
            chunks.push(block.text);
            opts.onText?.(block.text);
          }
        }
        bookUsage(ev.message?.usage);
        return;
      }

      if (ev.type === "result") {
        if (typeof ev.result === "string") resultText = ev.result;
        bookUsage(ev.usage);
      }
    };

    const bookUsage = (u?: Record<string, number>) => {
      if (!u) return;
      usage.inputTokens += u.input_tokens ?? 0;
      usage.outputTokens += u.output_tokens ?? 0;
      usage.cacheReadTokens += u.cache_read_input_tokens ?? 0;
      usage.cacheWriteTokens += u.cache_creation_input_tokens ?? 0;
      usage.calls = Math.max(usage.calls, 1);
      // 定額内なので usd は積まない
    };

    child.stdin.write(prompt);
    child.stdin.end();
  });
}

/** JSON強制はCLIには無いので、システムプロンプトで指示する。 */
function buildSystemPrompt(opts: TurnOptions): string {
  let system = opts.system;
  if (opts.jsonSchema) {
    system += `\n\n# 出力形式（厳守）\n\n次のJSON Schemaに完全準拠したJSONだけを出力する。前置き・コードフェンス・補足は一切書かない。\n\n${JSON.stringify(opts.jsonSchema)}`;
  }
  return system;
}

function flattenMessages(messages: Record<string, unknown>[]): string {
  const parts: string[] = [];
  for (const m of messages) {
    const role = m.role === "assistant" ? "PM（過去のあなたの回答）" : "社長";
    const content = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
    parts.push(`【${role}】\n${content}`);
  }
  return parts.join("\n\n---\n\n");
}
