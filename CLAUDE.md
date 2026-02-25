# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Generosity Incident Management — a monorepo with separate `backend/` and `frontend/` directories (each has its own `package.json` and `node_modules`).

## Architecture

### Backend (`backend/`)

- **Infrastructure**: SST v4 (Ion) deploying to AWS — config in `sst.config.ts`
- **Runtime**: Hono web framework on AWS Lambda via Function URL (`src/index.ts`)
- **Auth**: AWS Cognito UserPool with email-based usernames, SRP + password auth flows
- **AWS SDKs**: Cognito Identity Provider, S3, S3 presigner
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
- `backend/src/index.ts` — Hono app エントリポイント（CORS, routes, error handler）
- `backend/src/auth/auth.routes.ts` — 認証エンドポイント（signin, refresh）
- `backend/src/auth/auth.service.ts` — Cognito 呼び出しロジック
- `backend/src/lib/api-response.ts` — 共通レスポンスヘルパー
- `backend/sst.config.ts` — AWS インフラ定義（StaticSite, UserPool, ApiGateway）

### Frontend
- `frontend/src/main.ts` — Vue app ブートストラップ
- `frontend/src/App.vue` — ルートコンポーネント
- `frontend/src/router/index.ts` — Vue Router 設定（現在 routes 未定義）
- `frontend/src/view/SignIn.vue` — サインインページ（スタブ）
- `frontend/biome.json` — Biome v2 リンター/フォーマッター設定

## API Routes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/signin` | Public | メール/パスワードでサインイン |
| POST | `/auth/refresh` | Public | リフレッシュトークンでトークン更新 |
| GET | `/` | Public | ヘルスチェック |
| * | `$default` | JWT | その他のルート（Cognito JWT 認証必須） |

## Commands

### Backend

```sh
cd backend
npm install
npm run dev          # SST dev mode (local Lambda emulation)
npm run build        # esbuild bundle
npm run deploy       # build → zip → update Lambda
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
`Resource.UserPool.id`, `Resource.Web.id` 等は **SST dev 環境でのみ利用可能**。
単体テストでは SST Resource のモックが必要。

## Code Style

### Frontend (Biome enforced)

- Indent with **tabs**
- **Double quotes** for strings
- Imports auto-organized by Biome

### Backend

- Standard TypeScript style (spaces, single quotes in existing code)
- ESM (`"type": "module"`)

## Gotchas

- **SST Resource は dev 環境専用**: `Resource.*` は `sst dev` 経由でのみ注入される。直接 `node src/index.ts` では動作しない
- **CORS が全開放**: `backend/src/index.ts` で `origin: '*'` — 本番では制限が必要
- **バックエンドにテストなし**: 認証ロジックのテストは未実装。SST Resource のモックが課題
- **フロントエンドの routes が空**: `frontend/src/router/index.ts` に routes が未定義。SignIn.vue は未接続
- **Cognito エラーマッピング**: `auth.routes.ts` で Cognito 例外名をユーザー向けメッセージに変換している
