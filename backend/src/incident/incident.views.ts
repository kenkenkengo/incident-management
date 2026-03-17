import type { AllMiddlewareArgs, SlackViewMiddlewareArgs } from "@slack/bolt";
import { Resource } from "sst";
import { close, create } from "../incident/incident.repository";
import { listAllRunbooks } from "../runbook/runbook.repository";
import { searchRunbooks } from "../runbook/runbook.search";

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
	slackClient: AllMiddlewareArgs["client"],
	sourceChannelId: string,
): Promise<string> => {
	let channelName = "unknown";
	try {
		const info = await slackClient.conversations.info({
			channel: sourceChannelId,
		});
		channelName = info.channel?.name ?? "unknown";
	} catch {
		// チャンネル名取得失敗時はfallback
	}

	const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
	return `inc-${channelName}-${date}`;
};

export const handleIncidentStartSubmission = async ({
	ack,
	view,
	client,
}: AllMiddlewareArgs & SlackViewMiddlewareArgs) => {
	await ack();

	const { channelId, userId } = JSON.parse(view.private_metadata) as {
		channelId: string;
		userId: string;
	};

	const title =
		view.state.values.title_block.title.value ?? "無題のインシデント";
	const severity = view.state.values.severity_block.severity.selected_option
		?.value as "SEV1" | "SEV2" | "SEV3";
	const impact = view.state.values.impact_block.impact.value ?? undefined;

	// 1. インシデント作成
	const incident = await create(
		{ title, severity, ...(impact !== undefined && { impact }) },
		channelId,
		userId,
	);

	// 2. 専用チャンネル作成
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
				continue;
			}
		}
	}

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

	const severityLabel = {
		SEV1: "SEV1 - 緊急",
		SEV2: "SEV2 - 重大",
		SEV3: "SEV3 - 軽微",
	}[severity];
	const summaryMessage =
		`🚨 *インシデント開始*\n` +
		`*タイトル:* ${title}\n` +
		`*重要度:* ${severityLabel}\n` +
		(impact ? `*影響範囲:* ${impact}\n` : "") +
		`*起票者:* <@${userId}>\n` +
		`*開始:* ${incident.startedAt}` +
		runbookSection;

	if (newChannelId) {
		// 起票者を招待
		try {
			await client.conversations.invite({
				channel: newChannelId,
				users: userId,
			});
		} catch {
			// すでに参加済みの場合など
		}

		// 専用チャンネルにサマリー投稿 + ピン留め
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

		// 元チャンネルに通知
		await client.chat.postMessage({
			channel: channelId,
			text: `🚨 インシデント「${title}」(${severityLabel}) の対応を <#${newChannelId}> で開始しました。`,
		});
	} else {
		// チャンネル作成失敗時は元チャンネルに投稿
		await client.chat.postMessage({
			channel: channelId,
			text: summaryMessage,
		});
	}
};

export const handleIncidentEndSubmission = async ({
	ack,
	view,
	client,
}: AllMiddlewareArgs & SlackViewMiddlewareArgs) => {
	await ack();

	const { incidentId, channelId } = JSON.parse(view.private_metadata) as {
		incidentId: string;
		channelId: string;
	};

	const resolution =
		view.state.values.resolution_block.resolution.value ?? "";

	const incident = await close(incidentId, resolution);
	if (!incident) {
		return;
	}

	const duration = incident.endedAt
		? formatDuration(incident.startedAt, incident.endedAt)
		: "不明";

	const siteUrl = Resource.Site.url;

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
};
