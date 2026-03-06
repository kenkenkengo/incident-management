import type { AllMiddlewareArgs, SlashCommand } from "@slack/bolt";
import {
	close,
	create,
	findActiveByChannel,
} from "../incident/incident.repository";

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
		await respond(
			`🚨 インシデント開始: "${incident.title}"\nこのチャンネルのメッセージを記録しています。`,
		);
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
