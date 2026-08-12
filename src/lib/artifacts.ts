import type { Artifact } from "./types";

const FENCE = /(^|\n)(`{3,})([A-Za-z0-9_+-]*)[^\n]*\n([\s\S]*?)\n\2(?=\n|$)/g;

const HTML_LANGS = new Set(["html", "htm"]);
const TEXT_LANGS = new Set(["markdown", "md", "text", "txt", "plaintext", ""]);

/** 社員の出力から、成果物パネルに出すコードブロックを抜き出す。 */
export function extractArtifacts(
  agentId: string,
  agentTitle: string,
  text: string,
): Artifact[] {
  const found: Artifact[] = [];
  let index = 0;

  FENCE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = FENCE.exec(text)) !== null) {
    const lang = (match[3] || "").toLowerCase();
    const body = match[4];
    if (!body.trim()) continue;

    const isHtml = HTML_LANGS.has(lang) || /^\s*<(!doctype|html|section|div|style)/i.test(body);
    const isText = TEXT_LANGS.has(lang);

    // HTML は常に、それ以外は「まとまった量の文章」だけを成果物として扱う。
    if (!isHtml && !(isText && body.length >= 160)) continue;

    index += 1;
    found.push({
      id: `${agentId}-${index}`,
      agent: agentId,
      agentTitle,
      kind: isHtml ? "html" : "markdown",
      title: deriveTitle(body, isHtml) || `${agentTitle} の成果物 ${index}`,
      content: body,
    });
  }

  return found;
}

function deriveTitle(body: string, isHtml: boolean): string | null {
  if (isHtml) {
    const title = body.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (title) return clean(title[1]);
    const h1 = body.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (h1) return clean(h1[1].replace(/<[^>]+>/g, ""));
    return null;
  }
  const subject = body.match(/^\s*件名[:：]\s*(.+)$/m);
  if (subject) return clean(subject[1]);
  const heading = body.match(/^#{1,3}\s+(.+)$/m);
  if (heading) return clean(heading[1]);
  const first = body.split("\n").find((l) => l.trim().length > 0);
  return first ? clean(first) : null;
}

function clean(s: string): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > 60 ? `${t.slice(0, 60)}…` : t;
}

/** 同じ内容の成果物をまとめる。 */
export function dedupeArtifacts(items: Artifact[]): Artifact[] {
  const seen = new Set<string>();
  const out: Artifact[] = [];
  for (const item of items) {
    const key = `${item.kind}:${item.content.trim()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
