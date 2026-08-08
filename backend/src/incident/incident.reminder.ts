import { WebClient } from "@slack/web-api";
import { Resource } from "sst";
import {
	getLatestActivity,
	hasReminder,
	listAll,
	saveReminder,
} from "./incident.repository";
import type { Incident } from "./incident.types";
import {
	formatMention,
	type NotifyTarget,
	parseNotifyConfig,
} from "./notify.config";

const HOURS_2 = 2 * 60 * 60 * 1000;
const HOURS_24 = 24 * 60 * 60 * 1000;

// 無更新が閾値を超えたインシデントをエスカレーション通知する（P0-3）。
// 通知先・閾値は IncidentNotifyConfig の重大度別設定に従う。未設定なら何もしない。
const escalate = async (
	slackClient: WebClient,
	incident: Incident,
	cfg: NotifyTarget,
): Promise<void> => {
	const mentions = (cfg.escalateMentions ?? cfg.mentions ?? [])
		.map(formatMention)
		.join(" ");
	const channels =
		cfg.escalateChannels && cfg.escalateChannels.length > 0
			? cfg.escalateChannels
			: [incident.channelId];
	const text =
		`⛔️ *エスカレーション (${incident.severity})*\n` +
		`*${incident.title}* が ${cfg.escalateAfterMinutes}分以上更新されていません。対応状況を確認してください。\n` +
		`対応チャンネル: <#${incident.channelId}>` +
		(mentions ? `\n${mentions}` : "");

	for (const channel of channels) {
		try {
			await slackClient.chat.postMessage({ channel, text });
		} catch {
			// 通知先未参加などは無視
		}
	}
};

const sendReminder = async (
	slackClient: WebClient,
	incident: Incident,
	type: "2h" | "24h",
): Promise<void> => {
	const text =
		type === "2h"
			? "⏰ このインシデントは2時間更新がありません。\n現在の状況を `/incident status` で更新するか、解決済みなら `/incident end` してください。"
			: "⚠️ このインシデントは24時間以上オープンです。\n対応状況を確認してください。";

	await slackClient.chat.postMessage({
		channel: incident.channelId,
		text,
	});
};

export const handler = async () => {
	const slackClient = new WebClient(Resource.SlackBotToken.value);
	const now = Date.now();

	const limit = 100;
	let cursor: string | undefined;
	const incidents: Incident[] = [];

	while (true) {
		const result = await listAll({ limit, cursor }, "active");
		incidents.push(...result.items);

		if (!result.nextCursor) {
			break;
		}

		cursor = result.nextCursor;
	}

	for (const incident of incidents) {
		const startedAt = new Date(incident.startedAt).getTime();

		const latestActivity = await getLatestActivity(incident.id);
		const lastActivityAt = latestActivity
			? new Date(latestActivity).getTime()
			: startedAt;

		// 2時間無更新チェック
		if (
			now - lastActivityAt >= HOURS_2 &&
			!(await hasReminder(incident.id, "2h"))
		) {
			await sendReminder(slackClient, incident, "2h");
			await saveReminder(incident.id, "2h");
		}

		// 24時間オープンチェック
		if (
			now - startedAt >= HOURS_24 &&
			!(await hasReminder(incident.id, "24h"))
		) {
			await sendReminder(slackClient, incident, "24h");
			await saveReminder(incident.id, "24h");
		}

		// エスカレーション（P0-3）: 重大度別の閾値を無更新で超えたら通知
		const cfg = parseNotifyConfig()[incident.severity];
		if (
			cfg?.escalateAfterMinutes &&
			now - lastActivityAt >= cfg.escalateAfterMinutes * 60 * 1000 &&
			!(await hasReminder(incident.id, "escalation"))
		) {
			await escalate(slackClient, incident, cfg);
			await saveReminder(incident.id, "escalation");
		}
	}
};
