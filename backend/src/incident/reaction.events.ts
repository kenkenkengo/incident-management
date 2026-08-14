import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from "@slack/bolt";
import { addBacklogComment } from "./backlog.service";
import {
	findActiveByChannel,
	hasBacklogComment,
	saveBacklogComment,
} from "./incident.repository";

// この絵文字を専用チャンネルの発言に付けると、その発言を Backlog 課題へ追記する
const TRIGGER_EMOJI = "memo";

export const handleReactionAdded = async ({
	event,
	client,
}: AllMiddlewareArgs & SlackEventMiddlewareArgs<"reaction_added">) => {
	if (event.reaction !== TRIGGER_EMOJI) return;
	if (event.item.type !== "message") return;

	const channel = event.item.channel;
	const ts = event.item.ts;

	// アクティブなインシデントの専用チャンネルで、かつ Backlog 課題が連携済みのときのみ
	const incident = await findActiveByChannel(channel);
	if (!incident?.backlogIssueKey) return;

	// 同じ発言を複数回リアクションしても1回だけ追記
	if (await hasBacklogComment(incident.id, ts)) return;

	// 対象メッセージ本文と投稿者を取得
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
		return;
	}
	if (!text) return;

	let authorName = author;
	if (author) {
		try {
			const u = await client.users.info({ user: author });
			authorName = u.user?.profile?.display_name || u.user?.real_name || author;
		} catch {
			// 取得失敗時は user ID のまま
		}
	}

	let permalink = "";
	try {
		const p = await client.chat.getPermalink({ channel, message_ts: ts });
		permalink = p.permalink ?? "";
	} catch {
		// 取得失敗時はリンクなし
	}

	const content =
		`【Slackから追記】${authorName ? `${authorName}: ` : ""}${text}` +
		(permalink ? `\n${permalink}` : "");

	const ok = await addBacklogComment(incident.backlogIssueKey, content);
	if (!ok) return;
	await saveBacklogComment(incident.id, ts);

	// 追記したことをスレッドで通知
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
