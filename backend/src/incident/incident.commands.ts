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

	if (subcommand === "start") {
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
					{
						type: "input",
						block_id: "severity_block",
						label: { type: "plain_text", text: "重要度" },
						element: {
							type: "static_select",
							action_id: "severity",
							options: [
								{
									text: { type: "plain_text", text: "SEV1 - 緊急" },
									value: "SEV1",
								},
								{
									text: { type: "plain_text", text: "SEV2 - 重大" },
									value: "SEV2",
								},
								{
									text: { type: "plain_text", text: "SEV3 - 軽微" },
									value: "SEV3",
								},
							],
						},
					},
					{
						type: "input",
						block_id: "impact_block",
						label: { type: "plain_text", text: "影響範囲" },
						optional: true,
						element: {
							type: "plain_text_input",
							action_id: "impact",
							placeholder: {
								type: "plain_text",
								text: "例: 本番環境・全ユーザー",
							},
						},
					},
					{
						type: "input",
						block_id: "project_block",
						label: { type: "plain_text", text: "案件・顧客" },
						optional: true,
						element: {
							type: "plain_text_input",
							action_id: "project",
							placeholder: {
								type: "plain_text",
								text: "例: Dior パルファン案件",
							},
						},
					},
					{
						type: "input",
						block_id: "external_impact_block",
						label: { type: "plain_text", text: "対外影響" },
						optional: true,
						element: {
							type: "static_select",
							action_id: "external_impact",
							placeholder: {
								type: "plain_text",
								text: "顧客・対外への影響有無",
							},
							options: [
								{
									text: {
										type: "plain_text",
										text: "あり（顧客・対外に影響）",
									},
									value: "true",
								},
								{
									text: { type: "plain_text", text: "なし（社内のみ）" },
									value: "false",
								},
							],
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

	if (subcommand === "status") {
		const active = await findActiveByChannel(command.channel_id);
		if (!active) {
			await respond("このチャンネルにアクティブなインシデントはありません。");
			return;
		}

		await client.views.open({
			trigger_id: command.trigger_id,
			view: {
				type: "modal",
				callback_id: "incident_status_modal",
				private_metadata: JSON.stringify({
					incidentId: active.id,
					channelId: command.channel_id,
					userId: command.user_id,
				}),
				title: { type: "plain_text", text: "状態更新" },
				submit: { type: "plain_text", text: "更新する" },
				blocks: [
					{
						type: "section",
						text: {
							type: "mrkdwn",
							text: `*${active.title}* の状態を更新します`,
						},
					},
					{
						type: "input",
						block_id: "status_block",
						label: { type: "plain_text", text: "現在の状態" },
						element: {
							type: "static_select",
							action_id: "status",
							options: [
								{
									text: { type: "plain_text", text: "調査中" },
									value: "investigating",
								},
								{
									text: { type: "plain_text", text: "原因特定" },
									value: "identified",
								},
								{
									text: { type: "plain_text", text: "対応中" },
									value: "responding",
								},
								{
									text: { type: "plain_text", text: "復旧確認中" },
									value: "recovering",
								},
							],
						},
					},
					{
						type: "input",
						block_id: "message_block",
						label: { type: "plain_text", text: "補足メッセージ" },
						optional: true,
						element: {
							type: "plain_text_input",
							action_id: "message",
							multiline: true,
							placeholder: {
								type: "plain_text",
								text: "例: DBコネクションプールの枯渇が原因と判明",
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
			"`/incident start` → インシデントを起票（モーダルが開きます）\n" +
			"`/incident status` → 対応状況を更新（調査中 / 原因特定 / 対応中 / 復旧確認中）\n" +
			"`/incident end` → インシデントをクローズ（モーダルが開きます）\n" +
			"`/incident help` → このヘルプを表示",
	);
};
