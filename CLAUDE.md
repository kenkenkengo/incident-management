# 大事なルール
こちらから指示があるまで実装、修正は行わず、提案に留めること。

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Generosity Incident Management — a monorepo with separate `backend/` and `frontend/` directories (each has its own `package.json` and `node_modules`).

## Architecture

### Backend (`backend/`)

- **Infrastructure**: SST v4 (Ion) deploying to AWS — config in `sst.config.ts`
- **Database**: DynamoDB（`RunbookTable`, `IncidentTable`）— ランブック・インシデント管理に使用
- **Runtime**: Hono web framework on AWS Lambda via API Gateway V2 (`src/index.ts`)
- **Auth**: AWS Cognito UserPool with email-based usernames, SRP + password auth flows
- **AWS SDKs**: Cognito Identity Provider, S3, S3 presigner, Bedrock Runtime
- **Slack Bot**: @slack/bolt on separate Lambda — `/incident` slash command + message event recording
- **Validation**: Zod v4
- **Build**: esbuild bundling to `dist/index.js` (target: node20)
- **SST resources** are linked to the Lambda function (UserPool, client) and accessed via `sst` module's `Resource`

### Frontend (`frontend/`)

- **Framework**: Vue 3 with Composition API (`<script setup lang="ts">`)
- **State**: Pinia (composition store style — `defineStore` with `ref`/`computed`)
- **Routing**: Vue Router 5 with `createWebHistory`
- **Build**: Vite 7
- **Linting/Formatting**: Biome 2 — **tabs for indentation, double quotes**
- **Testing**: Vitest with jsdom environment, `@vue/test-utils`
- **Path alias**: `@/` maps to `./src/`

### Shared Patterns

- API responses use `{ success, data?, error? }` format (see `backend/src/lib/api-response.ts`)
- Types use `readonly` properties for immutability (see `backend/src/auth/auth.types.ts`)

## Key Files

### Backend
- `backend/src/index.ts` — Hono app エントリポイント（routes, error handler）
- `backend/src/auth/auth.routes.ts` — 認証エンドポイント（signin, refresh）
- `backend/src/auth/auth.service.ts` — Cognito 呼び出しロジック
- `backend/src/auth/auth.validators.ts` — Zod バリデーションスキーマ（signIn, refreshToken）
- `backend/src/lib/api-response.ts` — 共通レスポンスヘルパー
- `backend/src/lib/cognito.client.ts` — Cognito クライアントシングルトン
- `backend/src/middleware/error-handler.middleware.ts` — グローバルエラーハンドラー
- `backend/sst.config.ts` — AWS インフラ定義（StaticSite, UserPool, ApiGatewayV2, DynamoDB）
- `backend/src/runbook/runbook.routes.ts` — ランブック CRUD エンドポイント
- `backend/src/runbook/runbook.repository.ts` — DynamoDB アクセス層
- `backend/src/runbook/runbook.types.ts` — ランブック型定義
- `backend/src/runbook/runbook.validators.ts` — Zod バリデーションスキーマ（runbook）
- `backend/src/incident/incident.types.ts` — インシデント型定義（Incident, IncidentMessage, Postmortem）
- `backend/src/incident/incident.repository.ts` — IncidentTable DynamoDB アクセス層（単一テーブル設計: METADATA/MSG#/POSTMORTEM）
- `backend/src/incident/incident.routes.ts` — インシデント REST API エンドポイント
- `backend/src/incident/incident.commands.ts` — Slack `/incident` コマンドハンドラー
- `backend/src/incident/postmortem.service.ts` — AWS Bedrock によるポストモーテム自動生成
- `backend/src/slack/slack.handler.ts` — Slack Bolt Lambda ハンドラー
- `backend/src/slack/message.events.ts` — Slack メッセージイベント記録

### Frontend
- `frontend/src/main.ts` — Vue app ブートストラップ
- `frontend/src/App.vue` — ルートコンポーネント
- `frontend/src/router/index.ts` — Vue Router 設定（SignIn, Dashboard + 認証ガード）
- `frontend/src/view/SignIn.vue` — サインインページ（auth store 連携済み）
- `frontend/src/view/Dashboard.vue` — ダッシュボードページ
- `frontend/src/components/CommonHeader.vue` — 共通ヘッダー（ナビ + サインアウト）
- `frontend/src/lib/api-client.ts` — API クライアント（signIn, refreshTokens）
- `frontend/src/stores/auth.ts` — 認証 Pinia ストア（localStorage 永続化）
- `frontend/biome.json` — Biome v2 リンター/フォーマッター設定
- `frontend/src/view/RunbookList.vue` — ランブック一覧ページ
- `frontend/src/view/RunbookDetail.vue` — ランブック詳細ページ（Markdown レンダリング）
- `frontend/src/view/RunbookForm.vue` — ランブック作成/編集フォーム
- `frontend/src/components/TagInput.vue` — タグ入力コンポーネント（予測変換付き）
- `frontend/src/view/IncidentList.vue` — インシデント一覧ページ（active/closed フィルタ）
- `frontend/src/view/IncidentDetail.vue` — インシデント詳細ページ（メッセージタイムライン + ポストモーテム生成/表示）

## API Routes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/signin` | Public | メール/パスワードでサインイン |
| POST | `/auth/refresh` | Public | リフレッシュトークンでトークン更新 |
| GET | `/` | Public | ヘルスチェック |
| GET | `/api/me` | JWT | 認証済みユーザー情報取得（sub, email） |
| * | `$default` | JWT | その他のルート（Cognito JWT 認証必須） |
| GET | `/runbooks` | JWT | ランブック一覧取得（`?tag=xxx` フィルタ可能） |
| POST | `/runbooks` | JWT | ランブック作成 |
| GET | `/runbooks/tags` | JWT | 全タグ一覧取得 |
| GET | `/runbooks/:id` | JWT | ランブック詳細取得 |
| PUT | `/runbooks/:id` | JWT | ランブック更新 |
| DELETE | `/runbooks/:id` | JWT | ランブック削除 |
| GET | `/incidents` | JWT | インシデント一覧（`?status=active\|closed` フィルタ可） |
| GET | `/incidents/:id` | JWT | インシデント詳細取得 |
| GET | `/incidents/:id/messages` | JWT | メッセージ一覧（時系列） |
| POST | `/incidents/:id/postmortem` | JWT | ポストモーテム生成（Bedrock） |
| GET | `/incidents/:id/postmortem` | JWT | 保存済みポストモーテム取得 |
| POST | `/incidents/:id/generate-runbook` | JWT | ポストモーテムからランブック草案生成（Bedrock、保存はしない） |
| POST | `/slack/events` | Slack署名 | Slack Bot イベント受信（コマンド + メッセージ） |

## Commands

### Backend

```sh
cd backend
npm install
npm run dev          # SST dev mode (local Lambda emulation)
npm run build        # esbuild bundle
npm run deploy       # build → zip → update Lambda
npm run lint         # Biome check --write (auto-fix)
```

### Frontend

```sh
cd frontend
npm install
npm run dev          # Vite dev server
npm run build        # Type-check + Vite build
npm run test:unit    # Vitest (all tests)
npm run type-check   # vue-tsc
npm run lint         # Biome check --write (auto-fix)
```

Run a single test file:
```sh
cd frontend && npx vitest run src/__tests__/App.spec.ts
```

## Environment

### Prerequisites
- Node.js 20+ (frontend は `^20.19.0 || >=22.12.0`)
- SST CLI v4 (`npx sst` で自動インストール)
- AWS 認証情報が設定済みであること（`aws configure` or 環境変数）

### SST Resource Linking
バックエンドは `sst` モジュールの `Resource` 経由で AWS リソースにアクセスする。
`Resource.UserPool.id`, `Resource.Site.url` 等は **SST dev 環境でのみ利用可能**。
単体テストでは SST Resource のモックが必要。

## Code Style

### Frontend (Biome enforced)

- Indent with **tabs**
- **Double quotes** for strings
- Imports auto-organized by Biome

### Backend (Biome enforced)

- Indent with **tabs**
- **Double quotes** for strings
- Imports auto-organized by Biome
- ESM (`"type": "module"`)

## Gotchas

- **SST Resource は dev 環境専用**: `Resource.*` は `sst dev` 経由でのみ注入される。直接 `node src/index.ts` では動作しない
- **CORS はサイト URL に限定**: API Gateway レベルは `cors: false`、Hono ミドルウェアで `Resource.Site.url` のみを許可。新たな origin を追加する場合は `backend/src/index.ts` の cors 設定を変更する
- **バックエンドにテストなし**: 認証ロジックのテストは未実装。SST Resource のモックが課題
- **Vite proxy パターン**: フロントエンドの API クライアントは `/api/auth/signin` のようなパスを使用し、`vite.config.ts` のプロキシ設定が `/api` を `VITE_API_URL` に転送してパスプレフィックスを除去する
- **認証トークンは localStorage**: auth store が accessToken/refreshToken/email を localStorage に保存。ルーターの `beforeEach` ガードで認証チェックを実施
- **Cognito エラーマッピング**: `auth.routes.ts` で Cognito 例外名をユーザー向けメッセージに変換している
- **Slack Bot は別 Lambda**: `POST /slack/events` は独自の Lambda ハンドラー（`src/slack/slack.handler.ts`）で処理。JWT 認証なし、Slack 署名検証で保護
- **IncidentTable は単一テーブル設計**: PK=`INCIDENT#<id>`, SK=`METADATA`/`MSG#<ts>`/`POSTMORTEM` の3パターン
- **Bedrock モデル**: `openai.gpt-oss-safeguard-120b` を使用。Bedrock コンソールでモデルアクセスの事前有効化が必要
- **SST Secret**: Slack Bot Token/Signing Secret は `npx sst secret set SlackBotToken xoxb-...` で設定
