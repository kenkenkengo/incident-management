import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from "@slack/bolt";
import type { WebClient } from "@slack/web-api";
import { enqueueSlackTask } from "../slack/slack.tasks";
import { addBacklogComment } from "./backlog.service";
import {
	findActiveByChannel,
	findActiveBySourceChannel,
	hasBacklogComment,
	saveBacklogComment,
} from "./incident.repository";

// カスタム絵文字 :incident: を付けると、その発言を種にインシデントを起票する
const INCIDENT_EMOJI = "incident";
// :memo: を専用チャンネルの発言に付けると、その発言を Backlog 課題へ追記する
const MEMO_EMOJI = "memo";

type ReactionEvent = SlackEventMiddlewareArgs<"reaction_added">["event"];

// 対象メッセージの本文・投稿者・パーマリンクを取得する
const fetchMessage = async (
	client: WebClient,
	channel: string,
	ts: string,
): Promise<{ text: string; author: string; permalink: string } | null> => {
	let text = "";
	let author = "";
	try {
		const res = await client.conversations.history({
			channel,
			latest: ts,
			oldest: ts,
			inclusive: true,
			limit: 1,
		});
		const msg = res.messages?.[0];
		text = msg?.text ?? "";
		author = msg?.user ?? "";
	} catch {
		return null;
	}
	if (!text) return null;

	let permalink = "";
	try {
		const p = await client.chat.getPermalink({ channel, message_ts: ts });
		permalink = p.permalink ?? "";
	} catch {
		// 取得失敗時はリンクなし
	}
	return { text, author, permalink };
};

// 🚨 リアクション: 発言を種にインシデントを起票する
const createIncidentFromMessage = async (
	event: ReactionEvent,
	client: WebClient,
): Promise<void> => {
	if (event.item.type !== "message") return;
	const channel = event.item.channel;
	const ts = event.item.ts;
	const userId = event.user;

	// このチャンネルに既にアクティブなインシデントがあれば起票しない（重複防止）
	const existing = await findActiveBySourceChannel(channel);
	if (existing) {
		try {
			await client.chat.postEphemeral({
				channel,
				user: userId,
				text: `このチャンネルには既にアクティブなインシデントがあります："${existing.title}"`,
			});
		} catch {
			// 無視
		}
		return;
	}

	const msg = await fetchMessage(client, channel, ts);
	if (!msg) return;

	// タイトルは1行・120字に整形
	const title = msg.text.replace(/\s+/g, " ").trim().slice(0, 120);

	await enqueueSlackTask({
		kind: "incident_start",
		channelId: channel,
		userId,
		title,
		severity: "SEV2",
		sourceText: msg.text.slice(0, 2000),
		...(msg.permalink && { sourceLink: msg.permalink }),
	});
};

// :memo: リアクション: 専用チャンネルの発言を Backlog 課題へ追記する
const appendMessageToBacklog = async (
	event: ReactionEvent,
	client: WebClient,
): Promise<void> => {
	if (event.item.type !== "message") return;
	const channel = event.item.channel;
	const ts = event.item.ts;

	const incident = await findActiveByChannel(channel);
	if (!incident?.backlogIssueKey) return;

	// 同じ発言を複数回リアクションしても1回だけ追記
	if (await hasBacklogComment(incident.id, ts)) return;

	const msg = await fetchMessage(client, channel, ts);
	if (!msg) return;

	let authorName = msg.author;
	if (msg.author) {
		try {
			const u = await client.users.info({ user: msg.author });
			authorName =
				u.user?.profile?.display_name || u.user?.real_name || msg.author;
		} catch {
			// 取得失敗時は user ID のまま
		}
	}

	const content =
		`【Slackから追記】${authorName ? `${authorName}: ` : ""}${msg.text}` +
		(msg.permalink ? `\n${msg.permalink}` : "");

	const ok = await addBacklogComment(incident.backlogIssueKey, content);
	if (!ok) return;
	await saveBacklogComment(incident.id, ts);

	try {
		await client.chat.postMessage({
			channel,
			thread_ts: ts,
			text: `📝 この発言を Backlog \`${incident.backlogIssueKey}\` に追記しました。`,
		});
	} catch {
		// 無視
	}
};

export const handleReactionAdded = async ({
	event,
	client,
}: AllMiddlewareArgs & SlackEventMiddlewareArgs<"reaction_added">) => {
	if (event.item.type !== "message") return;

	if (event.reaction === INCIDENT_EMOJI) {
		await createIncidentFromMessage(event, client);
		return;
	}
	if (event.reaction === MEMO_EMOJI) {
		await appendMessageToBacklog(event, client);
	}
};
