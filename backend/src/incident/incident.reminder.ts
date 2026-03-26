import { WebClient } from "@slack/web-api";
import { Resource } from "sst";
import {
	getLatestActivity,
	hasReminder,
	listAll,
	saveReminder,
} from "./incident.repository";
import type { Incident } from "./incident.types";

const HOURS_2 = 2 * 60 * 60 * 1000;
const HOURS_24 = 24 * 60 * 60 * 1000;

const sendReminder = async (
	slackClient: WebClient,
	incident: Incident,
	type: "2h" | "24h",
): Promise<void> => {
	const text =
		type === "2h"
			? "⏰ このインシデントは2時間更新がありません。\n現在の状況を `/incident status` で更新するか、解決済みなら `/incident end` してください。"
			: "⚠️ このインシデントは24時間以上オープンです。\n対応状況を確認してください。";

	await slackClient.chat.postMessage({
		channel: incident.channelId,
		text,
	});
};

export const handler = async () => {
	const slackClient = new WebClient(Resource.SlackBotToken.value);
	const now = Date.now();

	const limit = 100;
	let cursor: string | undefined;
	const incidents: Incident[] = [];

	while (true) {
		const result = await listAll({ limit, cursor }, "active");
		incidents.push(...result.items);

		if (!result.nextCursor) {
			break;
		}

		cursor = result.nextCursor;
	}

	for (const incident of incidents) {
		const startedAt = new Date(incident.startedAt).getTime();

		const latestActivity = await getLatestActivity(incident.id);
		const lastActivityAt = latestActivity
			? new Date(latestActivity).getTime()
			: startedAt;

		// 2時間無更新チェック
		if (
			now - lastActivityAt >= HOURS_2 &&
			!(await hasReminder(incident.id, "2h"))
		) {
			await sendReminder(slackClient, incident, "2h");
			await saveReminder(incident.id, "2h");
		}

		// 24時間オープンチェック
		if (
			now - startedAt >= HOURS_24 &&
			!(await hasReminder(incident.id, "24h"))
		) {
			await sendReminder(slackClient, incident, "24h");
			await saveReminder(incident.id, "24h");
		}
	}
};
