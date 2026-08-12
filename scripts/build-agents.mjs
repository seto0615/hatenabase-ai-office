#!/usr/bin/env node
/**
 * .agents/*.md を読み、src/generated/agents.ts を生成する。
 *
 * Vercel のサーバーレス環境では実行時のファイル読み込みが確実でないため、
 * ビルド時に TypeScript モジュールへ焼き込む。`prebuild` / `predev` から呼ばれる。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const agentsDir = path.join(root, ".agents");
const outFile = path.join(root, "src", "generated", "agents.ts");

const SCALARS = new Set([
  "name",
  "title",
  "role",
  "description",
  "model",
  "effort",
  "room",
  "emoji",
  "color",
]);
const NUMBERS = new Set(["floor"]);
const LISTS = new Set(["tools"]);

/** 最低限の YAML サブセット（scalar / インライン空配列 / ブロック配列）を解釈する。 */
function parseFrontmatter(raw, file) {
  if (!raw.startsWith("---")) {
    throw new Error(`${file}: フロントマター（--- で始まるブロック）がありません`);
  }
  const end = raw.indexOf("\n---", 3);
  if (end === -1) throw new Error(`${file}: フロントマターが閉じられていません`);

  const head = raw.slice(raw.indexOf("\n") + 1, end);
  const body = raw.slice(end + 4).replace(/^\r?\n/, "");

  const meta = {};
  let currentList = null;

  for (const line of head.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;

    const item = line.match(/^\s+-\s+(.*)$/);
    if (item && currentList) {
      meta[currentList].push(unquote(item[1]));
      continue;
    }

    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!kv) continue;
    const [, key, rawValue] = kv;
    const value = rawValue.trim();
    currentList = null;

    if (LISTS.has(key)) {
      meta[key] = value === "" || value === "[]" ? [] : parseInlineList(value);
      if (value === "") currentList = key;
    } else if (NUMBERS.has(key)) {
      meta[key] = Number(unquote(value));
    } else if (SCALARS.has(key)) {
      meta[key] = unquote(value);
    }
  }

  return { meta, body: body.trim() };
}

function unquote(v) {
  const s = v.trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    return s.slice(1, -1);
  }
  return s;
}

function parseInlineList(value) {
  if (!value.startsWith("[")) return [unquote(value)];
  return value
    .slice(1, -1)
    .split(",")
    .map((s) => unquote(s))
    .filter(Boolean);
}

const ALLOWED_TOOLS = new Set(["web_search", "web_fetch"]);
const ALLOWED_EFFORT = new Set(["low", "medium", "high", "xhigh", "max"]);

function main() {
  if (!fs.existsSync(agentsDir)) {
    throw new Error(".agents ディレクトリが見つかりません");
  }

  const files = fs
    .readdirSync(agentsDir)
    .filter((f) => f.endsWith(".md") && f.toLowerCase() !== "readme.md")
    .sort();

  const agents = [];
  for (const file of files) {
    const raw = fs.readFileSync(path.join(agentsDir, file), "utf8");
    const { meta, body } = parseFrontmatter(raw, file);

    const id = meta.name || path.basename(file, ".md");
    if (!meta.description) throw new Error(`${file}: description は必須です`);
    if (!body) throw new Error(`${file}: 本文（システムプロンプト）が空です`);

    const tools = (meta.tools || []).filter((t) => {
      if (!ALLOWED_TOOLS.has(t)) {
        console.warn(`  ! ${file}: 未対応のツール "${t}" を無視しました`);
        return false;
      }
      return true;
    });

    const effort = ALLOWED_EFFORT.has(meta.effort) ? meta.effort : "medium";

    agents.push({
      id,
      title: meta.title || id,
      role: meta.role || "",
      description: meta.description,
      model: meta.model || "claude-fable-5",
      effort,
      tools,
      floor: Number.isFinite(meta.floor) ? meta.floor : 1,
      room: meta.room || "オフィス",
      emoji: meta.emoji || "🧑‍💻",
      color: meta.color || "#4C8DFF",
      prompt: body,
    });
  }

  if (!agents.some((a) => a.id === "pm")) {
    throw new Error(".agents/pm.md（PM）が必要です");
  }

  const header = `// このファイルは自動生成されています。編集しないでください。
// 元データ: .agents/*.md  /  生成: scripts/build-agents.mjs
import type { AgentDef } from "@/lib/types";

export const AGENTS: AgentDef[] = ${JSON.stringify(agents, null, 2)};
`;

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, header, "utf8");

  console.log(`[build-agents] ${agents.length} 名を生成しました → src/generated/agents.ts`);
  for (const a of agents) {
    console.log(`  ${a.emoji} ${a.id.padEnd(12)} ${a.floor}F ${a.room} / ${a.title}`);
  }
}

main();
