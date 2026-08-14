# 運用整合 改善計画: 社内インシデント運用へのアプリ適合

> 作成日: 2026-08-08 / 作成: R&D（インシデント管理ツール運用担当）
>
> 本ドキュメントは、Slack 上（`#開発teamリーダーmtg_rdtl_hq`、`#trouble-report`、`#pj_wecall_product` ほか）で
> 2026年7〜8月に交わされた障害対応・障害対策の議論を調査し、本アプリ（弊社謹製インシデント管理ツール）に
> 必要な機能追加・修正を優先度つきで計画したもの。既存プラン（[implementation-plan.md](./implementation-plan.md) /
> [ux-improvement-plan.md](./ux-improvement-plan.md)）の後続に位置づく。

---

## 0. 実装状況（2026-08-14 時点）

計画のうち実装可能な項目はすべて本番（`production`）へ反映・マージ済み。PR は #6〜#25。

| 項目 | 状態 | PR | 備考 |
|---|---|---|---|
| P0-1 監視アラートからの自動起票 | ✅ 本番反映 | #10 | `POST /incidents/auto-start`（`x-auto-start-token` 認証） |
| P0-2 重大度別の周知通知 | ✅ 本番反映（**要設定で有効化**） | #11 | `IncidentNotifyConfig`(JSON) 未設定なら発火しない |
| P0-3 無更新エスカレーション | ✅ 本番反映（**要設定で有効化**） | #12 | 同上。リマインダーCronを15分粒度に変更 |
| P1-1 役割アサイン/RACI | 🔧 部分対応 | #20 | 役割立候補ボタン（調査役／営業連絡役）＋リーダー自動招待を実装。RACIの全役割定義反映は保留 |
| P1-2 初動チェックリスト | ✅ 本番反映（#20で刷新） | #13 #20 | **ボタン式**（完了記録・役割立候補・10分ナッジ） |
| P2-1 案件/顧客・対外影響フィールド | ✅ 本番反映 | #13 | 起票モーダル＋保存＋Slackサマリー表示 |
| P1-3 Backlog連携 | ✅ 本番反映（**要有効化**） | #14 #16 #17 | TR(Trouble_Report)へ起票。モード切替＋必須CF自動補完。既定OFF |
| P2-2 予防リマインド（site_watcher） | ⬜ 未着手 | — | site_watcher設定待ち。配線は主に P0-1 の利用 |

**運用要望で追加した機能（計画外）**:
- **#20 起票時の初動ガイド強化**: 初動チェックリストをボタン式に刷新（各ステップの完了を「誰が・いつ」で記録、役割立候補=調査役/営業連絡役、1人2役は警告）。10分未完了で自動ナッジ。**リーダー自動招待**（起票時に開発リーダー陣を専用chへ招集。既定OFF＝テスト時は起票者のみ。既定メンバーは Kouta Kawaguchi を除く5名）。
- **#21 `/incident`（引数なし）で起票**: `/incident start` に加え、引数なし `/incident` でも起票モーダルが開く。
- **#23 :memo: で発言をBacklogへ追記**: 専用chの発言に `:memo:` を付けると、その発言だけを当該インシデントのBacklog課題コメントへ追記（投稿者名＋パーマリンク付き、重複ガード、追記後スレッド通知）。生発言の全ミラーはせず不適切情報の混入を回避。Backlogモード連動（OFF/未連携なら追記しない）。**反映には Slack アプリ再インストールが必要**（`reactions:read` スコープ＋`reaction_added` イベント）。
- **#25 `/incident status` 廃止**: :memo: 追記で代替できるため状態更新コマンド／モーダルを削除。過去データの表示（PMのステータス欄・API）は維持。リマインダーの最終活動はメッセージ活動で継続。

**付随して実施した修正・ドキュメント**:
- #6 Slackモーダルの3秒タイムアウト＆SQS再配信暴走の解消（非同期ワーカー化・DLQ・冪等ガード）
- #7 ポストモーテムからの `<reasoning>` 除去 / #8 タイムラインに時刻・担当者
- #9 本計画ドキュメント追加 / #15 スクリプトのBiome整形 / #18 実装状況の追記
- #19 [ドリル手順書](./incident-drill-guide.md) 追加

### 有効化に必要な運用操作（未実施）
- **P0-2 / P0-3**: 通知先を設定（例）
  `npx sst secret set IncidentNotifyConfig '{"SEV1":{"channels":["C0B2W9TJ24D"],"mentions":["S08SPQM8D99"],"escalateAfterMinutes":30}}' --stage production` → `npm run deploy:prod`
  （通知先chには Bot を招待）
- **P1-3 Backlog**: `AWS_PROFILE=incident-prod node backend/scripts/set-backlog-mode.mjs on`（既定OFF。`off`/`status`/`on <projectKey>` で切替）
- **リーダー自動招待**: `AWS_PROFILE=incident-prod node backend/scripts/set-invite-mode.mjs on`（既定OFF。`off`/`status`/`on <ids>` で切替）

### 主要な設定・値（メモ）
- 自動起票エンドポイント: `https://jdei9mq01m.execute-api.ap-northeast-1.amazonaws.com/incidents/auto-start`（トークンは SST Secret `AutoStartToken`）
- Backlog: スペース `snsnap.backlog.jp` / プロジェクト `TR`(Trouble_Report, id 193440) / 種別「トラブル」(1034495) / 必須CF「プロダクト名」(220195, 複数選択)→未一致時は「その他」(itemId 26)
- リーダー既定メンバー(Kouta Kawaguchi 除外): `URX8H5H26`(îo) / `U01J1HU9HP1`(Kengo) / `U034NN6KQLW`(Kouki Nishida) / `U3VMFHU2W`(omizu) / `UH0NG5UTS`(Hiromichi Honda)
- APIキーは SST Secret `BacklogApiKey`（既存 `slack_to_backlog` のキーを流用）
- 追加した SST Secret: `AutoStartToken` / `IncidentNotifyConfig` / `BacklogApiKey`
- DynamoDB 設定アイテム（デプロイ不要で切替）: `CONFIG/BACKLOG`（Backlog）/ `CONFIG/INVITE`（リーダー招待）
- Backlog 追記トリガー絵文字: `:memo:`（`reaction.events.ts` の `TRIGGER_EMOJI`）。受信には Slack アプリに `reactions:read` スコープ＋`reaction_added` イベント購読が必要（manifest 反映済み・**要再インストール**）
- 追加スクリプト: `set-backlog-mode.mjs` / `set-invite-mode.mjs`（モード切替）/ `close-all-incidents.mjs` / `delete-all-incidents.mjs`（運用）

### 残タスク
- **Slackアプリ再インストール**: `:memo:` 追記(#23)の反映に必要（`reactions:read` スコープ＋`reaction_added` イベント）
- P1-1: RACIボードの役割定義を反映（現状は調査役／営業連絡役の2役＋リーダー招待まで対応）
- P2-2: site_watcher / ドメイン期限監視から `/incidents/auto-start` への配線
- 検証: Backlog / リーダー招待を `on` にして実起票・実招待・:memo:追記が成功するか初回確認

---

## 1. 背景（Slack 調査サマリー）

### 1.1 本アプリの導入は全社方針として進行中
- **îo_nishimura（オーナー, 08-05, `#開発teamリーダーmtg_rdtl_hq`）**:
  「障害発生時の対応をもう少し簡単にする仕組みは**ツールを導入する予定（弊社謹製）**」
  「**障害対応ツールの導入を早急に開始する必要がある**」
- **Kouta Kawaguchi（07-30）**: 「**山本さんが進行中のインシデント管理ツール運用**に伴い、RACI 見直しが必要かも」

### 1.2 最大の痛点 = 「気づくのが遅い / 通知が飛ばない」
- îo（08-05, 障害振り返り）:
  - 「メンションがなかったり、**通知が飛んでこないので気づきようがない**」
  - 「事象発生確認から**約2時間後に起票**、すでに対応も終わった状態で営業へ返信」
  - 「**対応が後手に回っている状態が続いている**」→ だからツール導入を急ぐ

### 1.3 明文化された障害時運用ルール（08-05, îo）— アプリが支援すべきフロー
1. まず**営業へ**「事象確認・調査を行う」旨を連絡
2. 調査より先に、**案件関係者・上長へ報告**
3. 速やかに**「調査役」と「営業連絡役」を分けて**立ち上げる（1人2役は非推奨）
- 補足: **障害対応の RACI を設定済み**（Kouta, 07-30。※RACI ボード本体は未反映、要取り込み）

### 1.4 検知・通知の技術方針（07-22, Kouki Nishida, `#pj_wecall_product`）
- AWS Chatbot 経由、**5XX ≥ 10件/5分でアラート**、デプロイ通知と障害通知は分離

### 1.5 既存運用は Backlog 起票
- トラブルは Backlog にレポート起票（`#notify-trouble-report` / `#notify_sre_backlog`）。**本ツールと二重管理**になりうる。

### 1.6 実際のトラブル報告フォーマット（08-03, Dior 案件, `#trouble-report`）
- 「事象 / 暫定対応 / 他案件影響調査 / 今後の対応（再発防止策）」構成 —
  本アプリのポストモーテム構成（概要 / タイムライン / 根本原因 / 対応内容 / 改善アクション）とほぼ一致。
- 実障害の多くが**ドメイン有効期限切れ**（Dior・楽天ペイ・メルペイ等）。再発防止策として「ドメイン管理とリマインド体制」「site_watcher」。

---

## 2. 現状アプリとのギャップ

| 組織が求めていること | 現状アプリ | ギャップ |
|---|---|---|
| 検知したら**即**起票・通知 | 人が手で `/incident start` | 手動起票が遅い（痛点1.2）に未対応 |
| 起票時に**関係者・上長・営業へ通知** | 起票元 ch と起票者のみ | 周知先への自動通知なし |
| **役割分担**（調査役 / 営業連絡役） | 起票者1人だけ自動招待 | 役割・複数メンバーの概念なし |
| Backlog 連携 | なし | 二重管理 |
| 未起票・未対応の**エスカレーション** | 2h / 24h リマインドのみ（起票後） | 「起票されない」には無力 |

---

## 3. 改善計画（優先度順）

各項目に「背景（Slack 根拠）」「実装概要（現アーキでの落とし所）」「関連ファイル」「工数感」を記す。
アーキ前提: Hono on Lambda（`src/index.ts`）+ Slack Bolt Lambda（`src/slack/`）+ SQS ワーカー（`src/slack/slack.worker.ts`）+ 単一 DynamoDB（`AppTable`）+ Bedrock。

### P0 — 痛点「気づくのが遅い / 通知が飛ばない」直撃

#### P0-1. アラート連携での自動起票
- **背景**: 手動起票が2時間遅れる（1.2）。監視は 5XX≥10/5分でアラート方針（1.4）。
- **実装概要**:
  - 新エンドポイント `POST /incidents/auto-start`（API Gateway 直、Slack 署名の代わりに共有トークン/HMAC 認証）。
  - CloudWatch Alarm → SNS/AWS Chatbot、または site_watcher から Webhook 受信 → 既存の起票ロジック（`runIncidentStart` 相当）を SQS 投入して起動。
  - ペイロード: タイトル / 重大度 / 影響範囲 / 起票元（サービス識別）/ 検知ソース。
- **関連ファイル**: `src/incident/incident.routes.ts`（新ルート）, `src/slack/slack.tasks.ts`（新タスク種別）, `src/incident/incident.tasks.ts`, `sst.config.ts`（ルート追加 + 認証）。
- **工数感**: 中（エンドポイント + 認証 + 既存タスク再利用）。**最も効果が大きい。**

#### P0-2. 起票時の周知先への自動通知（重大度別）
- **背景**: 「通知が飛んでこない」。ルール上まず営業・上長・案件関係者へ（1.3）。
- **実装概要**:
  - 重大度別の通知先設定（例: SEV1 → 上長 + 営業 + `#trouble-report`、SEV2 → 案件 PdM …）。
  - 専用チャンネル作成時に該当先へ自動メンション投稿。設定は環境変数（初期）→ 将来「通知設定」を `AppTable` に保持。
  - 前回の `not_in_channel` 恒久対策として、通知先 ch へ Bot を自動参加（`conversations.join` = `channels:join` スコープ追加）または明示設定。
- **関連ファイル**: `src/incident/incident.tasks.ts`（`runIncidentStart` の通知処理）, `slack-app-manifest.yaml`（スコープ）。
- **工数感**: 小〜中。

#### P0-3. 未起票・未対応のエスカレーション強化
- **背景**: リマインドは起票後 2h/24h のみ。SEV1 初動の遅れが問題（1.2）。
- **実装概要**: 既存 `IncidentReminderCron` を拡張。SEV1 は起票直後に上長メンション、一定時間ステータス更新なしでエスカレ先を段階拡大（RACI に沿う）。
- **関連ファイル**: `src/incident/incident.reminder.ts`, `sst.config.ts`（Cron 設定）。
- **工数感**: 小〜中。

### P1 — 運用ルール（RACI）への適合

#### P1-1. 役割アサイン + 複数メンバー招待
- **背景**: 「調査役と営業連絡役を分ける」「1人2役非推奨」（1.3）、RACI 設定済み。
- **実装概要**: 起票モーダルに役割（コマンダー / 調査 / 営業連絡）と対応メンバー選択を追加。専用 ch へ複数招待 + 役割をサマリーにピン留め。担当者を `AppTable` に保持し、ポストモーテムのタイムライン担当者と接続（既存の時刻・担当者表示と相性良い）。
- **関連ファイル**: `src/incident/incident.commands.ts`（モーダル）, `incident.views.ts`, `incident.tasks.ts`, `incident.types.ts`, `incident.repository.ts`。
- **工数感**: 中。

#### P1-2. 初動チェックリストの型化
- **背景**: 「営業連絡 → 上長報告 → 体制立ち上げ」の順序を守らせたい（1.3）。
- **実装概要**: 起票直後に専用 ch へチェックリスト投稿（☑ 営業へ一次連絡 / ☑ 上長報告 / ☑ 影響範囲特定）。ステータスに「一次連絡済み」を追加してもよい。
- **関連ファイル**: `incident.tasks.ts`, （任意）`incident.types.ts` のステータス拡張。
- **工数感**: 小。

#### P1-3. Backlog 連携
- **背景**: 既存は Backlog 起票運用（1.5）。二重管理の解消。
- **実装概要**: 起票時 or クローズ時に Backlog 課題を自動作成（ポストモーテム本文を貼付）。`#notify-trouble-report` へ自動ポスト。Backlog API キーは SST Secret。
- **関連ファイル**: 新規 `src/incident/backlog.service.ts`, `incident.tasks.ts`, `sst.config.ts`（Secret）。
- **工数感**: 中。

### P2 — 中長期・予防

#### P2-1. 案件 / 顧客・対外影響フィールド
- 起票モーダルに案件名・顧客・対外影響フラグを追加。ダッシュボードで顧客影響ありを強調（Dior/決済系のような対外案件を優先表示）。
- **工数感**: 小〜中。

#### P2-2. 予防リマインド（ドメイン期限 / site_watcher）
- 障害の多くがドメイン期限切れ（1.6）。ランブックに「ドメイン期限切れ対応」を登録し、site_watcher / 期限監視から自動起票（P0-1 の応用）。
- **工数感**: 大（スコープ広め、最後に）。

---

## 4. 推奨着手順

1. **P0-1（自動起票）+ P0-2（周知通知）** — 実装が比較的軽く、最大の痛点「気づくのが遅い/通知が飛ばない」を直接解消。導入価値が一気に上がる。
2. **P0-3（エスカレーション）** — 上記の効果を底上げ。
3. **P1-1 / P1-2（役割・初動チェック）** — 運用ルール（RACI）適合。※RACI ボード本体の内容を取り込んで正確化する。
4. **P1-3（Backlog 連携）** — 二重管理の解消。
5. **P2** — 案件/顧客フィールド、予防リマインド。

## 5. 未確定・要確認事項
- **RACI ボードの内容**（役割定義の正）— P1-1 に反映するため要共有。
- **監視基盤**（CloudWatch / AWS Chatbot / site_watcher）の具体構成 — P0-1 の Webhook 仕様確定に必要。
- **通知先マッピング**（重大度 → 上長/営業/案件PdM/チャンネル）の初期値 — P0-2 の設定に必要。
- Backlog のプロジェクト/課題種別・API 認証方式 — P1-3 に必要。
