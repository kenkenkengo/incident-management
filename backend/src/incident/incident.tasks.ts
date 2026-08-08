import type { WebClient } from "@slack/web-api";
import { Resource } from "sst";
import { listAllRunbooks } from "../runbook/runbook.repository";
import { searchRunbooks } from "../runbook/runbook.search";
import type { SlackTask } from "../slack/slack.tasks";
import {
	addStatusUpdate,
	close,
	create,
	findActiveBySourceChannel,
} from "./incident.repository";
import type { StatusUpdate } from "./incident.types";

const formatDuration = (startedAt: string, endedAt: string): string => {
	const diff = new Date(endedAt).getTime() - new Date(startedAt).getTime();
	const hours = Math.floor(diff / (1000 * 60 * 60));
	const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
	if (hours > 0) {
		return `${hours}時間${minutes}分`;
	}
	return `${minutes}分`;
};

const createChannelName = async (
	client: WebClient,
	sourceChannelId: string,
): Promise<string> => {
	let channelName = "unknown";
	try {
		const info = await client.conversations.info({
			channel: sourceChannelId,
		});
		channelName = info.channel?.name ?? "unknown";
	} catch {
		// チャンネル名取得失敗時はfallback
	}

	const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
	return `inc-${channelName}-${date}`;
};

const STATUS_LABELS: Record<StatusUpdate["status"], string> = {
	investigating: "調査中",
	identified: "原因特定",
	responding: "対応中",
	recovering: "復旧確認中",
};

const SEVERITY_LABELS: Record<
	Extract<SlackTask, { kind: "incident_start" }>["severity"],
	string
> = {
	SEV1: "SEV1 - 緊急",
	SEV2: "SEV2 - 重大",
	SEV3: "SEV3 - 軽微",
};

export const runIncidentStart = async (
	client: WebClient,
	task: Extract<SlackTask, { kind: "incident_start" }>,
): Promise<void> => {
	const { channelId, userId, detectedBy, title, severity, impact } = task;

	// 冪等性ガード: SQS の再配信や二重送信で同じタスクが複数回実行されても、
	// 同じ起票元にアクティブなインシデントが既にあれば新規チャンネルを作らない。
	// （初回実行で create() 済みなら、以降の再配信はここで打ち切られる）
	// 監視アラートからの自動起票が連続しても重複インシデントを作らない役割も兼ねる。
	const existing = await findActiveBySourceChannel(channelId);
	if (existing) {
		return;
	}

	// 1. 専用チャンネル作成
	const baseName = await createChannelName(client, channelId);
	let newChannelId: string | undefined;

	try {
		const createResult = await client.conversations.create({
			name: baseName,
		});
		newChannelId = createResult.channel?.id;
	} catch {
		// 同名チャンネルが存在する場合、連番を付ける
		for (let i = 2; i <= 10; i++) {
			try {
				const retryResult = await client.conversations.create({
					name: `${baseName}-${i}`,
				});
				newChannelId = retryResult.channel?.id;
				break;
			} catch {
				// この番号でのチャンネル作成に失敗した場合は、次の連番で再試行する
			}
		}
	}

	// 2. インシデント作成（専用チャンネルIDを優先、起票元チャンネルも記録）
	// 自動起票（userId 不在）の場合は startedBy に検知ソースを記録する。
	const startedBy = userId ?? `auto:${detectedBy ?? "monitoring"}`;
	const incident = await create(
		{ title, severity, ...(impact !== undefined && { impact }) },
		newChannelId ?? channelId,
		channelId,
		startedBy,
	);

	// 3. ランブック検索
	let runbookSection = "";
	try {
		const allRunbooks = await listAllRunbooks();
		const suggestions = searchRunbooks(allRunbooks, title);
		if (suggestions.length > 0) {
			const siteUrl = Resource.Site.url;
			const list = suggestions
				.map(
					(r) =>
						`• <${siteUrl}/runbooks/${r.id}|${r.title}>${r.tags.length > 0 ? ` [${r.tags.join(", ")}]` : ""}`,
				)
				.join("\n");
			runbookSection = `\n\n📖 関連ランブック:\n${list}`;
		}
	} catch {
		// ランブック検索失敗は無視
	}

	const severityLabel = SEVERITY_LABELS[severity];
	const reporter = userId
		? `<@${userId}>`
		: `🤖 自動検知${detectedBy ? ` (${detectedBy})` : ""}`;
	const summaryMessage =
		`🚨 *インシデント開始*\n` +
		`*タイトル:* ${title}\n` +
		`*重要度:* ${severityLabel}\n` +
		(impact ? `*影響範囲:* ${impact}\n` : "") +
		`*起票者:* ${reporter}\n` +
		`*開始:* ${incident.startedAt}` +
		runbookSection;

	if (newChannelId) {
		// 起票者を招待（自動起票時は招待対象の人がいないためスキップ）
		if (userId) {
			try {
				await client.conversations.invite({
					channel: newChannelId,
					users: userId,
				});
			} catch {
				// すでに参加済みの場合など
			}
		}

		// 専用チャンネルにサマリー投稿 + ピン留め
		// 投稿失敗で例外を投げると SQS 再配信ループになるため握りつぶす
		try {
			const posted = await client.chat.postMessage({
				channel: newChannelId,
				text: summaryMessage,
			});

			if (posted.ts) {
				try {
					await client.pins.add({
						channel: newChannelId,
						timestamp: posted.ts,
					});
				} catch {
					// ピン留め失敗は無視
				}
			}
		} catch {
			// 専用チャンネルへの投稿失敗は無視
		}

		// 元チャンネルに通知（Bot が起票元チャンネルに未参加だと not_in_channel に
		// なるが、致命的ではないので握りつぶす。ここで throw すると再配信暴走の原因になる）
		try {
			await client.chat.postMessage({
				channel: channelId,
				text: `🚨 インシデント「${title}」(${severityLabel}) の対応を <#${newChannelId}> で開始しました。`,
			});
		} catch {
			// 起票元チャンネルへの通知失敗は無視
		}
	} else {
		// チャンネル作成失敗時は元チャンネルに投稿
		try {
			await client.chat.postMessage({
				channel: channelId,
				text: summaryMessage,
			});
		} catch {
			// 起票元チャンネルへの投稿失敗は無視
		}
	}
};

export const runIncidentEnd = async (
	client: WebClient,
	task: Extract<SlackTask, { kind: "incident_end" }>,
): Promise<void> => {
	const { incidentId, channelId, resolution } = task;

	const incident = await close(incidentId, resolution);
	if (!incident) {
		return;
	}

	const duration = incident.endedAt
		? formatDuration(incident.startedAt, incident.endedAt)
		: "不明";

	const siteUrl = Resource.Site.url;

	// 投稿失敗で throw すると SQS 再配信ループになるため握りつぶす
	try {
		await client.chat.postMessage({
			channel: channelId,
			text:
				`✅ *インシデント終了*\n` +
				`*タイトル:* ${incident.title}\n` +
				`*重要度:* ${incident.severity}\n` +
				`*所要時間:* ${duration}\n` +
				`*解決方法:* ${resolution}\n\n` +
				`📝 <${siteUrl}/incidents/${incidentId}|ポストモーテムを作成する>`,
		});
	} catch {
		// 投稿失敗は無視
	}
};

export const runIncidentStatus = async (
	client: WebClient,
	task: Extract<SlackTask, { kind: "incident_status" }>,
): Promise<void> => {
	const { incidentId, channelId, userId, status, message } = task;

	const updatedAt = new Date().toISOString();
	await addStatusUpdate({
		incidentId,
		status,
		message,
		updatedBy: userId,
		updatedAt,
	});

	const label = STATUS_LABELS[status];
	const messageText =
		`🔄 *状態更新: ${label}*\n` +
		`by <@${userId}>` +
		(message ? `\n${message}` : "");

	// 投稿失敗で throw すると SQS 再配信ループになるため握りつぶす
	try {
		await client.chat.postMessage({
			channel: channelId,
			text: messageText,
		});
	} catch {
		// 投稿失敗は無視
	}
};
