import type { AllMiddlewareArgs, SlackViewMiddlewareArgs } from "@slack/bolt";
import { enqueueSlackTask } from "../slack/slack.tasks";
import {
	closeIncidentSchema,
	createIncidentSchema,
} from "./incident.validators";

/**
 * view_submission ハンドラは Slack の 3 秒制限を守るため、
 * 検証まで済ませたら即 ack + キュー投入で応答を返す。
 * チャンネル作成・投稿などの重い処理は slack.worker が非同期で実行する。
 */

export const handleIncidentStartSubmission = async ({
	ack,
	view,
}: AllMiddlewareArgs & SlackViewMiddlewareArgs) => {
	await ack();

	const { channelId, userId } = JSON.parse(view.private_metadata) as {
		channelId: string;
		userId: string;
	};

	const externalImpactValue =
		view.state.values.external_impact_block.external_impact.selected_option
			?.value;

	const parsed = createIncidentSchema.safeParse({
		title: view.state.values.title_block.title.value,
		severity: view.state.values.severity_block.severity.selected_option?.value,
		impact: view.state.values.impact_block.impact.value ?? undefined,
		project: view.state.values.project_block.project.value ?? undefined,
		externalImpact:
			externalImpactValue === undefined
				? undefined
				: externalImpactValue === "true",
	});

	if (!parsed.success) {
		return;
	}

	const { title, severity, impact, project, externalImpact } = parsed.data;

	await enqueueSlackTask({
		kind: "incident_start",
		channelId,
		userId,
		title,
		severity,
		...(impact !== undefined && { impact }),
		...(project !== undefined && { project }),
		...(externalImpact !== undefined && { externalImpact }),
	});
};

export const handleIncidentEndSubmission = async ({
	ack,
	view,
}: AllMiddlewareArgs & SlackViewMiddlewareArgs) => {
	await ack();

	const { incidentId, channelId } = JSON.parse(view.private_metadata) as {
		incidentId: string;
		channelId: string;
	};

	const parsed = closeIncidentSchema.safeParse({
		resolution: view.state.values.resolution_block.resolution.value,
	});

	if (!parsed.success) {
		return;
	}

	const { resolution } = parsed.data;

	await enqueueSlackTask({
		kind: "incident_end",
		incidentId,
		channelId,
		resolution,
	});
};
