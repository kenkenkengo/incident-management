import type { AllMiddlewareArgs, SlashCommand } from "@slack/bolt";
import {
	close,
	create,
	findActiveByChannel,
} from "../incident/incident.repository";
import { listAll } from "../runbook/runbook.repository";
import { searchRunbooks } from "../runbook/runbook.search";

export const handleIncidentCommand = async ({
	command,
	ack,
	respond,
}: AllMiddlewareArgs & { command: SlashCommand }) => {
	await ack();
	const args = command.text.trim().split(/\s+/);
	const subcommand = args[0];

	if (subcommand === "start") {
		const title = args.slice(1).join(" ") || "無題のインシデント";

		const existing = await findActiveByChannel(command.channel_id);
		if (existing) {
			await respond(
				`このチャンネルにはすでにアクティブなインシデントがあります："${existing.title}"`,
			);
			return;
		}

		const incident = await create(
			{ title },
			command.channel_id,
			command.user_id,
		);

		let message = `🚨 インシデント開始: "${incident.title}"\nこのチャンネルのメッセージを記録しています。`;

		try {
			const allRunbooks = await listAll();
			const suggestions = searchRunbooks(allRunbooks, title);
			if (suggestions.length > 0) {
				const list = suggestions
					.map((r) => `• *${r.title}*${r.tags.length > 0 ? ` [${r.tags.join(", ")}]` : ""}`)
					.join("\n");
				message += `\n\n📖 関連するランブックが見つかりました:\n${list}\nWebアプリで詳細を確認してください。`;
			}
		} catch (error) {
			console.error("Error searching runbooks:", error);
		}

		await respond(message);
		return;
	}

	if (subcommand === "end") {
		const active = await findActiveByChannel(command.channel_id);
		if (!active) {
			await respond("このチャンネルにアクティブなインシデントはありません。");
			return;
		}
		await close(active.id);
		await respond(
			`✅ インシデント終了: "${active.title}"\nメッセージの記録を停止しました。`,
		);
		return;
	}
	await respond("使い方: `/incident start [タイトル]` または `/incident end`");
};
