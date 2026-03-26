# 実装プラン: インシデント管理UX改善

> 基本方針: P0（全員に見える + 構造化入力）→ P1（対応の質向上）→ P2（ナレッジ循環）の順で実装。
> 各ステップは独立してデプロイ可能な単位で区切る。

---

## Step 1: データモデル拡張（バックエンド）

**目的**: 後続の全ステップの土台となる型定義とDB操作を整備

### 1-1. `incident.types.ts` — 型定義の拡張

```typescript
// 既存の Incident に追加
interface Incident {
  // ...existing fields
  readonly severity: "SEV1" | "SEV2" | "SEV3";
  readonly impact?: string;
  readonly resolution?: string;
}

// 新規: CreateIncidentRequest を拡張
interface CreateIncidentRequest {
  readonly title: string;
  readonly severity: "SEV1" | "SEV2" | "SEV3";
  readonly impact?: string;
}

// 新規: StatusUpdate 型
interface StatusUpdate {
  readonly incidentId: string;
  readonly status: "investigating" | "identified" | "responding" | "recovering";
  readonly message?: string;
  readonly updatedBy: string;
  readonly updatedAt: string;
}
```

### 1-2. `incident.validators.ts`（新規）— Zod バリデーション

```typescript
import { z } from "zod/v4";

export const createIncidentSchema = z.object({
  title: z.string().min(1).max(200),
  severity: z.enum(["SEV1", "SEV2", "SEV3"]),
  impact: z.string().max(500).optional(),
});

export const closeIncidentSchema = z.object({
  resolution: z.string().min(1).max(2000),
});

export const statusUpdateSchema = z.object({
  status: z.enum(["investigating", "identified", "responding", "recovering"]),
  message: z.string().max(500).optional(),
});
```

### 1-3. `incident.repository.ts` — DB操作の拡張

変更点:
- `create()`: `severity`, `impact` を受け取りDBに保存
- `close()`: `resolution` を受け取りDBに保存
- `addStatusUpdate()`（新規）: SK=`STATUS#<ts>` で状態更新を記録
- `listStatusUpdates()`（新規）: インシデントの全状態更新を取得
- `getLatestActivity()`（新規）: 最終メッセージ or ステータス更新の時刻を取得（リマインド用）
- `saveReminder()` / `hasReminder()`（新規）: SK=`REMINDER#<type>` でリマインド送信済みフラグ管理

DynamoDB SKパターン追加:
```
PK: INCIDENT#<id>, SK: STATUS#<ISO timestamp>  — 状態更新
PK: INCIDENT#<id>, SK: REMINDER#2h             — リマインド送信済みフラグ
PK: INCIDENT#<id>, SK: REMINDER#24h            — リマインド送信済みフラグ
```

### 1-4. `incident.routes.ts` — APIエンドポイント追加

```
GET  /incidents/:id/status-updates  — 状態更新一覧（タイムライン表示用）
```

**確認ポイント**: 既存の `/incidents` GET レスポンスに `severity`, `impact`, `resolution` が含まれることを確認

---

## Step 2: Slack コマンド改修 — respond() → postMessage() + モーダル（P0）

**目的**: 全員に見える形にし、起票時に構造化情報を入力させる

### 2-1. `slack.handler.ts` — イベントハンドラー追加

```typescript
// 既存
app.command("/incident", handleIncidentCommand);
app.event("message", handleMessageEvent);

// 追加
app.view("incident_start_modal", handleIncidentStartSubmission);
app.view("incident_end_modal", handleIncidentEndSubmission);
```

Slack App 設定で `interactivity` を有効化する必要あり（モーダル使用のため）。
Request URL は既存の `/slack/events` エンドポイントを使用。

### 2-2. `incident.commands.ts` — コマンドハンドラー全面改修

**`/incident start` の改修**:

```
現状: ack() → create() → respond(message)
改修後:
  1. ack()
  2. client.views.open() でモーダル表示
     - タイトル（plain_text_input, 必須）
     - 重要度（static_select: SEV1/SEV2/SEV3, 必須）
     - 影響範囲（plain_text_input, 任意）
     - private_metadata に元チャンネルID + trigger_id を格納
```

**`/incident end` の改修**:

```
現状: ack() → findActiveByChannel() → close() → respond(message)
改修後:
  1. ack()
  2. findActiveByChannel() でアクティブインシデント確認
     - なければ respond() でエフェメラル通知（これはOK）
  3. client.views.open() でモーダル表示
     - 解決方法（plain_text_input, 必須）
     - private_metadata にインシデントID + チャンネルID を格納
```

**`/incident status` （新規）**:

```
  1. ack()
  2. findActiveByChannel() でアクティブインシデント確認
  3. client.chat.postMessage() で状態選択ボタンを投稿
     - actions ブロック: 4つのボタン（調査中/原因特定/対応中/復旧確認中）
     - または static_select で選択させる
  ※ シンプルにするならモーダルではなくメッセージ内のセレクトメニューでもOK
```

**`/incident help` + 引数なし**:

```
  1. ack()
  2. respond() でエフェメラルにヘルプテキスト表示
```

### 2-3. `incident.modal-handlers.ts`（新規）— モーダル送信ハンドラー

**`handleIncidentStartSubmission`**:

```
1. private_metadata からチャンネルIDを取得
2. conversations.info() で元チャンネル名を取得
3. チャンネル名を生成: inc-{元チャンネル名}-{YYYYMMDD}
4. conversations.create() で専用チャンネル作成
   - 同名チャンネルが存在する場合は末尾に連番(-2, -3)
   - conversations.create が name_taken エラーを返したらリトライ
5. conversations.invite() で起票者をチャンネルに招待
6. incident.repository.create() でDBにインシデント作成
   - channelId は新しい専用チャンネルのID
7. searchRunbooks() で関連ランブックを検索
8. client.chat.postMessage() で専用チャンネルに初期投稿
   - Block Kit でリッチなフォーマット
   - ランブックURLは Resource.Site.url + /runbooks/:id
9. pins.add() で初期投稿をピン留め
10. client.chat.postMessage() で元チャンネルにも通知
    - 「#inc-xxx-20260311 で対応を開始しました」＋リンク
```

**`handleIncidentEndSubmission`**:

```
1. private_metadata からインシデントID + チャンネルIDを取得
2. incident.repository.close() でDB更新（resolution付き）
3. client.chat.postMessage() でクローズサマリーを投稿
   - Block Kit: タイトル、重要度、所要時間、解決方法
   - actions ブロック: 「ポストモーテムを作成する」ボタン
     → url: Resource.Site.url + /incidents/:id（外部リンクボタン）
```

### 2-4. Slack App 設定変更

Slack App管理画面での変更:
- **OAuth Scopes 追加**: `channels:manage`, `pins:write`, `channels:read`（conversations.info用）
- **Interactivity 有効化**: Request URL = 既存のSlackイベントURL
- アプリを再インストール（スコープ変更後に必要）

### 2-5. `sst.config.ts` — リソースリンク追加

Slack Bot Lambda に `Resource.Site.url` をリンクする（ランブックURL生成に必要）。
現状のSST設定を確認し、Slack Lambda の `link` に `site` が含まれていなければ追加。

---

## Step 3: フロントエンド — インシデント詳細の強化（P1）

**目的**: 構造化されたインシデント情報をWeb UIに表示

### 3-1. `frontend/src/lib/api-client.ts` — API関数追加

```typescript
// 新規
export const getStatusUpdates = async (
  accessToken: string,
  incidentId: string,
): Promise<ApiResponse<StatusUpdate[]>> => { ... }
```

### 3-2. `frontend/src/view/IncidentDetail.vue` — 詳細ページ改修

**ヘッダー部分追加**:
- タイトル（既存）
- 重要度バッジ（SEV1=赤, SEV2=黄, SEV3=青）
- 影響範囲テキスト
- 起票者名
- 所要時間（startedAt → endedAt の差分）
- 解決方法（closedの場合）

**タイムライン改修**:
- 既存のメッセージ一覧に加えて、StatusUpdate を時系列で挟み込む
  - メッセージ: `MSG#<ts>` の ts でソート
  - ステータス: `STATUS#<ts>` の ts でソート
  - 両方をマージして時系列表示
- 各エントリのビジュアル:
  - メッセージ: 現状通り（アバター + テキスト）
  - ステータス更新: アイコン + 「状態更新: 調査中 → 原因特定」のバッジスタイル
  - インシデント開始/終了: 区切り線スタイル

### 3-3. `frontend/src/view/IncidentList.vue` — 一覧ページ改修

- 重要度バッジ列を追加
- タイトル列は既存
- ステータス列は既存

---

## Step 4: `/incident status` コマンド実装（P1）

**目的**: 対応中の状況を構造化して記録・共有

### 4-1. `incident.commands.ts` — status サブコマンド

```
/incident status
  → ack()
  → findActiveByChannel() でアクティブインシデント確認
  → なければ respond() でエフェメラル通知
  → client.chat.postMessage() で選択UIを投稿:
    Block Kit の static_select:
    - 調査中 (investigating)
    - 原因特定 (identified)
    - 対応中 (responding)
    - 復旧確認中 (recovering)
    + テキスト入力（任意: 補足メッセージ）
```

### 4-2. `slack.handler.ts` — action ハンドラー追加

```typescript
app.action("incident_status_select", handleStatusAction);
```

### 4-3. `incident.actions.ts`（新規）— アクションハンドラー

```
1. action payload からステータス値 + インシデントIDを取得
2. incident.repository.addStatusUpdate() でDB記録
3. client.chat.postMessage() でチャンネルに状態更新を投稿
   - 「🔄 状態更新: 調査中 → 原因特定  by @yamada」
```

---

## Step 5: `/incident help` コマンド実装（P1）

**目的**: コマンドの使い方をすぐ確認できるようにする

### 5-1. `incident.commands.ts` — help サブコマンド + 引数なしハンドリング

```
/incident help  または  /incident（引数なし）
  → ack()
  → respond() でエフェメラル表示（本人だけでOK）
  → Block Kit でコマンド一覧を表示
```

現状の `incident.commands.ts:73` にある既存のヘルプメッセージを Block Kit 化して拡充。

---

## Step 6: 放置インシデントリマインド（P1）

**目的**: クローズし忘れを防止

### 6-1. `incident.reminder.ts`（新規）— リマインド Lambda

```typescript
export const handler = async () => {
  // 1. アクティブインシデントを全件取得
  const activeIncidents = await listAll({ limit: 100 }, "active");

  for (const incident of activeIncidents.items) {
    const now = new Date();
    const startedAt = new Date(incident.startedAt);

    // 2. 最終アクティビティ時刻を取得（最終メッセージ or ステータス更新）
    const latestActivity = await getLatestActivity(incident.id);
    const lastActivityAt = latestActivity
      ? new Date(latestActivity)
      : startedAt;

    // 3. 2時間無更新チェック
    const hoursSinceActivity = (now - lastActivityAt) / (1000 * 60 * 60);
    if (hoursSinceActivity >= 2 && !(await hasReminder(incident.id, "2h"))) {
      await sendReminder(incident, "2h");
      await saveReminder(incident.id, "2h");
    }

    // 4. 24時間オープンチェック
    const hoursSinceStart = (now - startedAt) / (1000 * 60 * 60);
    if (hoursSinceStart >= 24 && !(await hasReminder(incident.id, "24h"))) {
      await sendReminder(incident, "24h");
      await saveReminder(incident.id, "24h");
    }
  }
};
```

### 6-2. `sst.config.ts` — EventBridge Scheduler + Lambda 追加

```typescript
// リマインド用 Lambda
const reminderHandler = new sst.aws.Function("IncidentReminder", {
  handler: "src/incident/incident.reminder.handler",
  link: [table, slackBotToken],
  timeout: "60 seconds",
});

// 1時間ごとに実行
new sst.aws.Cron("IncidentReminderCron", {
  schedule: "rate(1 hour)",
  job: reminderHandler,
});
```

---

## Step 7: ポストモーテム構造化データ活用（P2）

**目的**: ポストモーテム生成時にインシデントの構造化情報を活用し、AIの出力品質を向上

### 7-1. `postmortem.service.ts` — プロンプト改善

**`buildPrompt()` のシグネチャ拡張**:

```typescript
// 現状
const buildPrompt = (incident: Incident, messages: readonly IncidentMessage[]): string
// 改修後
const buildPrompt = (incident: Incident, messages: readonly IncidentMessage[], statusUpdates: readonly StatusUpdate[]): string
```

**プロンプトに構造化情報を追加**:

```
## インシデント情報
- タイトル: ${incident.title}
- 重要度: ${incident.severity}
- 影響範囲: ${incident.impact ?? "未記入"}
- 解決方法: ${incident.resolution ?? "未記入"}
- 所要時間: ${formatDuration(incident.startedAt, incident.endedAt)}

## ステータス変更履歴
[${ts}] 状態更新: ${label} by ${userId} — ${message}
...

## チャットログ
(既存のメッセージログ)
```

**`generatePostmortem()` のシグネチャ拡張**:

```typescript
// 現状
export const generatePostmortem = async (incident: Incident, messages: readonly IncidentMessage[]): Promise<string>
// 改修後
export const generatePostmortem = async (incident: Incident, messages: readonly IncidentMessage[], statusUpdates: readonly StatusUpdate[]): Promise<string>
```

### 7-2. `incident.routes.ts` — postmortem 生成エンドポイント修正

POST `/:id/postmortem` ハンドラーで `listStatusUpdates(id)` を追加呼び出しし、`generatePostmortem` に渡す。

```typescript
// 変更箇所
const messages = await listAllMessages(id);
const statusUpdates = await listStatusUpdates(id);  // 追加
const content = await generatePostmortem(incident, messages, statusUpdates);  // 引数追加
```

### 変更ファイル

| ファイル | 変更内容 |
|---------|---------|
| `postmortem.service.ts` | buildPrompt, generatePostmortem にステータス更新を追加。プロンプトに severity/impact/resolution/statusUpdates を含める |
| `incident.routes.ts` | POST `/:id/postmortem` で listStatusUpdates を呼び出して generatePostmortem に渡す |
| `incident.types.ts` | 変更なし（StatusUpdate は既存） |

---

## Step 8: フロントエンド — ダッシュボード改善（P2）

**目的**: ダッシュボードにインシデント状況を一目で把握できる情報を追加

### 8-1. `Dashboard.vue` — stats-grid にインシデントカード追加

**Active Incidents カード**:
- アクティブインシデント数を表示
- 0件: 緑色テキストで "0" 表示
- 1件以上: 赤背景で強調表示（`.stat-card.danger` スタイル）
- クリックでインシデント一覧（active フィルタ）へ遷移

**Needs Review カード**:
- クローズ済み + ポストモーテム未作成のインシデント数を表示
- フロントエンドで closed インシデント（直近20件）を取得し、各IDに `getPostmortem()` で存在チェック → 未作成数をカウント
- クリックでインシデント一覧（closed フィルタ）へ遷移

**stats-grid レイアウト調整**:
- 現状 `grid-template-columns: repeat(3, 1fr)` を維持
- 2行目にインシデント系カード2つを配置

### 8-2. `Dashboard.vue` — ステータスバー動的化

```
アクティブインシデント 0件:
  → 緑ドット + "SYSTEM OPERATIONAL"

アクティブインシデント 1件以上:
  → 赤ドット(pulse) + "INCIDENT ACTIVE" (赤テキスト)

System Status カード:
  → 0件: 緑 "OK"
  → 1件以上: 赤 "ALERT" + アクティブ件数表示
```

### 8-3. `Dashboard.vue` — Recent Incidents セクション追加

Recent Runbooks セクションの下に配置:

```
┌─────────────────────────────────────────────────────┐
│ RECENT INCIDENTS                        [View all →] │
├─────────────────────────────────────────────────────┤
│ 01  SEV1  決済APIタイムアウト多発    CLOSED   1h23m  │
│ 02  SEV2  ログ収集パイプライン停止   ACTIVE   進行中  │
│ 03  SEV3  管理画面表示崩れ         CLOSED   45m    │
└─────────────────────────────────────────────────────┘
```

- 直近5件を表示（active → closed の順、それぞれ startedAt 降順）
- 各行: severity バッジ + タイトル + ステータスバッジ + 経過時間/所要時間
- クリックで `/incidents/:id` へ遷移
- "View all →" で `/incidents` へ遷移

### データ取得

```typescript
onMounted(async () => {
  // 既存: ランブック取得
  await runbookStore.fetchAll();

  // 追加: インシデント取得
  const [activeRes, closedRes] = await Promise.all([
    callWithAuth((token) => listIncidents(token, { status: "active", limit: 100 })),
    callWithAuth((token) => listIncidents(token, { status: "closed", limit: 20 })),
  ]);

  // アクティブ件数
  activeIncidents.value = activeRes.data ?? [];

  // ポストモーテム未作成チェック（closed の各IDに対して）
  const closedItems = closedRes.data ?? [];
  const pmChecks = await Promise.all(
    closedItems.map((inc) =>
      callWithAuth((token) => getPostmortem(token, inc.id))
        .then((res) => ({ id: inc.id, hasPostmortem: res.success && !!res.data }))
    ),
  );
  needsReviewCount.value = pmChecks.filter((c) => !c.hasPostmortem).length;

  // Recent Incidents（active優先 + closed 最新で計5件）
  recentIncidents.value = [...activeIncidents.value, ...closedItems].slice(0, 5);
});
```

### 変更ファイル

| ファイル | 変更内容 |
|---------|---------|
| `Dashboard.vue` | インシデントカード2つ追加、ステータスバー動的化、Recent Incidents セクション追加 |

### 追加 import

```typescript
import { listIncidents, getPostmortem, type Incident } from "@/lib/api-client";
```

---

## 実装順序サマリー

```
Step 1  データモデル拡張（型 + DB + バリデーション）          ✅ 完了
  ↓
Step 2  Slackコマンド改修（モーダル, チャンネル自動作成）     ✅ 完了
  ↓
Step 3  フロントエンド（インシデント詳細・一覧の強化）        ✅ 完了
  ↓
Step 4  /incident status コマンド                          ✅ 完了
  ↓
Step 5  /incident help コマンド                            ✅ 完了
  ↓
Step 6  放置インシデントリマインド                           ✅ 完了
  ↓
Step 7  ポストモーテム構造化データ活用                       ← 次はここ
  ↓     ← デプロイ & 動作確認
Step 8  ダッシュボード改善
        ← 最終デプロイ
```

### 実装順序の理由

Step 7 を先に実装する理由:
- 変更が小さい（2ファイル、プロンプト修正 + 引数追加のみ）
- 既存のポストモーテム生成の質が即座に向上する
- バックエンドのみの変更で独立してデプロイ可能

Step 8 は UI が大きめだが、バックエンド変更不要（既存 API で取得可能）。

## Slack App 設定変更チェックリスト

実装前にSlack App管理画面で必要な設定:
- [ ] OAuth Scopes に `channels:manage`, `channels:read`, `pins:write` を追加
- [ ] Interactivity & Shortcuts を有効化し、Request URL を設定
- [ ] アプリをワークスペースに再インストール（スコープ変更反映）

## 後方互換性

- 既存のインシデントデータには `severity`, `impact`, `resolution` がない
- → フロントエンドでは optional として扱い、ない場合は非表示にする
- → `toIncident()` マッパーで undefined をデフォルトとして扱う
- 既存の `findActiveByChannel()` はGSI2を使用 → 新しい専用チャンネルIDが `channelId` になるため、既存データとの競合なし
