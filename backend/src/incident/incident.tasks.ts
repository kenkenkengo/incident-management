import type { WebClient } from "@slack/web-api";
import { Resource } from "sst";
import { listAllRunbooks } from "../runbook/runbook.repository";
import { searchRunbooks } from "../runbook/runbook.search";
import type { SlackTask } from "../slack/slack.tasks";
import { createIncidentBacklogIssue } from "./backlog.service";
import {
	addStatusUpdate,
	close,
	create,
	findActiveBySourceChannel,
} from "./incident.repository";
import type { StatusUpdate } from "./incident.types";
import { formatMention, parseNotifyConfig } from "./notify.config";

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

// 初動チェックリスト（P1-2）。障害時運用ルール（営業連絡→上長報告→役割分担→影響特定）を
// 対応者が上から順にたどれるよう、専用チャンネルへ投稿しピン留めする。
const INITIAL_CHECKLIST =
	`📋 *初動チェックリスト*（対応者は上から順に。完了したらこのメッセージを編集して ☐→✅ に）\n` +
	`1. ☐ 営業へ一次連絡（まず「事象確認・調査を行う」旨を伝える）\n` +
	`2. ☐ 案件関係者・上長へ報告\n` +
	`3. ☐ 役割分担（調査役／営業連絡役を立ち上げ。1人2役は避ける）\n` +
	`4. ☐ 影響範囲の特定（対象・顧客・対外影響）\n` +
	`5. ☐ \`/incident status\` で状況を随時更新`;

const postInitialChecklist = async (
	client: WebClient,
	channelId: string,
): Promise<void> => {
	try {
		const posted = await client.chat.postMessage({
			channel: channelId,
			text: INITIAL_CHECKLIST,
		});
		if (posted.ts) {
			try {
				await client.pins.add({ channel: channelId, timestamp: posted.ts });
			} catch {
				// ピン留め失敗は無視
			}
		}
	} catch {
		// 投稿失敗は無視（再配信暴走を防ぐ）
	}
};

const notifyStakeholders = async (
	client: WebClient,
	severity: Extract<SlackTask, { kind: "incident_start" }>["severity"],
	opts: {
		readonly title: string;
		readonly impact?: string;
		readonly severityLabel: string;
		readonly incidentChannelId?: string;
		readonly sourceChannelId: string;
	},
): Promise<void> => {
	const target = parseNotifyConfig()[severity];
	const channels = target?.channels ?? [];
	if (channels.length === 0) {
		return;
	}

	const mentions = (target?.mentions ?? []).map(formatMention).join(" ");
	const link = `<#${opts.incidentChannelId ?? opts.sourceChannelId}>`;
	const text =
		`🚨 *[${opts.severityLabel}] インシデント発生*\n` +
		`*タイトル:* ${opts.title}\n` +
		(opts.impact ? `*影響範囲:* ${opts.impact}\n` : "") +
		`*対応チャンネル:* ${link}` +
		(mentions ? `\n${mentions}` : "");

	for (const channel of channels) {
		try {
			await client.chat.postMessage({ channel, text });
		} catch {
			// 通知先チャンネルに Bot 未参加などは無視（例外で暴走させない）
		}
	}
};

export const runIncidentStart = async (
	client: WebClient,
	task: Extract<SlackTask, { kind: "incident_start" }>,
): Promise<void> => {
	const {
		channelId,
		userId,
		detectedBy,
		title,
		severity,
		impact,
		project,
		externalImpact,
	} = task;

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
		{
			title,
			severity,
			...(impact !== undefined && { impact }),
			...(project !== undefined && { project }),
			...(externalImpact !== undefined && { externalImpact }),
		},
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
		(project ? `*案件・顧客:* ${project}\n` : "") +
		(externalImpact ? `*対外影響:* ⚠️ あり（顧客・対外に影響）\n` : "") +
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

		// 初動チェックリストを投稿・ピン留め（P1-2）
		await postInitialChecklist(client, newChannelId);

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

	// Backlog 課題を自動作成（P1-3）。失敗しても起票フローは止めない。
	const backlog = await createIncidentBacklogIssue({
		title,
		severity,
		...(impact !== undefined && { impact }),
		...(project !== undefined && { project }),
		...(externalImpact !== undefined && { externalImpact }),
	});
	if (backlog) {
		try {
			await client.chat.postMessage({
				channel: newChannelId ?? channelId,
				text: `📋 Backlog 課題を作成しました: <${backlog.url}|${backlog.issueKey}>`,
			});
		} catch {
			// 投稿失敗は無視
		}
	}

	// 重大度別の周知通知（上長・営業・関係チャンネル等）。設定は外部Secret（P0-2）。
	await notifyStakeholders(client, severity, {
		title,
		impact,
		severityLabel,
		incidentChannelId: newChannelId,
		sourceChannelId: channelId,
	});
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
