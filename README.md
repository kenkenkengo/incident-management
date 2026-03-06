# Generosity Incident Management

Slack 連携のインシデント管理システム。Slack Bot でインシデントの開始/終了・メッセージ記録を行い、Web アプリで閲覧・ポストモーテム自動生成ができる。

## アーキテクチャ

```
Slack                         AWS
  |                            |
  | /incident start            |
  | /incident end              |
  | message events             |
  |                            |
  +---> API Gateway V2 --------+---> Slack Lambda (Bolt)
                               |         |
                               |    IncidentTable (DynamoDB)
                               |         |
  Browser (Vue 3)              |    Hono Lambda <--- Bedrock (Postmortem)
  |                            |         |
  +---> API Gateway V2 --------+---------+
        (JWT auth)
```

| コンポーネント | 技術スタック |
|---|---|
| Backend | SST v4, Hono, AWS Lambda, DynamoDB, Cognito, Bedrock |
| Slack Bot | @slack/bolt on 別 Lambda |
| Frontend | Vue 3, Pinia, Vue Router, Vite 7 |

## 前提条件

- **Node.js** 20+ (frontend は `^20.19.0 || >=22.12.0`)
- **AWS CLI** が設定済み (`aws configure` or 環境変数)
- **Slack ワークスペース** の管理者権限（Slack App 作成用）

## セットアップ

### 1. リポジトリのクローンと依存関係のインストール

```sh
git clone <repository-url>
cd generosity-incident-management

# backend と frontend それぞれにインストール
cd backend && npm install
cd ../frontend && npm install
cd ..
```

### 2. AWS 認証情報の確認

SST は AWS の認証情報を使ってデプロイする。以下のいずれかが必要:

```sh
# 方法 A: AWS CLI のプロファイル
aws configure

# 方法 B: 環境変数
export AWS_ACCESS_KEY_ID=xxx
export AWS_SECRET_ACCESS_KEY=xxx
export AWS_REGION=ap-northeast-1
```

### 3. SST Secret の設定

SST Secret は暗号化されて AWS に保存される。**コードにシークレットを含めてはいけない。**

```sh
cd backend

# Slack Bot Token (xoxb- で始まる)
npx sst secret set SlackBotToken xoxb-xxxx-xxxx-xxxx

# Slack Signing Secret
npx sst secret set SlackSigningSecret xxxxxxxxxxxxxxxx
```

> Secret の取得方法は後述の「[Slack App の作成](#4-slack-app-の作成)」を参照。

### 4. Slack App の作成

1. https://api.slack.com/apps にアクセスし「Create New App」→「From scratch」
2. App 名とワークスペースを選択して作成

#### OAuth & Permissions

以下の **Bot Token Scopes** を追加:

| スコープ | 用途 |
|---|---|
| `chat:write` | ボットがメッセージを送信 |
| `channels:history` | パブリックチャンネルのメッセージを読み取り |
| `commands` | スラッシュコマンドの登録 |
| `users:read` | ユーザー名の取得 |

設定後「Install to Workspace」でインストールし、表示される **Bot User OAuth Token** (`xoxb-...`) をコピー。

#### Slash Commands

| コマンド | Request URL | 説明 |
|---|---|---|
| `/incident` | `https://<API_URL>/slack/events` | インシデント開始/終了 |

> Request URL は `npx sst dev` 実行後に表示される API Gateway の URL を使用。

#### Event Subscriptions

1. 「Enable Events」を ON にする
2. **Request URL** に `https://<API_URL>/slack/events` を設定（Bolt が URL verification を自動処理）
3. **Subscribe to bot events** に以下を追加:
   - `message.channels` — パブリックチャンネルのメッセージ

#### 取得するシークレット

| 値 | 場所 | SST Secret 名 |
|---|---|---|
| Bot User OAuth Token | OAuth & Permissions ページ | `SlackBotToken` |
| Signing Secret | Basic Information → App Credentials | `SlackSigningSecret` |

### 5. AWS Bedrock モデルアクセスの有効化（ポストモーテム機能用）

1. AWS コンソール → Amazon Bedrock → Model access
2. `openai.gpt-oss-safeguard-120b`（または `openai.gpt-oss-safeguard-20b`）のアクセスをリクエスト
3. アクセスが承認されるまで待機（通常は即時）

> テスト時は 20B モデルを使うとコストを抑えられる。モデル変更は `backend/src/incident/postmortem.service.ts` の `MODEL_ID` を編集。

### 6. Cognito ユーザーの作成

Web アプリのログインには Cognito ユーザーが必要。SST dev 起動後、AWS CLI で作成する:

```sh
# ユーザー作成
aws cognito-idp admin-create-user \
  --user-pool-id <UserPoolId> \
  --username user@example.com \
  --user-attributes Name=email,Value=user@example.com \
  --temporary-password 'TempPass123!'

# パスワードを確定（FORCE_CHANGE_PASSWORD 状態を解除）
aws cognito-idp admin-set-user-password \
  --user-pool-id <UserPoolId> \
  --username user@example.com \
  --password 'YourPassword123!' \
  --permanent
```

> `<UserPoolId>` は `npx sst dev` の出力、または AWS コンソール → Cognito で確認。

## 開発サーバーの起動

ターミナルを2つ使う:

```sh
# ターミナル 1: バックエンド (SST dev)
cd backend
npx sst dev

# ターミナル 2: フロントエンド (Vite)
cd frontend
npm run dev
```

- フロントエンド: http://localhost:5173
- バックエンド API: SST dev が出力する API Gateway URL
- Vite のプロキシ設定により `/api/*` リクエストは自動的にバックエンドに転送される

### Slack の Request URL を設定

`npx sst dev` の出力に表示される API URL を確認し、Slack App の以下に設定:

- Slash Commands の Request URL: `https://<API_URL>/slack/events`
- Event Subscriptions の Request URL: `https://<API_URL>/slack/events`

## 使い方

### Slack でのインシデント管理

```
/incident start DB接続障害      # インシデント開始（チャンネルのメッセージ記録が始まる）
/incident end                    # インシデント終了（記録停止）
```

- 1チャンネルにつき同時に1つのアクティブインシデントのみ
- ボット自身のメッセージは記録されない

### Web アプリでの閲覧

1. http://localhost:5173 にアクセス
2. Cognito ユーザーでサインイン
3. ヘッダーの「Incidents」からインシデント一覧を表示
4. インシデントをクリックして詳細・メッセージタイムラインを確認
5. closed インシデントでは「ポストモーテムを生成」ボタンで AI によるポストモーテムを自動生成

## コマンド一覧

### Backend

```sh
cd backend
npm install          # 依存関係インストール
npx sst dev         # ローカル開発サーバー
npm run build       # esbuild バンドル
npm run lint        # Biome (auto-fix)
```

### Frontend

```sh
cd frontend
npm install          # 依存関係インストール
npm run dev         # Vite 開発サーバー
npm run build       # 型チェック + ビルド
npm run test:unit   # Vitest
npm run type-check  # vue-tsc
npm run lint        # Biome (auto-fix)
```

## API エンドポイント

### 認証 (Public)

| Method | Path | 説明 |
|---|---|---|
| POST | `/auth/signin` | サインイン |
| POST | `/auth/refresh` | トークンリフレッシュ |

### ランブック (JWT 認証)

| Method | Path | 説明 |
|---|---|---|
| GET | `/runbooks` | 一覧（`?tag=xxx` フィルタ可） |
| POST | `/runbooks` | 作成 |
| GET | `/runbooks/tags` | 全タグ一覧 |
| GET | `/runbooks/:id` | 詳細 |
| PUT | `/runbooks/:id` | 更新 |
| DELETE | `/runbooks/:id` | 削除 |

### インシデント (JWT 認証)

| Method | Path | 説明 |
|---|---|---|
| GET | `/incidents` | 一覧（`?status=active\|closed` フィルタ可） |
| GET | `/incidents/:id` | 詳細 |
| GET | `/incidents/:id/messages` | メッセージ一覧（時系列） |
| POST | `/incidents/:id/postmortem` | ポストモーテム生成 |
| GET | `/incidents/:id/postmortem` | 保存済みポストモーテム取得 |
| POST | `/incidents/:id/generate-runbook` | ポストモーテムからランブック草案生成 |

### Slack (署名検証)

| Method | Path | 説明 |
|---|---|---|
| POST | `/slack/events` | Slack イベント受信 |

## DynamoDB テーブル設計

### RunbookTable

シンプルな `id` をキーとしたテーブル。

### IncidentTable (単一テーブル設計)

| PK | SK | 用途 |
|---|---|---|
| `INCIDENT#<id>` | `METADATA` | インシデント本体 |
| `INCIDENT#<id>` | `MSG#<messageTs>` | メッセージ（時系列順） |
| `INCIDENT#<id>` | `POSTMORTEM` | 生成されたポストモーテム |

## トラブルシューティング

### `Resource.* is not defined`

SST dev 経由でないと Resource が注入されない。必ず `npx sst dev` で起動すること。

### Slack の URL verification が失敗する

- `npx sst dev` が起動していることを確認
- Request URL が正しいことを確認（末尾に `/slack/events`）
- SST Secret (`SlackBotToken`, `SlackSigningSecret`) が設定済みであることを確認

### ポストモーテム生成がタイムアウトする

120B モデルは推論に時間がかかる場合がある。`backend/src/incident/postmortem.service.ts` の `MODEL_ID` を `openai.gpt-oss-safeguard-20b` に変更して試す。

### Cognito の `FORCE_CHANGE_PASSWORD` エラー

`admin-set-user-password` コマンドで `--permanent` フラグを付けてパスワードを確定する。

## プロジェクト構成

```
generosity-incident-management/
├── backend/
│   ├── sst.config.ts              # SST インフラ定義
│   ├── src/
│   │   ├── index.ts               # Hono エントリポイント
│   │   ├── auth/                   # 認証 (Cognito)
│   │   ├── runbook/                # ランブック CRUD
│   │   ├── incident/               # インシデント管理
│   │   │   ├── incident.types.ts
│   │   │   ├── incident.repository.ts
│   │   │   ├── incident.routes.ts
│   │   │   ├── incident.commands.ts
│   │   │   └── postmortem.service.ts
│   │   ├── slack/                  # Slack Bot
│   │   │   ├── slack.handler.ts
│   │   │   └── message.events.ts
│   │   ├── lib/                    # 共通ユーティリティ
│   │   └── middleware/             # ミドルウェア
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── view/                   # ページコンポーネント
│   │   ├── components/             # 共通コンポーネント
│   │   ├── stores/                 # Pinia ストア
│   │   ├── lib/                    # API クライアント
│   │   └── router/                 # Vue Router
│   └── package.json
├── CLAUDE.md                       # Claude Code 用プロジェクト設定
└── README.md                       # このファイル
```
