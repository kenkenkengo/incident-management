# UX改善計画: インシデント管理フロー

## 現状の問題点サマリー

### 1. `respond()` によるエフェメラルメッセージ問題
- **現状**: `incident.commands.ts` で `respond()` を使用しており、Slashコマンドを打った本人にしか表示されない
- **影響**: チャンネルの他メンバーにはインシデント開始/終了が見えない
- **対応**: `client.chat.postMessage()` に変更し、チャンネル全員に表示する

### 2. インシデント起票時の情報不足
- **現状**: `/incident start [タイトル]` でタイトルのみ。省略すると「無題のインシデント」
- **影響**: 後から一覧を見ても何のインシデントかわからない。重要度・影響範囲も不明

### 3. 対応中のコンテキスト不足
- **現状**: メッセージをフラットに記録しているだけ
- **影響**: 途中参加者が状況を把握できない。対応中にランブックを参照する導線もない

### 4. クローズ時の情報欠落
- **現状**: `/incident end` で即クローズ。解決方法の記録なし
- **影響**: ポストモーテムの質が下がる。何をもって解決したかの記録が残らない

### 5. クローズ後の導線がない
- **現状**: クローズメッセージだけ。ポストモーテム作成への案内なし
- **影響**: ポストモーテムが書かれずに放置される

---

## 改善後のユーザー行動マップ

### Phase 1: インシデント起票 — ✅ 実装済み

```
ユーザー: /incident start

  【現状】
  → タイトルをコマンド引数で入力（省略可 → 「無題のインシデント」）
  → respond() でコマンド実行者だけに表示

  【改善後】
  → Slack モーダルが開く
     ├─ タイトル（必須）: 何が起きた？ 例: 「決済APIタイムアウト多発」
     ├─ 重要度（必須）: SEV1 / SEV2 / SEV3 セレクト
     └─ 影響範囲（任意）: 例: 「本番環境・全ユーザー」
  → インシデント専用チャンネルを自動作成
     ├─ conversations.create で新規チャンネル作成
     │   チャンネル名: inc-元チャンネル名-YYYYMMDD
     │   例: #general で起票 → inc-general-20260311
     │   問題内容はピン留め投稿で確認できるため、チャンネル名はシンプルに
     │   同日に同チャンネルから複数起票された場合は末尾に連番（-2, -3）
     ├─ 起票者をチャンネルに招待（conversations.invite）
     └─ 元のチャンネルにも通知（「#inc-... で対応を開始しました」リンク付き）
  → 専用チャンネルに Bot が初期投稿:
     ┌──────────────────────────────────┐
     │ 🚨 インシデント開始               │
     │ タイトル: 決済APIタイムアウト多発    │
     │ 重要度: SEV1                      │
     │ 影響範囲: 本番環境・全ユーザー       │
     │ 起票者: @yamada                   │
     │ 開始: 2026-03-11 14:30           │
     │                                  │
     │ 📖 関連ランブック:                 │
     │ • <決済API障害対応手順|https://example.com/runbooks/abc123> [payment]
     │ • <本番DB復旧手順|https://example.com/runbooks/def456> [database]
     └──────────────────────────────────┘
  → ランブックURLは Resource.Site.url + /runbooks/:id で生成
  → この投稿を専用チャンネルにピン留め
  → メッセージ記録はこの専用チャンネルのみ対象（ノイズが入らない）
```

**データモデル変更**:
```typescript
// incident.types.ts
interface Incident {
  readonly id: string;
  readonly channelId: string;
  readonly title: string;
  readonly severity: "SEV1" | "SEV2" | "SEV3";   // 追加
  readonly impact?: string;                        // 追加
  readonly status: "active" | "closed";
  readonly startedAt: string;
  readonly endedAt?: string;
  readonly startedBy: string;
  readonly resolution?: string;                    // 追加（Phase 3で使用）
}
```

### Phase 2: 対応中 — ✅ 実装済み

```
チャンネルで障害対応の議論

  【現状】
  → Bot がメッセージを記録（バックグラウンド）

  【改善後】
  → メッセージ記録は現状通り（変更なし）
  → /incident status コマンドを追加
     └─ 選択肢: 調査中 / 原因特定 / 対応中 / 復旧確認中
     → チャンネルに状態更新を投稿（全員に見える）
     ┌──────────────────────────────────┐
     │ 🔄 状態更新: 調査中 → 原因特定     │
     │ by @yamada                       │
     │ DBコネクションプールの枯渇が原因     │
     └──────────────────────────────────┘
  → 状態更新はDBにも記録（タイムラインに表示するため）
  → Web UIのタイムラインにステータス変更が挟まる
```

**データモデル追加**:
```typescript
// IncidentTable の SK パターン追加
// PK: INCIDENT#<id>, SK: STATUS#<ts>
interface StatusUpdate {
  readonly incidentId: string;
  readonly status: "investigating" | "identified" | "responding" | "recovering";
  readonly message?: string;
  readonly updatedBy: string;
  readonly updatedAt: string;
}
```

### Phase 2.5: 放置インシデントのリマインド — ✅ 実装済み

```
アクティブなインシデントが一定時間クローズされない場合

  → 定期実行（EventBridge Scheduler / CloudWatch Events で1時間ごと）
  → アクティブなインシデントを走査し、以下の条件で通知:

  ┌─ リマインドルール ──────────────────────────────┐
  │                                                │
  │ 1. 最終メッセージ or ステータス更新から2時間経過     │
  │    → 専用チャンネルに通知:                        │
  │    「⏰ このインシデントは2時間更新がありません。      │
  │     現在の状況を /incident status で更新するか、    │
  │     解決済みなら /incident end してください」       │
  │                                                │
  │ 2. インシデント開始から24時間経過                   │
  │    → 専用チャンネルに通知:                        │
  │    「⚠️ このインシデントは24時間以上オープンです。    │
  │     対応状況を確認してください」                    │
  │                                                │
  │ 3. リマインドは同一条件で1回のみ送信（重複防止）      │
  │                                                │
  └────────────────────────────────────────────────┘
```

**実装方式**:
- EventBridge Scheduler で Lambda を定期実行（1時間ごと）
- アクティブインシデントを `listAll(status: "active")` で取得
- 最終メッセージ時刻と現在時刻を比較して条件判定
- リマインド送信済みフラグを DynamoDB に記録（SK: `REMINDER#2h` / `REMINDER#24h`）して重複防止

### Phase 2.6: ヘルプコマンド — ✅ 実装済み

```
ユーザー: /incident help（または引数なし）

  → respond()（エフェメラル = 本人だけに表示でOK）
  → 以下を表示:
     ┌──────────────────────────────────────────┐
     │ 📋 /incident コマンド一覧                  │
     │                                          │
     │ /incident start                          │
     │   → インシデントを起票（モーダルが開きます）  │
     │                                          │
     │ /incident status                         │
     │   → 対応状況を更新                         │
     │     調査中 / 原因特定 / 対応中 / 復旧確認中   │
     │                                          │
     │ /incident end                            │
     │   → インシデントをクローズ（モーダルが開きます）│
     │                                          │
     │ /incident help                           │
     │   → このヘルプを表示                       │
     └──────────────────────────────────────────┘
```

※ ヘルプは本人だけに見えればよいので `respond()`（エフェメラル）のまま。

### Phase 3: クローズ — ✅ 実装済み

```
対応完了 → /incident end

  【現状】
  → 即クローズ。respond() で本人にだけ表示

  【改善後】
  → Slack モーダルが開く
     └─ 解決方法（必須）: 何をして解決した？
        例: 「APIサーバー再起動 + コネクションプール設定を max=100 に変更」
  → client.chat.postMessage() でチャンネル全員に表示
  → Bot がクローズサマリーを投稿:
     ┌──────────────────────────────────────┐
     │ ✅ インシデント終了                     │
     │ タイトル: 決済APIタイムアウト多発         │
     │ 重要度: SEV1                           │
     │ 所要時間: 1時間23分                     │
     │ 解決方法: APIサーバー再起動 +            │
     │   コネクションプール設定を max=100 に変更  │
     │                                       │
     │ [📝 ポストモーテムを作成する]             │
     │  → Web UIへのリンクボタン                │
     └──────────────────────────────────────┘
```

### Phase 4: 振り返り（Web UI） — 🔧 一部実装済み

```
インシデント詳細ページ

  【現状】
  → メッセージ一覧 + ポストモーテム生成ボタン

  【改善後】
  ✅ → ヘッダーにインシデント概要を表示
     ├─ タイトル、重要度バッジ、影響範囲
     ├─ 起票者、所要時間
     └─ 解決方法
  ✅ → タイムラインにステータス変更イベントが挟まる
     ├─ 14:30 🚨 インシデント開始 by @yamada
     ├─ 14:32 💬 メッセージ ...
     ├─ 14:45 🔄 状態更新: 調査中 → 原因特定
     ├─ 15:10 💬 メッセージ ...
     └─ 15:53 ✅ クローズ（解決方法: ...）
  🔧 → ポストモーテム生成時にこれらの構造化データも活用
     → AIがより質の高いポストモーテムを生成できる
     → 詳細は implementation-plan.md Step 7 参照
  🔧 → ダッシュボードにアクティブインシデント表示 + ポストモーテム未作成リマインド
     → 詳細は implementation-plan.md Step 8 参照
  ✅ → ポストモーテム確認後「ランブックを作成」CTA（既存機能として実装済み）
```

---

## 変更箇所まとめ

### バックエンド

| ファイル | 変更内容 | 状態 |
|---------|---------|------|
| `incident.types.ts` | `severity`, `impact`, `resolution` フィールド追加。`StatusUpdate` 型追加 | ✅ |
| `incident.validators.ts`（新規） | Zod バリデーションスキーマ（createIncident, closeIncident, statusUpdate） | ✅ |
| `incident.repository.ts` | create に severity/impact 対応。close に resolution 対応。StatusUpdate の CRUD 追加。getLatestActivity / saveReminder / hasReminder 追加 | ✅ |
| `incident.commands.ts` | モーダル対応（`views.open`）。`/incident start` / `end` / `status` / `help` サブコマンド | ✅ |
| `incident.views.ts`（新規） | モーダル送信ハンドラー（start / end / status）。チャンネル自動作成（`conversations.create` + `conversations.invite`）。ランブック検索・ピン留め | ✅ |
| `incident.routes.ts` | GET `/incidents/:id/status-updates` エンドポイント追加 | ✅ |
| `slack.handler.ts` | `view_submission` イベント（incident_start_modal / incident_end_modal / incident_status_modal）のハンドラー登録 | ✅ |
| `message.events.ts` | 変更なし（専用チャンネルのメッセージのみ記録される） | — |
| `sst.config.ts` | EventBridge Cron + リマインド用 Lambda 追加 | ✅ |
| `incident.reminder.ts`（新規） | 放置インシデントのリマインド Lambda ハンドラー（2時間無更新 / 24時間オープン） | ✅ |
| `postmortem.service.ts` | ポストモーテム生成時に構造化データ（severity, statusUpdates, resolution）を活用 | 🔧 P2 |

### フロントエンド

| ファイル | 変更内容 | 状態 |
|---------|---------|------|
| `api-client.ts` | `StatusUpdate` 型追加。`getStatusUpdates()` 関数追加 | ✅ |
| `IncidentDetail.vue` | ヘッダーに概要表示（severity/impact/resolution）。タイムラインにステータス変更イベントをメッセージと統合表示 | ✅ |
| `IncidentList.vue` | 重要度バッジ表示 | ✅ |
| `Dashboard.vue` | アクティブインシデント数表示。ポストモーテム未作成リマインド。Recent Incidents セクション | 🔧 P2 |

### Slack Bot 権限

| 現状 | 追加が必要 |
|------|-----------|
| `chat:write` | 変更なし（postMessage に必要な権限は同じ） |
| `commands` | 変更なし |
| — | `channels:manage`（チャンネル自動作成: `conversations.create`） |
| — | `groups:write`（プライベートチャンネル作成が必要な場合） |
| — | `pins:write`（ピン留め用） |

---

## 実装優先度

### P0: 最低限これがないと使いづらい — ✅ 完了
1. ✅ **`respond()` → `client.chat.postMessage()` 変更 + 専用チャンネル自動作成** — 全員に見える形にし、インシデントごとにチャンネルを分離
2. ✅ **起票時のモーダル追加** — タイトル（必須）、重要度（必須）、影響範囲（任意）
3. ✅ **クローズ時のモーダル追加** — 解決方法の入力
4. ✅ **クローズ時にポストモーテム作成リンクを表示**

### P1: 対応の質を上げる — ✅ 完了
5. ✅ **`/incident status` コマンド** — 状態更新の記録
6. ✅ **`/incident help` コマンド** — 使い方をすぐ確認できる
7. ✅ **放置インシデントのリマインド** — 2時間無更新 / 24時間オープンで自動通知
8. ✅ **Web UI のインシデント詳細にステータス変更タイムライン表示**
9. ✅ **Web UI のインシデント詳細ヘッダーに概要表示**（重要度、影響範囲、解決方法）

### P2: ナレッジ循環を強化 — 🔧 未着手
10. **ダッシュボードにアクティブインシデント表示**
11. **ポストモーテム未作成インシデントのリマインド**
12. **ポストモーテム生成時に構造化データ（severity, status updates, resolution）を活用**
