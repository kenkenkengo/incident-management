import { WebClient } from "@slack/web-api";
import type { SQSHandler } from "aws-lambda";
import { Resource } from "sst";
import { runIncidentEnd, runIncidentStart } from "../incident/incident.tasks";
import type { SlackTask } from "./slack.tasks";

/**
 * Slack モーダル送信の重い後処理を担う SQS コンシューマー。
 * view_submission ハンドラが即 ack した後、ここで実際の Slack API 呼び出しや
 * DynamoDB 書き込みを行う。1 メッセージ = 1 タスク。
 */
export const handler: SQSHandler = async (event) => {
	const client = new WebClient(Resource.SlackBotToken.value);

	for (const record of event.Records) {
		const task = JSON.parse(record.body) as SlackTask;

		switch (task.kind) {
			case "incident_start":
				await runIncidentStart(client, task);
				break;
			case "incident_end":
				await runIncidentEnd(client, task);
				break;
		}
	}
};
