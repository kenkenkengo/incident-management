import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from "@slack/bolt";

// 新規パブリックチャンネル作成時に Bot を自動参加させる。
// Bot がメンバーでないチャンネルには reaction_added が配信されないため、
// 参加していないと :sos: での起票が取りこぼされる。
// 注意: channel_created はパブリックチャンネルのみ発火する。
//       プライベートチャンネルは手動招待が必要（conversations.join も使えない）。
export const handleChannelCreated = async ({
	event,
	client,
}: AllMiddlewareArgs & SlackEventMiddlewareArgs<"channel_created">) => {
	const channelId = event.channel?.id;
	if (!channelId) {
		return;
	}

	try {
		await client.conversations.join({ channel: channelId });
	} catch {
		// 参加失敗（権限不足・アーカイブ済み等）は無視する。
		// ここで throw すると Slack がイベントを再送し続けるため。
	}
};
