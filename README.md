![Hatenabase](https://img.shields.io/badge/Hatenabase-AI%20OFFICE-0A2846?style=for-the-badge)
![Model](https://img.shields.io/badge/Claude-Fable%205-0A2846?style=for-the-badge)

# はてなベース AI OFFICE

社長が指示を出すと、PMが受け取って分解し、AI社員が並行して働く3Dバーチャルオフィスです。
夕景の窓を背にしたローポリのオフィスで、社員が机に向かって作業し、終わると席を立って
報告書を持ってPMのデスクまで歩いていきます。自動カメラが働いている社員に寄っていき、
手動カメラに切り替えればドラッグで自由に見回せます。

指揮系統は 社長 → PM → AI社員 の一本道。社長が話す相手はPMだけです。

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fseto0615%2Fhatenabase-ai-office&env=ANTHROPIC_API_KEY&envDescription=Anthropic%20API%20key%EF%BC%88%E3%82%B5%E3%83%BC%E3%83%90%E3%83%BC%E5%81%B4%E3%81%AE%E3%81%BF%E3%81%A7%E4%BD%BF%E7%94%A8%EF%BC%89&envLink=https%3A%2F%2Fconsole.anthropic.com%2Fsettings%2Fkeys&project-name=hatenabase-ai-office&repository-name=hatenabase-ai-office)

ボタンを押す → リポジトリが自分のGitHubにコピーされる → `ANTHROPIC_API_KEY` を貼る → 自分専用のURLが立ちます。
以降はそのURLを開くだけで、AI社員のシステムが起動します。

## 🏢 社員名簿

社員には氏名があります。役割を表す苗字＋それを形容する名前という付け方です。

| 部署（島） | 氏名 | 役職 | 役割 |
|---|---|---|---|
| PM席 | 采配 統（さいはい おさむ） | PM | 分解・割り振り・統合・品質管理 |
| コーポレート部 | 勘定 合（かんじょう あい） | アカウンタント | 会計・税務・数値の検証 |
| コーポレート部 | 適材 適（てきざい かなう） | リクルーター | 採用要件・JD・スカウト文 |
| インテリジェンス部 | 出典 確（しゅってん たしか） | リサーチャー | 一次情報の調査（Web検索可） |
| インテリジェンス部 | 反証 鋭（はんしょう するど） | レッドチーム | 反証・別視点（Web検索可） |
| インテリジェンス部 | 議事 正（ぎじ ただし） | アーキビスト | 議事録・Slackログの読解と構造化 |
| コミュニケーション部 | 商談 結（しょうだん むすぶ） | セールス | 商談設計・提案ストーリー |
| コミュニケーション部 | 一筆 早（いっぴつ はや） | メールライター | メール・チャット文面 |
| コミュニケーション部 | 発信 継（はっしん つぐ） | パブリッシャー | X投稿・セミナー告知 |
| クリエイティブ部 | 構成 立（こうせい たつ） | デッキビルダー | 提案資料・レポートのHTML制作 |
| クリエイティブ部 | 意匠 整（いしょう ととの） | デザイナー | デザインシステムの管理と適用 |
| クリエイティブ部 | 校閲 直（こうえつ なおし） | エディター | トンマナと事実の最終チェック |

社長（世戸口）は部屋の中にはいません。指示は画面中央に「社長の声」として降ってきます。

指定の6名（メール・資料・デザイナー・情報収集・調査・反証）に加えて、5名を追加しています。

| 追加した社員 | 理由 |
|---|---|
| アカウンタント | 会計DXが本業。数字の検証がないと看板に関わる |
| セールス | 商談準備・ヒアリング設計を毎週回しているため |
| エディター | 太字禁止・絵文字ルール・実数計算といった表記規律の番人が必要 |
| リクルーター | 採用が事業領域に入っており、JDとスカウト文が定常業務のため |
| パブリッシャー | 経理AXの発信を継続しているため |

## 🗂 ディレクトリ構成

```
.agents/            AI社員の定義（1ファイル = 1名）
  pm.md             PM。分解と統合だけを担当する特別枠
  researcher.md     ほか11名
  README.md         フォーマットの説明
scripts/
  build-agents.mjs  .agents/*.md → src/generated/agents.ts に変換
src/
  app/              画面とAPI（Next.js App Router）
    api/run/        SSEでオフィスの動きを配信する
  lib/
    orchestrator.ts 分解 → 並列実行 → 統合の本体
    anthropic.ts    Claude Fable 5 のラッパー
    company.ts      全社員に共通で差し込む会社コンテキスト
  components/       オフィス・社員レール・チャット・実況・成果物モニター
    Office3D.tsx    3Dシーンを載せるReact側の器
  lib/three-office/ 素のthree.jsで組んだ3Dオフィス本体（build=造作 / runtime=動き）
```

3D描画は素のthree.jsです（React Three Fiberは Next 16 との相性問題があり不採用）。

社員を増やすときは `.agents/` に `.md` を1つ足すだけです。ルーティングやUIの登録作業はありません。
書式は `.agents/README.md` を参照してください。

## ⚙️ 動き方

画面上部のフェーズは 受領 → 分解 → 実行 → 反証・校閲 → 報告 と進みます。

```
社長の指示
  └─ PM が分解（構造化出力でタスク一覧を作る）
       ├─ wave 1: 担当社員を並列実行（各自が独立したコンテキストで走る）
       ├─ wave 2: wave 1 の全成果を受け取ってから走る（反証・校閲はここ）
       └─ PM が統合して社長に1本で報告
```

- 1人1タスク。同じ社員に2件は振りません
- 必要な人数だけ呼びます。挨拶や確定済みの質問ではPMが自分で答えます
- 調査を振ったら反証、社外に出る文章を作らせたら校閲が自動で wave 2 に入ります
- 資料・メール文面・デザインは成果物パネルにHTML/テキストとして出て、そのままダウンロードできます

## 💻 ローカルで動かす

```bash
git clone https://github.com/seto0615/hatenabase-ai-office.git
cd hatenabase-ai-office
npm install
echo 'ANTHROPIC_API_KEY=sk-ant-xxxx' > .env.local
npm run dev
```

http://localhost:3000 を開きます。

APIを使わずに動きだけ見たいときは http://localhost:3000/?demo=1 を開いてください。
台本を再生するデモモードで、トークンを一切消費しません。社内デモや画面録画に使えます。

## 💴 定額モード（ローカル・APIクレジット不要）

Claude Code のサブスクリプション（Pro/Max）を持っているマシンでは、APIの従量課金を使わずに動かせます。

```bash
npm run dev:local
```

- 社員の実行が Anthropic API ではなく、ローカルの `claude` CLI（ヘッドレス実行）に切り替わります
- 課金は Claude Code のプラン枠内。`ANTHROPIC_API_KEY` も不要です
- ヘッダーに「定額モード」のバッジが出ます。経費精算はトークン数のみ表示（$0.00）
- 制約: localhost 専用（Vercel上では常にAPIモード）／モデルは `OFFICE_CLI_MODEL` で指定（既定 opus）／Web検索は Claude Code の WebSearch で代替

使い分けの目安: 普段の実務はローカル定額モード、外から触る・人に見せるときは Vercel（従量 or `?demo=1`）。

## 🔑 環境変数

| 変数 | 必須 | 説明 |
|---|---|---|
| `ANTHROPIC_API_KEY` | ✅ | https://console.anthropic.com/settings/keys で発行。サーバー側でのみ使い、ブラウザには渡りません |

> [!IMPORTANT]
> Claude Fable 5 は組織のデータ保持設定が30日以上であることが前提です。
> ゼロデータ保持（ZDR）の組織では全リクエストが 400 になります。

## 🧠 モデルの扱い

全社員が `claude-fable-5` で動きます。Fable 5 固有の作法をコードに織り込んであります。

- 思考は常時ON。`thinking` パラメータは渡しません（渡すと 400 になります）
- `temperature` / `top_p` / `top_k` は使いません
- 思考の深さは `output_config.effort` で制御します。社員ごとに `.agents/*.md` の `effort` で設定
- 安全性分類器が応答を拒否した場合に備え、`fallbacks` で Claude Opus 4.8 に自動退避します
- Web検索は `web_search` / `web_fetch` のサーバーサイドツール。`pause_turn` の継続にも対応しています

社員ごとにモデルを変えたい場合は `.agents/*.md` の `model` を書き換えてください。

## 🚧 いまできないこと

このシステムはブラウザ上で動くため、以下にはアクセスできません。

- Slack / Gmail / Googleドライブ / freee / kintone / カレンダー / GitHub
- ローカルファイル、社内リポジトリ

したがって送信・登録・保存といった実行系アクションは行いません。成果物は作るところまでです。
これらを繋ぐ場合は `src/lib/anthropic.ts` のツール定義にMCPサーバーやカスタムツールを追加する形になります。

> [!NOTE]
> Vercel の関数実行時間の上限に達すると処理が途中で切れます。`src/app/api/run/route.ts` の
> `maxDuration` を環境のプランに合わせて調整してください（既定は300秒）。
> 重い依頼が切れる場合は、`.agents/*.md` の `effort` を `medium` へ下げるのが最初の一手です。

## 📄 ライセンス

MIT
