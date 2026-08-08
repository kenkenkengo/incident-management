import { timingSafeEqual } from "node:crypto";
import type {
	APIGatewayProxyHandlerV2,
	APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { Resource } from "sst";
import { enqueueSlackTask } from "../slack/slack.tasks";
import { autoStartIncidentSchema } from "./incident.validators";

const json = (
	statusCode: number,
	body: Record<string, unknown>,
): APIGatewayProxyStructuredResultV2 => ({
	statusCode,
	headers: { "Content-Type": "application/json" },
	body: JSON.stringify(body),
});

const tokenMatches = (provided: string, expected: string): boolean => {
	const a = Buffer.from(provided);
	const b = Buffer.from(expected);
	if (a.length !== b.length) {
		return false;
	}
	return timingSafeEqual(a, b);
};

/**
 * 監視アラート・site_watcher 等からインシデントを自動起票する公開エンドポイント。
 * Cognito ではなく共有トークン（x-auto-start-token ヘッダ）で認証し、
 * 検証後は既存の SQS ワーカー経由で起票する（P0-1）。
 */
export const handler: APIGatewayProxyHandlerV2 = async (event) => {
	const token = event.headers?.["x-auto-start-token"];
	const expected = Resource.AutoStartToken.value;
	if (!token || !tokenMatches(token, expected)) {
		return json(401, { success: false, error: "Unauthorized" });
	}

	let payload: unknown;
	try {
		payload = JSON.parse(event.body ?? "{}");
	} catch {
		return json(400, { success: false, error: "Invalid JSON body" });
	}

	const parsed = autoStartIncidentSchema.safeParse(payload);
	if (!parsed.success) {
		return json(400, {
			success: false,
			error: "Validation failed",
			details: parsed.error.issues,
		});
	}

	const {
		title,
		severity,
		impact,
		project,
		externalImpact,
		sourceChannelId,
		detectedBy,
	} = parsed.data;

	await enqueueSlackTask({
		kind: "incident_start",
		channelId: sourceChannelId,
		detectedBy: detectedBy ?? "monitoring",
		title,
		severity,
		...(impact !== undefined && { impact }),
		...(project !== undefined && { project }),
		...(externalImpact !== undefined && { externalImpact }),
	});

	// 起票処理は非同期（SQS ワーカー）。受理のみ即応答する。
	return json(202, { success: true, data: { accepted: true } });
};
