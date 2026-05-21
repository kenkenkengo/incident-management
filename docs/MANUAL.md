# Generosity Incident Management マニュアル

Slack 連携のインシデント管理システム。Slack 上でのインシデント宣言から、対応中の自動記録、AI による振り返り（ポストモーテム）、再発防止のランブック化までを一貫して扱う。

本書は **利用編**（運用担当者向け）と **管理編**（セットアップ・運用管理者向け）の二部構成。

---

## 目次

1. [アプリ概要](#1-アプリ概要)
2. [利用編 — 運用フロー](#2-利用編--運用フロー)
   - 2.1 全体フロー
   - 2.2 登場人物
   - 2.3 サインイン
   - 2.4 平常時：ランブックを育てる
   - 2.5 検知：インシデントを起こす
   - 2.6 対応中：会話＝記録
   - 2.7 収束：インシデントを閉じる
   - 2.8 振り返り：ポストモーテム
   - 2.9 知見化：ランブックへ
   - 2.10 モニタリング：ダッシュボード
   - 2.11 運用 Tips
3. [管理編 — セットアップ](#3-管理編--セットアップ)
4. [参考資料](#4-参考資料)

---

## 1. アプリ概要

### これは何？

- Slack でのやり取りをそのままインシデント記録にする運用ツール
- 起票すると専用チャンネルが自動生成され、以降の発言が時系列で記録される
- インシデント終了後は AI が自動でポストモーテムを生成
- ポストモーテムからランブック草案を AI が作成し、編集フォームに自動投入
- 蓄積したランブックは Web で検索・参照、起票時に Bot が関連ランブックを自動提示

### 主要機能

| 機能 | 場所 | 概要 |
|---|---|---|
| インシデント起票 | Slack | `/incident start` → モーダル入力 → 専用 ch 自動生成 |
| メッセージ自動記録 | Slack | 専用チャンネルの発言を自動保存 |
| ステータス更新 | Slack | `/incident status` で 4 段階の状態を共有 |
| インシデント終了 | Slack | `/incident end` → モーダルで解決方法を入力 |
| 自動リマインド | Slack | 2 時間 / 24 時間の無更新を Bot が通知 |
| インシデント一覧・詳細 | Web | All / Active / Closed のタブ切替、タイムライン表示 |
| ポストモーテム生成 | Web | AWS Bedrock による AI 生成・再生成 |
| ランブック草案生成 | Web | PM から AI 草案、編集フォームに自動投入 |
| ランブック CRUD | Web | Markdown + タグ、目次付きプレビュー |
| ダッシュボード | Web | アクティブ件数・PM 未作成リマインド・統計・最近のランブック |

### アーキテクチャ

```
[ Browser (Vue 3) ]
        │
        ▼
┌──────────────────────────────────────────┐
│ CloudFront (StaticSite)                  │
│  ├─ /        → Vue ビルド成果物          │
│  └─ /api/*   → API Gateway へプロキシ    │
│                (x-origin-verify ヘッダー付加)│
└────────────┬─────────────────────────────┘
             │
             ▼
[ Slack ] ──► [ API Gateway V2 ]
             │  ├─ POST /slack/events     → Slack Lambda (Bolt)
             │  ├─ POST /api/auth/*       → originAuthorizer 経由
             │  └─ /api/{proxy+} ($default) → CognitoAuthorizer 経由
             │                              ↓
             │                         [ Hono Lambda ] ──► Bedrock
             │                              ↓                (PM / Runbook 草案)
             │                         [ AppTable (DynamoDB) ]
             │                              ↑
             │                         [ Reminder Lambda ] (1h cron)
             │                              │
             │                         [ Rotation Lambda ] (1d cron)
             │                              │  → CloudFront x-origin-verify
             │                              │     トークンローテーション
             ▼
       Cognito UserPool (email + password)
```

### 技術スタック

| レイヤ | スタック |
|---|---|
| インフラ | SST v4 (Ion) on AWS |
| Backend API | Hono on Lambda + API Gateway V2 |
| Slack Bot | @slack/bolt on 別 Lambda |
| データベース | DynamoDB（**単一 `AppTable`**, pk/sk + GSI1/GSI2/GSI3） |
| 配信 | CloudFront StaticSite（オリジン検証 + 日次トークンローテーション） |
| 認証 | AWS Cognito UserPool（email + password） |
| AI | AWS Bedrock（`openai.gpt-oss-safeguard-120b`） |
| Frontend | Vue 3 + Pinia + Vue Router + Vite + md-editor-v3 |
| バリデーション | Zod 4 |

---

## 2. 利用編 — 運用フロー

### 2.1 全体フロー

```
[平常時]   ランブックを整備
    ↓
[検知]     アラート / 報告 → Slack で /incident start
              → モーダル入力 → 専用 ch が自動生成
    ↓
[対応中]   専用 ch で会話 = 自動記録
              ↳ /incident status で状態共有
              ↳ Bot が関連ランブックを提示
              ↳ 2h / 24h 無更新で自動リマインド
    ↓
[収束]     /incident end → モーダルで解決方法入力
              → Bot が終了サマリーを投稿（PM 作成リンク付き）
    ↓
[振り返り] Web でインシデント詳細を開く → ポストモーテム生成
    ↓
[知見化]   ポストモーテム → ランブック草案 → 編集フォーム自動入力 → 保存
    ↓
[モニタ]   ダッシュボードで未対応・PM 未作成をフォロー
```

### 2.2 登場人物

| ロール | 担当 |
|---|---|
| インシデントコマンダー | `/incident start` / `status` / `end` を実行する人 |
| 対応メンバー | 専用チャンネルで会話・調査・復旧を行う |
| レビュアー | 後日、Web で PM を生成・確認、ランブック化を判断する |

1 人で全部を担うチームでも、フローは同じ。

### 2.3 サインイン

1. ブラウザで Web アプリの URL（CloudFront URL）にアクセス
2. 管理者から発行されたメールアドレス + パスワードでサインイン
3. 認証に成功するとダッシュボードへ自動遷移

認証トークン（access / refresh）と email は `localStorage` に保存され、再アクセス時に自動復元される。access token が 401 を返すと、各画面のロジックが自動で refresh を試みる。

### 2.4 平常時：ランブックを育てる

普段から「またこれ起きそう」な対応手順をランブックとして蓄積しておく。

#### 新規作成

1. ヘッダー **Runbooks** → 「+ New Runbook」
2. **タイトル** / **内容**（Markdown エディタ `md-editor-v3` 使用）/ **タグ**（カンマ区切り、予測変換付き）を入力
3. 「作成する」ボタンで保存
4. 詳細画面では **目次付き Markdown プレビュー** で表示される

#### タグ運用のコツ

- タグ入力は **予測変換付き**（既存タグから補完候補が出る）
- `service:rds` `severity:high` などプレフィックスで分類すると検索しやすい
- 一覧画面の絞り込みは **カンマ区切りで AND 検索**（例：`service:rds, severity:high`）
- タグはランブックあたり最大 20 個、各 50 文字まで

#### 編集・削除

- 詳細画面の **「編集」** / **「削除」** ボタンから
- 編集時の更新者は Cognito の sub として記録される

### 2.5 検知：インシデントを起こす

#### どこから起票するか

- アラート受信や報告に気づいたチャンネル（例：`#ops`, `#alerts`）で操作開始
- ここは **起票元チャンネル** — そのまま記録対象になるわけではない
- 同じ起票元チャンネルに **すでにアクティブなインシデントがある場合は弾かれる**（重複起票防止）

#### `/incident start` を打つ

引数は不要：

```
/incident start
```

→ 起票モーダルが即座に開く（チャンネルにはまだ何も投稿されない）。

#### 起票モーダル

| 項目 | 必須 | 内容 |
|---|---|---|
| タイトル | ◯ | 200 文字以内（例：決済APIタイムアウト多発） |
| 重要度 | ◯ | SEV1 (緊急) / SEV2 (重大) / SEV3 (軽微) |
| 影響範囲 | ✕ | 500 文字以内（例：本番環境・全ユーザー） |

「起票する」ボタンを押すと Bot が一連の処理を自動実行。

#### 「起票する」押下後に Bot が行うこと

1. **専用チャンネルを自動作成**：`inc-<起票元ch名>-<YYYYMMDD>`
   - 例：`#ops` から起票 → `#inc-ops-20260521`
   - 同名衝突時は `-2`, `-3` ... と連番で再試行（最大 `-10` まで）
2. インシデントレコードを `AppTable` に作成
3. **起票者を専用 ch に自動招待**
4. 専用 ch にサマリー（タイトル / 重要度 / 影響範囲 / 起票者 / 開始時刻 / 関連ランブック）を投稿し、**ピン留め**
5. **関連ランブックを自動検索**（タイトルからキーワード抽出 → tag 一致は 3 倍、title 一致は 2 倍、content 一致は 1 倍でスコアリング → 上位 3 件）してサマリーに併記
6. **起票元チャンネルにも通知** — 「🚨 インシデント『...』(SEV1) の対応を <#inc-ops-20260521> で開始しました」

#### 専用 ch に投稿されるサマリー例

```
🚨 インシデント開始
タイトル: 決済APIタイムアウト多発
重要度: SEV1 - 緊急
影響範囲: 本番環境・全ユーザー
起票者: @yohei
開始: 2026-05-21T05:12:00.000Z

📖 関連ランブック:
• Payment API トラブルシュート [service:payment]
• Lambda コールドスタート緩和 [perf]
```

リンクをクリックすればそのまま Web 側の手順書に飛べる。

> 専用チャンネル作成に失敗した場合（権限不足など）は、サマリーが起票元チャンネルに直接投稿される。その場合、メッセージ記録は起票元チャンネルが対象になる。

### 2.6 対応中：会話＝記録

#### どこで会話する？

- 対応の議論は **専用チャンネル（`#inc-...`）** に集約する
- そのチャンネルの発言が **時系列で自動記録** される
- 起票元チャンネル（`#ops` 等）の発言は **記録対象外**
- 使い分け：**対応議論 → 専用 ch**、**外部周知 → 元チャンネル**

#### 普通に Slack で会話する

```
A: メトリクス見たけど 14:30 から RDS の Connections 急増
B: アプリ側のリトライで詰まってる説あり
A: 一旦 max_connections 上げる
```

これがそのままタイムラインに保存され、後から「誰が何を判断したか」を辿れる。

#### `/incident status` で状態を共有

長丁場の対応中は状態を明示する：

```
/incident status
```

モーダルで以下から選択：

- **調査中**（investigating）
- **原因特定**（identified）
- **対応中**（responding）
- **復旧確認中**（recovering）

補足メッセージも添えられる（例：「DB コネクションプール枯渇と判明」）。

送信後：
- ステータス更新が `AppTable` に保存（`INCIDENT#<id>` / `STATUS#<updatedAt>`）
- 専用 ch に Bot が「🔄 状態更新: 調査中 by @user」を投稿（補足メッセージあれば併記）
- Web 側のタイムラインでは **メッセージとステータス更新が時刻でマージ表示**

#### ランブックを参照する

起票時に提示されたランブック以外も使える：

1. **Runbooks** 一覧でタグ絞り込み（例：`service:rds, severity:high`）
2. 該当ランブックを開く（右側に目次が表示される）
3. 手順に沿って対応
4. Slack に「ランブック XXX に従って実施」と書けば判断履歴も残る

#### 自動リマインダー

1 時間ごとに動く Cron がすべての active なインシデントを監視し、専用 ch に Bot 投稿する：

| トリガー | 内容 |
|---|---|
| 2 時間 無更新（メッセージもステータス更新も無い） | ⏰ このインシデントは2時間更新がありません。`/incident status` で更新するか、解決済みなら `/incident end` してください |
| 24 時間 オープン | ⚠️ このインシデントは24時間以上オープンです。対応状況を確認してください |

同じインシデント・同じ種類は **二重に送られない**（送信履歴を `REMINDER#2h` / `REMINDER#24h` として記録）。

#### 記録される範囲

| 種類 | 記録 |
|---|---|
| 人間のメッセージ（専用 ch） | ◯ |
| スレッド内返信 | ◯ |
| Bot 自身のメッセージ | ✗ |
| メッセージ編集・参加通知等（subtype 付き） | ✗ |
| 添付ファイル・画像 | 本文テキストのみ |
| `/incident` コマンド自体 | ✗ |
| 起票元 ch / 関係ない ch の発言 | ✗ |

### 2.7 収束：インシデントを閉じる

#### `/incident end` を打つ

復旧確認・周知が済んだら、専用チャンネルで：

```
/incident end
```

→ 終了モーダルが開く。

#### 終了モーダル

| 項目 | 必須 | 内容 |
|---|---|---|
| 解決方法 | ◯ | 1〜2000 文字（例：APIサーバー再起動 + コネクションプール max=100 へ変更） |

「終了する」を押すと：

1. ステータスが `active` → `closed` に変更
2. インシデントの終了時刻と解決方法が `AppTable` に保存
3. GSI2/GSI3 の SK も `closed` に更新（以降、同チャンネルの発言はこのインシデントに紐付かない）
4. 専用 ch に Bot が **終了サマリー** を投稿：

   ```
   ✅ インシデント終了
   タイトル: 決済APIタイムアウト多発
   重要度: SEV1
   所要時間: 2時間15分
   解決方法: APIサーバー再起動 + コネクションプール max=100 へ変更

   📝 ポストモーテムを作成する（Web リンク）
   ```

5. リンクから直接 Web の PM 作成画面に飛べる

#### クローズ前後の Tips

- まだ熱が残っているうちに **タイムラインで抜けがないか** を確認
- 重要な意思決定や暫定対応のメモは、**閉じる前に** 専用 ch に書き残す
  - クローズ後の発言は記録されない
- **解決方法は具体的に書く** — このテキストが後のポストモーテム生成精度を大きく左右する

### 2.8 振り返り：ポストモーテム

#### Web でインシデントを開く

1. ヘッダー **Incidents** → 一覧へ
2. フィルタタブは **All / Active / Closed** の 3 種類
3. 行をクリックして詳細へ
4. 詳細画面では **メッセージとステータス更新が時刻でマージされたタイムライン** を確認

#### ポストモーテムを生成

詳細画面の **「ポストモーテムを生成」** ボタンを押す。

ボタンが表示される条件：

- インシデントが **closed** であること
- **メッセージが 1 件以上** あること

それ以外の場合：

- active なインシデント → 「インシデント終了後に生成できます」
- closed だがメッセージ 0 件 → 「メッセージがありません」

押下すると：

1. AWS Bedrock（`openai.gpt-oss-safeguard-120b`）がメッセージとステータス更新の全履歴を読み込み
2. Markdown 形式の構造化ポストモーテムを生成
3. `AppTable` に保存（`INCIDENT#<id>` / `POSTMORTEM`）
4. 画面に marked + DOMPurify でレンダリングされた HTML として表示

120B モデルなので **数十秒** かかることがある。

#### ポストモーテムの構成

生成プロンプトで指定されるセクション：

| セクション | 内容 |
|---|---|
| 概要 | 何が起きたか |
| タイムライン | 時系列での主要イベント |
| 根本原因 | 推定される根本原因 |
| 対応内容 | 取られたアクション |
| 改善アクション | 再発防止策の提案 |

入力としてはインシデント情報（重大度・影響範囲・解決策・期間）とステータス更新履歴もモデルに渡される。出力セクション自体に「影響範囲」項目は含まれないが、各セクション中で参照される。

#### レビューと再生成

- PM 表示の右上に **「再生成」** ボタンがある（既存 PM を上書き保存）
- 内容に違和感があれば再生成。複数案を比較する用途には不向き
- 「事実は合ってるが書きぶりが弱い」場合、Slack 側に背景情報を追記してから再生成、という運用も可能（メッセージ追加は active 中のみ可なので、計画的に）

### 2.9 知見化：ランブックへ

#### ランブック草案を生成

ポストモーテム表示エリアの右上に **「Runbookを生成」** ボタンがある。

押下すると：

1. Bedrock がポストモーテムを元に **JSON 構造化された** ランブック草案（`title` / `content` / `tags`）を生成
2. 画面遷移 → **新規ランブック作成画面** に飛ぶ
3. **タイトル・本文・タグが自動入力** された状態で開く
4. ヘッダに「AI GENERATED DRAFT」表示と注意書きが出る

#### 確認・編集・保存

ユーザーがやるのは：

1. 内容を確認、必要に応じて編集（Markdown エディタで自由に修正）
2. 「作成する」ボタンで保存

> 草案 API（`POST /api/incidents/:id/generate-runbook`）自体は保存をしないので、フォーム上で「キャンセル」すれば DB は汚れない。

#### 既存ランブックへの追記

草案が既存ランブックと内容が被る場合は：

1. 新規作成画面を開いたまま該当ランブックを別タブで開く
2. 既存ランブックを **編集**
3. 草案から必要な箇所をコピーして既存ランブックに統合
4. 新規作成画面は破棄（タブを閉じる）

### 2.10 モニタリング：ダッシュボード

サインイン直後に表示されるダッシュボードは複数の領域から成る。

#### 警告バナー（PM 未作成）

closed インシデントのうちポストモーテムが未生成のものが上部に出る。最大 5 件を一覧表示し、クリックで詳細へ。

#### ステータスバー

- アクティブインシデント数 / SYSTEM OPERATIONAL（0 件時）
- 現在ログイン中のユーザー email

#### 統計グリッド

| 指標 | 内容 |
|---|---|
| Active Incidents | 進行中の件数 |
| Total Runbooks | 登録済みランブックの総数 |
| Ready to Use | 利用可能なランブック数 |

#### Active Incidents セクション

進行中インシデントの上位 5 件をリスト表示。重要度バッジ、経過時間（例：`Started 1h 30m ago`）、起票者を表示。クリックで詳細へ。

#### Recent Runbooks セクション

最近更新されたランブックの上位 5 件。タグと最終更新日を表示。「View all」で全件一覧へ。

#### 右上の「+ New Runbook」

その場から新規ランブック作成画面に飛べる。

#### 運用例

- 毎朝ダッシュボードを開いて警告バナーを確認 → やり残しの PM を順に作成
- 進行中インシデントの経過時間をチェック → 長期化していれば対応者をフォロー
- 週次の振り返り MTG の起点として使う

### 2.11 運用 Tips まとめ

- **起票元 ch は記録外** — 対応の議論は自動生成された `#inc-...` で行う
- **発言＝記録** — 残したい意思決定は専用 ch にテキストで書く
- **ステータス更新を活用** — `/incident status` でチームの認識を揃え、PM 精度も上げる
- **閉じ忘れ厳禁** — `/incident end` は儀式と思って必ず打つ。リマインダーが来たら状態を更新するか終了する
- **解決方法は具体的に** — 終了モーダルの内容が PM 精度を左右する
- **PM は再生成可** — 完璧を狙わず、まず生成して内容を見る
- **ランブック草案は人間レビュー必須** — 自動入力された内容を必ず確認してから保存
- **タグはプレフィックス運用** — `service:` `severity:` などで分類すると AND 検索が効く

---

## 3. 管理編 — セットアップ

### 3.1 前提条件

- **Node.js** 20+（frontend は `^20.19.0 || >=22.12.0`）
- **AWS CLI** 設定済み（または環境変数で AWS 認証情報を設定）
- **Slack ワークスペース** の管理者権限（Slack App 作成・インストール用）
- AWS Bedrock の利用申請権限

### 3.2 セットアップ全体像

```
1. リポジトリ clone & npm install
2. AWS 認証情報を準備
3. Slack App を作成（Scopes / Slash / Interactivity / Events）
4. SST Secret に Slack の値を投入
5. Bedrock モデルアクセスを有効化
6. SST dev を起動
7. Cognito ユーザーを作成
8. Slack の Request URL を SST dev 出力で設定
```

### 3.3 クローンと依存関係

```sh
git clone <repository-url>
cd generosity-incident-management

cd backend && npm install
cd ../frontend && npm install
```

backend と frontend は別々の `package.json` を持つモノレポ構成。

### 3.4 AWS 認証情報

```sh
# 方法 A: AWS CLI プロファイル
aws configure

# 方法 B: 環境変数
export AWS_ACCESS_KEY_ID=xxx
export AWS_SECRET_ACCESS_KEY=xxx
export AWS_REGION=ap-northeast-1
```

SST は AWS の認証情報を直接利用してデプロイする。

### 3.5 Slack App の作成

`https://api.slack.com/apps` で「Create New App」→「From scratch」。

#### OAuth Scopes（Bot Token Scopes）

| Scope | 用途 |
|---|---|
| `chat:write` | Bot 発言 |
| `channels:history` | チャンネル履歴読み取り（イベント受信用） |
| `channels:manage` | インシデント専用 ch の自動作成・招待 |
| `channels:read` | チャンネル情報取得（起票元 ch 名の取得） |
| `commands` | Slash コマンド `/incident` |
| `pins:write` | サマリーのピン留め |
| `users:read` | ユーザー名取得 |

> 不足するとチャンネル作成や招待が失敗し、`incident.views.ts` の catch でフォールバックして起票元チャンネルにサマリー投稿される。

#### Slash Command

| 項目 | 値 |
|---|---|
| Command | `/incident` |
| Request URL | `https://<API_URL>/slack/events` |
| Description | インシデント開始 / 状態更新 / 終了 |

`<API_URL>` は後述の `npx sst dev` 出力で確認。

#### Interactivity & Shortcuts

モーダル送信（起票・終了・状態更新）に **必須**。

1. **Interactivity** を ON
2. **Request URL** を `https://<API_URL>/slack/events`（Slash と同じ）

設定漏れだと「起票する」「終了する」等のボタンを押した瞬間 Slack 側で「接続できません」エラーになる。

#### Event Subscriptions

1. **Enable Events** を ON
2. **Request URL** を `https://<API_URL>/slack/events`
   - Bolt が URL verification を自動応答
3. **Subscribe to bot events** に追加：
   - `message.channels`（パブリックチャンネルのメッセージ）

#### 取得すべき値

| 値 | 取得場所 | SST Secret 名 |
|---|---|---|
| Bot User OAuth Token（`xoxb-...`） | OAuth & Permissions | `SlackBotToken` |
| Signing Secret | Basic Information → App Credentials | `SlackSigningSecret` |

### 3.6 SST Secret 設定

```sh
cd backend

npx sst secret set SlackBotToken xoxb-xxxx-xxxx
npx sst secret set SlackSigningSecret xxxxxxxxxxxx
npx sst secret set OriginVerifyToken $(uuidgen)
```

- `OriginVerifyToken` は CloudFront → API Gateway のオリジン検証用。初期値だけここで設定し、本番では **1 日 1 回 Lambda が自動ローテーション** する
- Secret は暗号化されて AWS に保存される。**コードに直書き禁止**

### 3.7 Bedrock モデルアクセス

1. AWS コンソール → Amazon Bedrock → Model access
2. `openai.gpt-oss-safeguard-120b` をリクエスト
3. 承認待ち（通常は即時）

コスト抑制したい場合は `backend/src/incident/postmortem.service.ts` の `MODEL_ID` を 20B モデル等に変更可能。Bedrock の `bedrock:InvokeModel` 権限は `$default` ルートの Lambda に付与済み。

### 3.8 SST dev の起動

ターミナル 2 つで：

```sh
# ターミナル 1: バックエンド
cd backend
npx sst dev

# ターミナル 2: フロントエンド
cd frontend
npm run dev
```

- フロント: http://localhost:5173
- API: SST dev が出力する API Gateway URL
- ローカルでは `/api/*` は Vite proxy で backend に転送される
- dev モードでは `originAuthorizer` は **無効化** されているので `x-origin-verify` ヘッダー無しでアクセス可能

### 3.9 Cognito ユーザー作成

Web アプリのログインには Cognito ユーザーが必要。SST dev 起動後、AWS CLI で作成：

```sh
# ユーザー作成（仮パスワード）
aws cognito-idp admin-create-user \
  --user-pool-id <UserPoolId> \
  --username user@example.com \
  --user-attributes Name=email,Value=user@example.com \
  --temporary-password 'TempPass123!'

# 本パスワードに確定
aws cognito-idp admin-set-user-password \
  --user-pool-id <UserPoolId> \
  --username user@example.com \
  --password 'YourPassword123!' \
  --permanent
```

`<UserPoolId>` は `npx sst dev` の出力、または AWS コンソール → Cognito で確認。

### 3.10 Slack 側の Request URL 反映

`npx sst dev` の出力 URL を Slack App の以下に設定：

- Slash Commands の Request URL
- Interactivity & Shortcuts の Request URL
- Event Subscriptions の Request URL

すべて `https://<API_URL>/slack/events`。

### 3.11 本番デプロイ

```sh
cd backend
npm run deploy        # 既定 stage
npm run deploy:prod   # production stage（保護対象、削除不可）
```

- `production` ステージは `removal: "retain"` + `protect: true` でガード
- 本番デプロイ後、Slack App の Request URL を本番 API Gateway の URL に差し替え
- 本番用の Cognito ユーザーも別途作成
- 本番では **Token Rotation Lambda が 1 日 1 回起動**：
  - 新トークンを生成 → Secrets Manager に保存（current / previous の 2 つ）
  - CloudFront の `x-origin-verify` カスタムヘッダーを更新
  - 失敗時はロールバック

### 3.12 開発コマンド一覧

#### Backend

```sh
cd backend
npx sst dev          # ローカル開発
npm run build        # esbuild
npm run deploy       # 本番デプロイ（既定 stage）
npm run deploy:prod  # production stage
npm run lint         # Biome auto-fix
```

#### Frontend

```sh
cd frontend
npm run dev          # Vite dev
npm run build        # 型チェック + ビルド
npm run test:unit    # Vitest
npm run type-check   # vue-tsc
npm run lint         # Biome auto-fix
```

### 3.13 運用時の常駐サービス

| サービス | 起動条件 | 役割 |
|---|---|---|
| Slack Lambda | Slack イベント受信時 | `/incident` コマンド・モーダル・メッセージ記録 |
| Hono Lambda | API リクエスト受信時 | REST API、Bedrock 呼び出し |
| Reminder Lambda | 1 時間ごとの Cron | 2h / 24h リマインドを Slack 投稿 |
| Rotation Lambda | 1 日 1 回の Cron（本番のみ） | `x-origin-verify` トークンローテーション |

### 3.14 トラブルシューティング

#### `Resource.* is not defined`

SST dev 経由でないと `Resource` が注入されない。必ず `npx sst dev` で起動すること。

#### Slack の URL verification が失敗する

- `npx sst dev` が起動していることを確認
- Request URL が正しいことを確認（末尾に `/slack/events`）
- SST Secret (`SlackBotToken`, `SlackSigningSecret`) が設定済みであることを確認

#### `/incident` のモーダルボタン押下で「接続できません」

- Interactivity & Shortcuts の Request URL 未設定の可能性大

#### 専用チャンネルが作成されない

- Bot に `channels:manage` スコープがあるか確認
- 同名チャンネルが既に 10 個以上ある可能性（`-2` 〜 `-10` で再試行するため）
- 失敗時はサマリーが起票元 ch に投稿される（フォールバック挙動）

#### ポストモーテム生成がタイムアウト

- 120B モデルは数十秒かかることあり。Lambda タイムアウトを確認
- `postmortem.service.ts` の `MODEL_ID` を 20B 系に変更して試行

#### Cognito の `FORCE_CHANGE_PASSWORD` エラー

- `admin-set-user-password` に `--permanent` を付与してパスワードを確定する

#### 本番で `/api/*` が 401 を返す

- CloudFront の `x-origin-verify` カスタムヘッダーが Secrets Manager 上の current トークンと一致していない可能性
- 直近にローテーションが走った直後なら、CloudFront の伝播待ち
- Rotation Lambda のログを確認

#### ステータス更新が反映されない

- 専用ではなく **起票元** チャンネルで `/incident status` を打っていないか確認（`findActiveByChannel` は専用 ch を見るので空振りする）

---

## 4. 参考資料

### 4.1 API エンドポイント

すべてのバックエンドルートは `/api` プレフィックス。

#### 認証（一部公開）

| Method | Path | 認証 | 用途 |
|---|---|---|---|
| POST | `/api/auth/signin` | `originAuthorizer`（本番のみ） | サインイン |
| POST | `/api/auth/refresh` | `originAuthorizer`（本番のみ） | トークン更新 |
| GET | `/api/` | `originAuthorizer`（本番のみ） | ヘルスチェック |
| GET | `/api/me` | Cognito JWT | 自分の情報（sub, email） |

#### ランブック（JWT 認証）

| Method | Path | 用途 |
|---|---|---|
| GET | `/api/runbooks` | 一覧（`?tag=t1,t2` で AND 絞込 / `?limit=&cursor=` でページング） |
| POST | `/api/runbooks` | 作成 |
| GET | `/api/runbooks/tags` | 全タグ一覧 |
| GET | `/api/runbooks/:id` | 詳細 |
| PUT | `/api/runbooks/:id` | 更新 |
| DELETE | `/api/runbooks/:id` | 削除 |

#### インシデント（JWT 認証）

| Method | Path | 用途 |
|---|---|---|
| GET | `/api/incidents` | 一覧（`?status=active\|closed` / `?limit=&cursor=`） |
| GET | `/api/incidents/needs-postmortem` | PM 未作成の closed インシデント一覧 |
| GET | `/api/incidents/:id` | 詳細 |
| GET | `/api/incidents/:id/messages` | メッセージ一覧（時系列、ページング対応） |
| GET | `/api/incidents/:id/status-updates` | ステータス更新一覧（時系列） |
| POST | `/api/incidents/:id/postmortem` | PM 生成（messages が 0 件なら 400） |
| GET | `/api/incidents/:id/postmortem` | PM 取得 |
| POST | `/api/incidents/:id/generate-runbook` | ランブック草案生成（保存はしない） |

#### Slack（署名検証）

| Method | Path | 認証 | 用途 |
|---|---|---|---|
| POST | `/slack/events` | Slack Signing Secret | Slash + モーダル + イベント受信 |

JWT ではなく Slack の署名検証で保護。

#### 共通レスポンス形式

```json
// 成功
{ "success": true, "data": ... }

// ページング
{ "success": true, "data": [...], "meta": { "limit": 20, "nextCursor": "..." | null } }

// エラー
{ "success": false, "error": "..." }
```

ページネーション既定値：`limit` 既定 20、最大 100。`cursor` は base64url エンコードされた DDB の `LastEvaluatedKey`。

### 4.2 データモデル — 単一 `AppTable`

`pk` (string) + `sk` (string) の複合キー + 3 つの GSI。

#### SK パターン一覧

| pk | sk | 内容 |
|---|---|---|
| `RUNBOOK#<id>` | `META` | ランブック本体（title / content / tags / createdBy / updatedBy / 時刻） |
| `INCIDENT#<id>` | `META` | インシデント本体（title / severity / status / channelId / sourceChannelId / startedAt / endedAt / startedBy / impact / resolution） |
| `INCIDENT#<id>` | `MSG#<messageTs>` | メッセージ（userId / userName / text / recordedAt） |
| `INCIDENT#<id>` | `STATUS#<updatedAt>` | ステータス更新（status / message / updatedBy） |
| `INCIDENT#<id>` | `POSTMORTEM` | 生成済みポストモーテム（content / generatedAt / modelId） |
| `INCIDENT#<id>` | `REMINDER#<type>` | リマインダー送信履歴（type = `2h` or `24h`） |

#### GSI

| GSI | PK | SK | 用途 |
|---|---|---|---|
| GSI1 | `INCIDENT` or `RUNBOOK` | startedAt / createdAt | タイプ別の時刻順一覧 |
| GSI2 | channelId | `active` / `closed` | チャンネル ID からアクティブインシデント検索 |
| GSI3 | sourceChannelId | `active` / `closed` | 起票元チャンネルからの重複起票チェック |

### 4.3 プロジェクト構成

```
generosity-incident-management/
├── backend/
│   ├── sst.config.ts              # SST インフラ定義（AppTable, UserPool, ApiGw, Lambdas, Crons）
│   └── src/
│       ├── index.ts               # Hono エントリポイント（basePath /api）
│       ├── authorizer.ts          # x-origin-verify Lambda Authorizer
│       ├── rotation.ts            # オリジン検証トークンの日次ローテーション
│       ├── auth/                  # Cognito 認証ルート / サービス
│       ├── runbook/               # ランブック CRUD / repository / search
│       ├── incident/
│       │   ├── incident.commands.ts    # /incident コマンド
│       │   ├── incident.views.ts       # モーダル送信ハンドラー
│       │   ├── incident.reminder.ts    # 2h/24h リマインダー Cron
│       │   ├── incident.repository.ts  # DDB アクセス
│       │   ├── incident.routes.ts      # REST API
│       │   ├── incident.types.ts
│       │   ├── incident.validators.ts  # Zod スキーマ
│       │   └── postmortem.service.ts   # Bedrock 呼び出し（PM + ランブック草案）
│       ├── slack/
│       │   ├── slack.handler.ts        # Bolt + AwsLambdaReceiver
│       │   └── message.events.ts       # メッセージイベント記録
│       ├── lib/                   # 共通（dynamodb / cognito / pagination / api-response）
│       └── middleware/            # エラーハンドラー
├── frontend/
│   └── src/
│       ├── view/                  # ページ（SignIn / Dashboard / Incident* / Runbook*）
│       ├── components/            # CommonHeader, TagInput
│       ├── stores/                # Pinia（auth / runbook / incident）
│       ├── lib/api-client.ts      # /api/* fetch wrapper
│       └── router/                # Vue Router + 認証ガード
├── docs/                          # 本書ほか
├── CLAUDE.md
└── README.md
```

### 4.4 参考リンク

- Slack App 管理：https://api.slack.com/apps
- AWS Bedrock：AWS Console → Amazon Bedrock
- AWS Cognito：AWS Console → Cognito User Pools
- SST：https://sst.dev
- Hono：https://hono.dev
- Vue 3：https://vuejs.org
- md-editor-v3：https://github.com/imzbf/md-editor-v3
