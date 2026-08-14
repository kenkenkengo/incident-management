import type { WebClient } from "@slack/web-api";
import { Resource } from "sst";
import { listAllRunbooks } from "../runbook/runbook.repository";
import { searchRunbooks } from "../runbook/runbook.search";
import type { SlackTask } from "../slack/slack.tasks";
import { createIncidentBacklogIssue } from "./backlog.service";
import { postInitialChecklist } from "./incident.checklist";
import {
	close,
	create,
	findActiveBySourceChannel,
	getInviteConfig,
	listAllMessages,
	setBacklogIssueKey,
} from "./incident.repository";
import { formatMention, parseNotifyConfig } from "./notify.config";
import { generateTroubleReport } from "./postmortem.service";

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

const SEVERITY_LABELS: Record<
	Extract<SlackTask, { kind: "incident_start" }>["severity"],
	string
> = {
	SEV1: "SEV1 - 緊急",
	SEV2: "SEV2 - 重大",
	SEV3: "SEV3 - 軽微",
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

		// リーダー陣を自動招待（テストモード時は無効＝起票者のみ）
		try {
			const invite = await getInviteConfig();
			if (invite.enabled) {
				const toInvite = invite.leaders.filter((id) => id !== userId);
				if (toInvite.length > 0) {
					await client.conversations.invite({
						channel: newChannelId,
						users: toInvite.join(","),
					});
				}
			}
		} catch {
			// 招待失敗（既に参加済み等）は無視
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

		// 初動チェックリスト（ボタン式）を投稿・ピン留め（P1-2）
		await postInitialChecklist(client, incident.id, newChannelId);

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
			await setBacklogIssueKey(incident.id, backlog.issueKey);
		} catch {
			// 保存失敗は無視（:memo: 追記が効かなくなるだけ）
		}
		try {
			await client.chat.postMessage({
				channel: newChannelId ?? channelId,
				text:
					`📋 Backlog 課題を作成しました: <${backlog.url}|${backlog.issueKey}>\n` +
					`（残したい発言に :memo: を付けると、この課題のコメントに追記されます）`,
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

	const siteUrl = Resource.Site.url;
	const pmLink = `📝 <${siteUrl}/incidents/${incidentId}|ポストモーテムを作成する>`;

	// 終了時にトラブル報告（定型フォーマット）を生成して専用chへ投稿する。
	let report = "";
	try {
		const messages = await listAllMessages(incidentId);
		report = await generateTroubleReport(incident, messages);
	} catch {
		// 生成失敗はフォールバックの最小メッセージで補う
	}

	const duration = incident.endedAt
		? formatDuration(incident.startedAt, incident.endedAt)
		: "不明";
	const text = report
		? `${report}\n\n${pmLink}`
		: `✅ *インシデント終了* — ${incident.title}\n*所要時間:* ${duration}\n*解決方法:* ${resolution}\n\n${pmLink}`;

	// 投稿失敗で throw すると SQS 再配信ループになるため握りつぶす
	try {
		await client.chat.postMessage({ channel: channelId, text });
	} catch {
		// 投稿失敗は無視
	}
};
