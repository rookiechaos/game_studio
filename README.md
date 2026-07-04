# Game Studio

Japan-focused framework for generating game-style marketing campaigns.

| | |
|---|---|
| **English** | [Overview](#english) · [Setup](#setup-english) · [CLI](#cli-english) · [UI](#ui-english) · [Upload](#upload-english) |
| **日本語** | [概要](#japanese) · [セットアップ](#setup-japanese) · [CLI](#cli-japanese) · [UI](#ui-japanese) · [アップロード](#upload-japanese) |

---

<a id="english"></a>

## English

### What this is

Game Studio is a **Python CLI pipeline** plus a **Next.js operator console** for Japan-market campaign games (quiz campaigns, landing pages, ops docs, and handoff artifacts).

Typical flow:

1. **Intake** — describe the campaign (CLI `--brief` or UI form).
2. **Qualify** — LLM gate decides GO / NO-GO and recommends a package.
3. **Negotiate** — LLM fills `game_requirements.json` (Japanese prompts).
4. **Plan** — LLM writes design docs and `game_plan.json`.
5. **Code** — materializes scaffold + generated assets under the workspace.
6. **Validate** — structural and LLM validation; verdict under `runs/`.

Output lands in **`source_pack/workspaces/<customer-id>/`**.

### Repository layout

```
game_studio/
├── README.md                 # This file (EN / JA)
├── pyproject.toml            # Python package (install from repo root)
├── scripts/check-languages.mjs
├── .github/workflows/ci.yml
├── do-not-upload/            # Local-only artifacts — do NOT upload (see below)
└── source_pack/
    ├── runtime/python/       # smbagent CLI + templates + prompts
    ├── ui/                     # Next.js operator console
    ├── workspaces/           # Generated output (gitignored except README)
    ├── docs/                   # Deployment guides
    └── examples/               # Sample workspace layout
```

### Requirements

| Tool | Version |
|------|---------|
| Python | 3.11+ |
| Node.js | 20+ |
| Anthropic API key | Required for qualify / negotiate / plan / validate LLM stages |

Structural-only commands (`doctor`, `new`, `game-template`, `check-game-structure`) work **without** an API key.

### Supported languages

This repository supports **English and Japanese only** (no other locales).

| Area | Language |
|------|----------|
| Operator UI | Toggle **English / 日本語**, or set `GAME_STUDIO_UI_LOCALE=en\|ja` |
| Qualify / negotiate prompts | Japanese |
| Plan / validation prompts | English |
| Generated campaign copy | Japanese-first (Japan market) |

<a id="setup-english"></a>

### Setup

From the **repository root**:

```bash
# 1. Python runtime
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -e .

# 2. Verify
python -m smbagent.cli doctor

# 3. Operator UI
cd source_pack/ui
cp .env.example .env.local
npm ci
npm run dev
```

Open **http://localhost:3000**.

If you previously moved local deps into `do-not-upload/`, recreate the venv and run `npm ci` as above (see `do-not-upload/README.md`).

<a id="cli-english"></a>

### CLI

All commands run from the repo root with the venv active:

```bash
python -m smbagent.cli <command> ...
# or, after install:
game-studio <command> ...
```

#### Common commands

| Command | Purpose | API key |
|---------|---------|---------|
| `doctor` | Check Python, templates, workspace dir | No |
| `new <id>` | Create empty workspace | No |
| `qualify-game <id> --brief "..."` | Qualification gate → `game_qualification.json` | Yes |
| `negotiate-game <id>` | Requirements → `game_requirements.json` | Yes |
| `plan-game <id>` | Design plan → `game_plan.json`, `game_design.md` | Yes |
| `run-game <id> --brief "..."` | Full pipeline (see below) | Yes |
| `status-game <id>` | Show which artifacts exist | No |
| `game-template list` | List scaffolds | No |
| `game-template materialize campaign-quiz --customer <id>` | Copy scaffold into workspace | No |
| `check-game-structure <id>` | Structural checks on `code/` | No |
| `validate-game <id>` | LLM validation round | Yes |

#### Examples

```bash
# Create workspace and run qualification
python -m smbagent.cli new demo-campaign
python -m smbagent.cli qualify-game demo-campaign \
  --brief "春のクイズキャンペーン"

# Full pipeline (qualify → negotiate → plan → code → validate)
export ANTHROPIC_API_KEY=sk-...
python -m smbagent.cli run-game demo-campaign \
  --brief "春のクイズキャンペーン"

# No LLM — scaffold + structure check only
python -m smbagent.cli game-template materialize campaign-quiz \
  --customer demo-campaign
python -m smbagent.cli check-game-structure demo-campaign --package campaign
```

Default workspace directory: **`source_pack/workspaces/`** (override with `GAME_STUDIO_WORKSPACE_ROOT`).

<a id="ui-english"></a>

### Operator UI

The UI collects intake, writes artifacts into the workspace, previews state, and optionally invokes the CLI.

| Setting (`.env.local`) | Default | Meaning |
|------------------------|---------|---------|
| `GAME_STUDIO_RUNTIME_MODE` | `artifact-only` | Write intake files only; no CLI subprocess |
| | `bundled-cli` | Enable **Plan / Run** buttons that call the Python CLI |
| `GAME_STUDIO_WORKSPACE_ROOT` | `../workspaces` | Same as CLI default (relative to `source_pack/ui/`) |
| `GAME_STUDIO_RUNTIME_ROOT` | `../runtime/python` | Python package path for bundled mode |
| `GAME_STUDIO_UI_LOCALE` | `ja` | Server-side UI strings: `en` or `ja` |
| `ANTHROPIC_API_KEY` | — | Required when using bundled-cli LLM stages |

While a run is in progress, the UI **polls status every 4 seconds**.

**Note:** The UI has no authentication — use on a trusted network only.

<a id="upload-english"></a>

### Upload to GitHub

**Upload everything except `do-not-upload/`.**

That folder holds local-only files (~470 MB): `.venv`, `node_modules`, `.next`, egg-info, caches. See `do-not-upload/README.md`.

Pre-upload checks:

```bash
node scripts/check-languages.mjs
cd source_pack/ui && npm ci && npm run typecheck
pip install -e . && python -m smbagent.cli doctor
```

CI (`.github/workflows/ci.yml`) runs language check, Python doctor, and UI typecheck on push/PR to `main` or `master`.

### License

MIT — see [LICENSE](LICENSE).

Further reading: [source_pack/docs/deployment_guide.md](source_pack/docs/deployment_guide.md).

---

<a id="japanese"></a>

## 日本語

### 概要

Game Studio は、**日本市場向けゲーム型マーケティングキャンペーン**（クイズ、LP、運用ドキュメント、引き渡し成果物）を生成するための **Python CLI** と **Next.js オペレーター UI** です。

典型的な流れ:

1. **インテーク** — キャンペーン概要を入力（CLI の `--brief` または UI フォーム）。
2. **Qualify** — LLM が GO / NO-GO を判定し、パッケージを推奨。
3. **Negotiate** — LLM が `game_requirements.json` を作成（日本語プロンプト）。
4. **Plan** — LLM が設計書と `game_plan.json` を出力。
5. **Code** — ワークスペースに scaffold と生成物を配置。
6. **Validate** — 構造チェックと LLM 検証。結果は `runs/` 配下。

成果物の出力先: **`source_pack/workspaces/<customer-id>/`**

### リポジトリ構成

```
game_studio/
├── README.md                 # 本ファイル（英語 / 日本語）
├── pyproject.toml            # Python パッケージ（リポジトリルートから install）
├── scripts/check-languages.mjs
├── .github/workflows/ci.yml
├── do-not-upload/            # ローカル専用 — アップロードしない（下記参照）
└── source_pack/
    ├── runtime/python/       # smbagent CLI + テンプレート + プロンプト
    ├── ui/                     # Next.js オペレーター UI
    ├── workspaces/           # 生成物（README 以外は gitignore）
    ├── docs/                   # デプロイガイド
    └── examples/               # ワークスペース例
```

### 動作要件

| ツール | バージョン |
|--------|------------|
| Python | 3.11 以上 |
| Node.js | 20 以上 |
| Anthropic API キー | qualify / negotiate / plan / validate に必要 |

構造チェックのみのコマンド（`doctor`、`new`、`game-template`、`check-game-structure`）は **API キー不要** です。

### 対応言語

本リポジトリは **英語と日本語のみ** 対応（他言語は不可）。

| 領域 | 言語 |
|------|------|
| オペレーター UI | **English / 日本語** 切替、または `GAME_STUDIO_UI_LOCALE=en\|ja` |
| Qualify / negotiate プロンプト | 日本語 |
| Plan / validation プロンプト | 英語 |
| 生成キャンペーン文案 | 日本語優先（日本市場向け） |

<a id="setup-japanese"></a>

### セットアップ

**リポジトリルート** から:

```bash
# 1. Python ランタイム
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -e .

# 2. 動作確認
python -m smbagent.cli doctor

# 3. オペレーター UI
cd source_pack/ui
cp .env.example .env.local
npm ci
npm run dev
```

ブラウザで **http://localhost:3000** を開きます。

以前 `do-not-upload/` に依存関係を移した場合は、上記手順で venv と `npm ci` を再実行してください（`do-not-upload/README.md` 参照）。

<a id="cli-japanese"></a>

### CLI

venv を有効化した状態で、リポジトリルートから実行:

```bash
python -m smbagent.cli <command> ...
# または install 後:
game-studio <command> ...
```

#### 主要コマンド

| コマンド | 用途 | API キー |
|----------|------|----------|
| `doctor` | Python・テンプレート・workspace 確認 | 不要 |
| `new <id>` | 空ワークスペース作成 | 不要 |
| `qualify-game <id> --brief "..."` | 適合判定 → `game_qualification.json` | 必要 |
| `negotiate-game <id>` | 要件 → `game_requirements.json` | 必要 |
| `plan-game <id>` | 設計 → `game_plan.json`, `game_design.md` | 必要 |
| `run-game <id> --brief "..."` | フルパイプライン（下記） | 必要 |
| `status-game <id>` | 成果物の有無を表示 | 不要 |
| `game-template list` | scaffold 一覧 | 不要 |
| `game-template materialize campaign-quiz --customer <id>` | scaffold を workspace に配置 | 不要 |
| `check-game-structure <id>` | `code/` の構造チェック | 不要 |
| `validate-game <id>` | LLM 検証ラウンド | 必要 |

#### 使用例

```bash
# ワークスペース作成と qualification
python -m smbagent.cli new demo-campaign
python -m smbagent.cli qualify-game demo-campaign \
  --brief "春のクイズキャンペーン"

# フルパイプライン（qualify → negotiate → plan → code → validate）
export ANTHROPIC_API_KEY=sk-...
python -m smbagent.cli run-game demo-campaign \
  --brief "春のクイズキャンペーン"

# LLM なし — scaffold + 構造チェックのみ
python -m smbagent.cli game-template materialize campaign-quiz \
  --customer demo-campaign
python -m smbagent.cli check-game-structure demo-campaign --package campaign
```

デフォルト workspace: **`source_pack/workspaces/`**（`GAME_STUDIO_WORKSPACE_ROOT` で変更可）。

<a id="ui-japanese"></a>

### オペレーター UI

UI はインテーク収集、workspace への成果物書き込み、状態プレビュー、CLI の任意実行を行います。

| 設定（`.env.local`） | デフォルト | 意味 |
|----------------------|------------|------|
| `GAME_STUDIO_RUNTIME_MODE` | `artifact-only` | インテークファイルのみ書き込み（CLI 非起動） |
| | `bundled-cli` | **Plan / Run** ボタンで Python CLI を実行 |
| `GAME_STUDIO_WORKSPACE_ROOT` | `../workspaces` | CLI と同じデフォルト（`source_pack/ui/` 相対） |
| `GAME_STUDIO_RUNTIME_ROOT` | `../runtime/python` | bundled モード時の Python パス |
| `GAME_STUDIO_UI_LOCALE` | `ja` | サーバー側 UI 文言: `en` または `ja` |
| `ANTHROPIC_API_KEY` | — | bundled-cli の LLM 段階で必要 |

実行中は UI が **4 秒ごとにステータスを自動取得** します。

**注意:** UI に認証はありません。信頼できるネットワーク内でのみ使用してください。

<a id="upload-japanese"></a>

### GitHub へのアップロード

**`do-not-upload/` 以外をすべてアップロード** してください。

このフォルダにはローカル専用ファイル（約 470 MB）が入ります: `.venv`、`node_modules`、`.next`、egg-info、キャッシュ等。詳細は `do-not-upload/README.md`。

アップロード前チェック:

```bash
node scripts/check-languages.mjs
cd source_pack/ui && npm ci && npm run typecheck
pip install -e . && python -m smbagent.cli doctor
```

CI（`.github/workflows/ci.yml`）は `main` / `master` への push / PR で言語チェック、Python doctor、UI typecheck を実行します。

### ライセンス

MIT — [LICENSE](LICENSE) を参照。

詳細: [source_pack/docs/deployment_guide.md](source_pack/docs/deployment_guide.md)
