import type {
	AllMiddlewareArgs,
	SlackCommandMiddlewareArgs,
} from "@slack/bolt";
import {
	findActiveByChannel,
	findActiveBySourceChannel,
} from "../incident/incident.repository";

export const handleIncidentCommand = async ({
	command,
	ack,
	respond,
	client,
}: AllMiddlewareArgs & SlackCommandMiddlewareArgs) => {
	await ack();
	const subcommand = command.text.trim().split(/\s+/)[0];

	// 引数なしの `/incident` でも起票を開始できるようにする（`/incident start` と同等）
	if (subcommand === "start" || subcommand === "") {
		const existing = await findActiveBySourceChannel(command.channel_id);
		if (existing) {
			await respond(
				`このチャンネルにはすでにアクティブなインシデントがあります："${existing.title}"`,
			);
			return;
		}

		await client.views.open({
			trigger_id: command.trigger_id,
			view: {
				type: "modal",
				callback_id: "incident_start_modal",
				private_metadata: JSON.stringify({
					channelId: command.channel_id,
					userId: command.user_id,
				}),
				title: { type: "plain_text", text: "インシデント起票" },
				submit: { type: "plain_text", text: "起票する" },
				blocks: [
					{
						type: "input",
						block_id: "title_block",
						label: { type: "plain_text", text: "タイトル" },
						element: {
							type: "plain_text_input",
							action_id: "title",
							placeholder: {
								type: "plain_text",
								text: "例: 決済APIタイムアウト多発",
							},
						},
					},
				],
			},
		});
		return;
	}

	if (subcommand === "end") {
		const active = await findActiveByChannel(command.channel_id);
		if (!active) {
			await respond("このチャンネルにアクティブなインシデントはありません。");
			return;
		}

		await client.views.open({
			trigger_id: command.trigger_id,
			view: {
				type: "modal",
				callback_id: "incident_end_modal",
				private_metadata: JSON.stringify({
					incidentId: active.id,
					channelId: command.channel_id,
				}),
				title: { type: "plain_text", text: "インシデント終了" },
				submit: { type: "plain_text", text: "終了する" },
				blocks: [
					{
						type: "section",
						text: {
							type: "mrkdwn",
							text: `*${active.title}* を終了します`,
						},
					},
					{
						type: "input",
						block_id: "resolution_block",
						label: { type: "plain_text", text: "解決方法" },
						element: {
							type: "plain_text_input",
							action_id: "resolution",
							multiline: true,
							placeholder: {
								type: "plain_text",
								text: "例: APIサーバー再起動 + コネクションプール設定を max=100 に変更",
							},
						},
					},
				],
			},
		});
		return;
	}

	await respond(
		"📋 `/incident` コマンド一覧\n\n" +
			"`/incident`（または `/incident start`）→ インシデントを起票（モーダルが開きます）\n" +
			"`/incident end` → インシデントをクローズ（モーダルが開きます）\n" +
			"`/incident help` → このヘルプを表示\n\n" +
			"※ 残したい発言には :memo: を付けると Backlog 課題に追記されます。",
	);
};
