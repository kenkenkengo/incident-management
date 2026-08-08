import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { Resource } from "sst";
import type {
	CreateIncidentRequest,
	StatusUpdate,
} from "../incident/incident.types";

/**
 * Slack モーダル送信後に非同期で処理するタスク。
 * view_submission ハンドラは即 ack して本タスクをキューに積み、
 * 実際の重い処理（チャンネル作成・投稿など）は slack.worker が担う。
 */
export type SlackTask =
	| {
			readonly kind: "incident_start";
			readonly channelId: string;
			// Slack モーダル起票時は起票者の userId。監視アラートからの
			// 自動起票時は userId 不在で、代わりに detectedBy に検知ソースが入る。
			readonly userId?: string;
			readonly detectedBy?: string;
			readonly title: string;
			readonly severity: CreateIncidentRequest["severity"];
			readonly impact?: string;
	  }
	| {
			readonly kind: "incident_end";
			readonly incidentId: string;
			readonly channelId: string;
			readonly resolution: string;
	  }
	| {
			readonly kind: "incident_status";
			readonly incidentId: string;
			readonly channelId: string;
			readonly userId: string;
			readonly status: StatusUpdate["status"];
			readonly message?: string;
	  };

const sqs = new SQSClient({});

export const enqueueSlackTask = async (task: SlackTask): Promise<void> => {
	await sqs.send(
		new SendMessageCommand({
			QueueUrl: Resource.SlackTasks.url,
			MessageBody: JSON.stringify(task),
		}),
	);
};
