import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from "@slack/bolt";
import {
	addMessage,
	findActiveByChannel,
} from "../incident/incident.repository";

export const handleMessageEvent = async ({
	event,
	client,
}: AllMiddlewareArgs & SlackEventMiddlewareArgs<"message">) => {
	if (event.subtype) {
		return;
	}

	const incident = await findActiveByChannel(event.channel);
	if (!incident) {
		return;
	}

	let userName = event.user;
	try {
		const result = await client.users.info({ user: event.user });
		userName =
			result.user?.profile?.display_name ||
			result.user?.real_name ||
			event.user;
	} catch {
		// ユーザー名取得失敗時は user ID のまま
	}

	await addMessage(incident.id, {
		userId: event.user,
		userName,
		text: event.text ?? "",
		messageTs: event.ts,
	});
};
