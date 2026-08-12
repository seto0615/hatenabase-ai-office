import { runOffice } from "@/lib/orchestrator";
import { MissingApiKeyError } from "@/lib/anthropic";
import type { ChatMessage, ServerEvent } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Vercel の関数実行時間の上限（秒）。Fable 5 は1ターンが数分に及ぶことがある。
export const maxDuration = 300;

interface RunBody {
  message?: unknown;
  history?: unknown;
}

export async function POST(req: Request) {
  let body: RunBody;
  try {
    body = (await req.json()) as RunBody;
  } catch {
    return Response.json({ error: "リクエストの形式が不正です" }, { status: 400 });
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) {
    return Response.json({ error: "指示が空です" }, { status: 400 });
  }
  if (message.length > 20000) {
    return Response.json({ error: "指示が長すぎます（20,000文字まで）" }, { status: 400 });
  }

  const history: ChatMessage[] = Array.isArray(body.history)
    ? (body.history as unknown[])
        .map((m) => m as { role?: unknown; content?: unknown })
        .filter(
          (m): m is ChatMessage =>
            (m.role === "user" || m.role === "assistant") && typeof m.content === "string",
        )
        .slice(-12)
    : [];

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const emit = (event: ServerEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          closed = true;
        }
      };

      try {
        await runOffice({ message, history }, emit, req.signal);
      } catch (err) {
        emit({ t: "error", message: toMessage(err) });
      } finally {
        if (!closed) {
          try {
            controller.close();
          } catch {
            /* すでに閉じている */
          }
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

function toMessage(err: unknown): string {
  if (err instanceof MissingApiKeyError) return err.message;
  if (err instanceof Error) {
    const status = (err as { status?: number }).status;
    if (status === 401) return "APIキーが無効です。ANTHROPIC_API_KEY を確認してください。";
    if (status === 429) return "レート制限に達しました。少し待ってからもう一度お試しください。";
    if (status === 529) return "APIが混雑しています。少し待ってからもう一度お試しください。";
    return err.message;
  }
  return String(err);
}
