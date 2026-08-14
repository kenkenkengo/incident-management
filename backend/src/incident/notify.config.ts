import { Resource } from "sst";

// 周知/エスカレーション設定（P0-2 / P0-3）。全インシデント共通の単一設定。
// SST Secret IncidentNotifyConfig に JSON で外部設定する。未設定・不正なら空扱い（無害）。
// 例:
// {
//   "channels": ["C0B2W9TJ24D"], "mentions": ["S08SPQM8D99", "U01J1HU9HP1"],
//   "escalateAfterMinutes": 30, "escalateMentions": ["S08SPQM8D99"]
// }
export interface NotifyTarget {
	// 起票時の周知先（P0-2）
	readonly channels?: readonly string[];
	readonly mentions?: readonly string[];
	// エスカレーション（P0-3）: この分数だけ無更新ならエスカレーション通知する
	readonly escalateAfterMinutes?: number;
	// エスカレ時のメンション先（省略時は mentions を使用）
	readonly escalateMentions?: readonly string[];
	// エスカレ通知先チャンネル（省略時は対応チャンネル自身に投稿）
	readonly escalateChannels?: readonly string[];
}

// 重要度の概念は廃止したため、設定は単一の通知先（全インシデント共通）。
export const parseNotifyConfig = (): NotifyTarget => {
	try {
		const raw = Resource.IncidentNotifyConfig.value;
		if (!raw || !raw.trim()) {
			return {};
		}
		const parsed: unknown = JSON.parse(raw);
		return typeof parsed === "object" && parsed !== null
			? (parsed as NotifyTarget)
			: {};
	} catch {
		return {};
	}
};

// メンションID整形: サブチーム(S...)は <!subteam^ID>、それ以外(U.../W...)は <@ID>
export const formatMention = (id: string): string =>
	id.startsWith("S") ? `<!subteam^${id}>` : `<@${id}>`;
