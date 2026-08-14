import {
	BatchGetCommand,
	GetCommand,
	PutCommand,
	QueryCommand,
	UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { client, TABLE_NAME } from "../lib/dynamodb.client";
import {
	decodeCursor,
	encodeCursor,
	type PaginatedResult,
	type PaginationParams,
} from "../lib/pagination";
import type {
	CreateIncidentRequest,
	Incident,
	IncidentMessage,
	Postmortem,
	StatusUpdate,
} from "./incident.types";

const incidentKey = (id: string) => ({
	pk: `INCIDENT#${id}`,
	sk: "META",
});

const messageKey = (incidentId: string, messageTs: string) => ({
	pk: `INCIDENT#${incidentId}`,
	sk: `MSG#${messageTs}`,
});

const postmortemKey = (incidentId: string) => ({
	pk: `INCIDENT#${incidentId}`,
	sk: "POSTMORTEM",
});

const toIncident = (item: Record<string, unknown>): Incident => ({
	id: item.id as string,
	channelId: item.channelId as string,
	sourceChannelId:
		(item.sourceChannelId as string) ?? (item.channelId as string),
	title: item.title as string,
	severity: (item.severity as "SEV1" | "SEV2" | "SEV3") ?? "SEV3",
	impact: item.impact as string | undefined,
	project: item.project as string | undefined,
	externalImpact: item.externalImpact as boolean | undefined,
	backlogIssueKey: item.backlogIssueKey as string | undefined,
	resolution: item.resolution as string | undefined,
	status: item.status as "active" | "closed",
	startedAt: item.startedAt as string,
	endedAt: item.endedAt as string | undefined,
	startedBy: item.startedBy as string,
});

const toMessage = (item: Record<string, unknown>): IncidentMessage => ({
	incidentId: item.incidentId as string,
	messageTs: item.messageTs as string,
	userId: item.userId as string,
	userName: item.userName as string,
	text: item.text as string,
	recordedAt: item.recordedAt as string,
});

export const create = async (
	data: CreateIncidentRequest,
	channelId: string,
	sourceChannelId: string,
	startedBy: string,
): Promise<Incident> => {
	const id = crypto.randomUUID();
	const startedAt = new Date().toISOString();
	const incident: Incident = {
		id,
		channelId,
		sourceChannelId,
		title: data.title,
		status: "active",
		startedAt,
		startedBy,
		severity: data.severity,
		...(data.impact !== undefined && { impact: data.impact }),
		...(data.project !== undefined && { project: data.project }),
		...(data.externalImpact !== undefined && {
			externalImpact: data.externalImpact,
		}),
	};
	await client.send(
		new PutCommand({
			TableName: TABLE_NAME,
			Item: {
				...incidentKey(id),
				...incident,
				GSI1PK: "INCIDENT",
				GSI1SK: startedAt,
				GSI2PK: channelId,
				GSI2SK: "active",
				GSI3PK: sourceChannelId,
				GSI3SK: "active",
			},
		}),
	);
	return incident;
};

export const findById = async (id: string): Promise<Incident | null> => {
	const result = await client.send(
		new GetCommand({
			TableName: TABLE_NAME,
			Key: incidentKey(id),
		}),
	);
	return result.Item ? toIncident(result.Item) : null;
};

export const findActiveByChannel = async (
	channelId: string,
): Promise<Incident | null> => {
	const result = await client.send(
		new QueryCommand({
			TableName: TABLE_NAME,
			IndexName: "GSI2",
			KeyConditionExpression: "GSI2PK = :channelId AND GSI2SK = :active",
			ExpressionAttributeValues: {
				":channelId": channelId,
				":active": "active",
			},
			Limit: 1,
		}),
	);
	return result.Items?.[0] ? toIncident(result.Items[0]) : null;
};

export const findActiveBySourceChannel = async (
	sourceChannelId: string,
): Promise<Incident | null> => {
	const result = await client.send(
		new QueryCommand({
			TableName: TABLE_NAME,
			IndexName: "GSI3",
			KeyConditionExpression: "GSI3PK = :sourceChannelId AND GSI3SK = :active",
			ExpressionAttributeValues: {
				":sourceChannelId": sourceChannelId,
				":active": "active",
			},
			Limit: 1,
		}),
	);
	return result.Items?.[0] ? toIncident(result.Items[0]) : null;
};

export const close = async (
	id: string,
	resolution: string,
): Promise<Incident | null> => {
	try {
		const result = await client.send(
			new UpdateCommand({
				TableName: TABLE_NAME,
				Key: incidentKey(id),
				UpdateExpression:
					"SET #status = :closedStatus, endedAt = :endedAt, resolution = :resolution, GSI2SK = :closedStatus, GSI3SK = :closedStatus",
				ExpressionAttributeNames: {
					"#status": "status",
				},
				ExpressionAttributeValues: {
					":closedStatus": "closed",
					":endedAt": new Date().toISOString(),
					":resolution": resolution,
				},
				ReturnValues: "ALL_NEW",
			}),
		);
		return result.Attributes ? toIncident(result.Attributes) : null;
	} catch (error) {
		if (
			error instanceof Error &&
			error.name === "ConditionalCheckFailedException"
		) {
			return null;
		}
		throw error;
	}
};

export const listAll = async (
	pagination: PaginationParams,
	status?: "active" | "closed",
): Promise<PaginatedResult<Incident>> => {
	const expressionValues: Record<string, string> = {
		":type": "INCIDENT",
	};
	const expressionNames: Record<string, string> = {};
	let filterExpression: string | undefined;

	if (status) {
		filterExpression = "#status = :status";
		expressionNames["#status"] = "status";
		expressionValues[":status"] = status;
	}

	const result = await client.send(
		new QueryCommand({
			TableName: TABLE_NAME,
			IndexName: "GSI1",
			KeyConditionExpression: "GSI1PK = :type",
			FilterExpression: filterExpression,
			ExpressionAttributeValues: expressionValues,
			ExpressionAttributeNames:
				Object.keys(expressionNames).length > 0 ? expressionNames : undefined,
			Limit: pagination.limit,
			ExclusiveStartKey: pagination.cursor
				? decodeCursor(pagination.cursor)
				: undefined,
			ScanIndexForward: false,
		}),
	);

	return {
		items: (result.Items ?? []).map(toIncident),
		nextCursor: result.LastEvaluatedKey
			? encodeCursor(result.LastEvaluatedKey)
			: null,
	};
};

export const listClosedWithoutPostmortem = async (
	limit = 50,
): Promise<readonly Incident[]> => {
	const incidentsWithoutPostmortem: Incident[] = [];
	let lastEvaluatedKey: Record<string, unknown> | undefined;

	while (incidentsWithoutPostmortem.length < limit) {
		const result = await client.send(
			new QueryCommand({
				TableName: TABLE_NAME,
				IndexName: "GSI1",
				KeyConditionExpression: "GSI1PK = :type",
				FilterExpression: "#status = :closed",
				ExpressionAttributeValues: {
					":type": "INCIDENT",
					":closed": "closed",
				},
				ExpressionAttributeNames: {
					"#status": "status",
				},
				Limit: limit,
				ExclusiveStartKey: lastEvaluatedKey,
				ScanIndexForward: false,
			}),
		);

		const incidents = (result.Items ?? []).map(toIncident);

		if (incidents.length > 0) {
			const keys = incidents.map((inc) => postmortemKey(inc.id));
			const batchResult = await client.send(
				new BatchGetCommand({
					RequestItems: {
						[TABLE_NAME]: { Keys: keys },
					},
				}),
			);
			const existingPostmortemIds = new Set(
				(batchResult.Responses?.[TABLE_NAME] ?? []).map(
					(item) => item.incidentId as string,
				),
			);

			for (const incident of incidents) {
				if (!existingPostmortemIds.has(incident.id)) {
					incidentsWithoutPostmortem.push(incident);
					if (incidentsWithoutPostmortem.length >= limit) {
						break;
					}
				}
			}
		}

		if (!result.LastEvaluatedKey) {
			break;
		}

		lastEvaluatedKey = result.LastEvaluatedKey as Record<string, unknown>;
	}

	return incidentsWithoutPostmortem;
};

export const addMessage = async (
	incidentId: string,
	data: {
		readonly userId: string;
		readonly userName: string;
		readonly text: string;
		readonly messageTs: string;
	},
): Promise<IncidentMessage> => {
	const message: IncidentMessage = {
		incidentId,
		...data,
		recordedAt: new Date().toISOString(),
	};
	await client.send(
		new PutCommand({
			TableName: TABLE_NAME,
			Item: {
				...messageKey(incidentId, data.messageTs),
				...message,
			},
		}),
	);
	return message;
};

export const listMessages = async (
	incidentId: string,
	pagination: PaginationParams,
): Promise<PaginatedResult<IncidentMessage>> => {
	const result = await client.send(
		new QueryCommand({
			TableName: TABLE_NAME,
			KeyConditionExpression: "pk = :pk AND begins_with(sk, :skPrefix)",
			ExpressionAttributeValues: {
				":pk": `INCIDENT#${incidentId}`,
				":skPrefix": "MSG#",
			},
			Limit: pagination.limit,
			ExclusiveStartKey: pagination.cursor
				? decodeCursor(pagination.cursor)
				: undefined,
			ScanIndexForward: true,
		}),
	);

	return {
		items: (result.Items ?? []).map(toMessage),
		nextCursor: result.LastEvaluatedKey
			? encodeCursor(result.LastEvaluatedKey)
			: null,
	};
};

export const listAllMessages = async (
	incidentId: string,
): Promise<readonly IncidentMessage[]> => {
	const allMessages: IncidentMessage[] = [];
	let exclusiveStartKey: Record<string, unknown> | undefined;

	do {
		const result = await client.send(
			new QueryCommand({
				TableName: TABLE_NAME,
				KeyConditionExpression: "pk = :pk AND begins_with(sk, :skPrefix)",
				ExpressionAttributeValues: {
					":pk": `INCIDENT#${incidentId}`,
					":skPrefix": "MSG#",
				},
				ExclusiveStartKey: exclusiveStartKey,
				ScanIndexForward: true,
			}),
		);

		allMessages.push(...(result.Items ?? []).map(toMessage));
		exclusiveStartKey = result.LastEvaluatedKey;
	} while (exclusiveStartKey);

	return allMessages;
};

export const savePostmortem = async (
	incidentId: string,
	content: string,
	modelId: string,
): Promise<Postmortem> => {
	const postmortem: Postmortem = {
		incidentId,
		content,
		generatedAt: new Date().toISOString(),
		modelId,
	};
	await client.send(
		new PutCommand({
			TableName: TABLE_NAME,
			Item: {
				...postmortemKey(incidentId),
				...postmortem,
			},
		}),
	);
	return postmortem;
};

export const getPostmortem = async (
	incidentId: string,
): Promise<Postmortem | null> => {
	const result = await client.send(
		new GetCommand({
			TableName: TABLE_NAME,
			Key: postmortemKey(incidentId),
		}),
	);
	return (result.Item as Postmortem) ?? null;
};

const statusUpdateKey = (incidentId: string, updatedAt: string) => ({
	pk: `INCIDENT#${incidentId}`,
	sk: `STATUS#${updatedAt}`,
});

const toStatusUpdate = (item: Record<string, unknown>): StatusUpdate => ({
	incidentId: item.incidentId as string,
	status: item.status as StatusUpdate["status"],
	message: item.message as string | undefined,
	updatedBy: item.updatedBy as string,
	updatedAt: item.updatedAt as string,
});

export const addStatusUpdate = async (
	data: StatusUpdate,
): Promise<StatusUpdate> => {
	await client.send(
		new PutCommand({
			TableName: TABLE_NAME,
			Item: {
				...statusUpdateKey(data.incidentId, data.updatedAt),
				...data,
			},
		}),
	);
	return data;
};

export const listStatusUpdates = async (
	incidentId: string,
): Promise<readonly StatusUpdate[]> => {
	const result = await client.send(
		new QueryCommand({
			TableName: TABLE_NAME,
			KeyConditionExpression: "pk = :pk AND begins_with(sk, :skPrefix)",
			ExpressionAttributeValues: {
				":pk": `INCIDENT#${incidentId}`,
				":skPrefix": "STATUS#",
			},
			ScanIndexForward: true,
		}),
	);

	return (result.Items ?? []).map(toStatusUpdate);
};

export const getLatestActivity = async (
	incidentId: string,
): Promise<string | null> => {
	const pk = `INCIDENT#${incidentId}`;

	// 最新メッセージと最新ステータス更新を並列取得（SK降順で1件）
	const [msgResult, statusResult] = await Promise.all([
		client.send(
			new QueryCommand({
				TableName: TABLE_NAME,
				KeyConditionExpression: "pk = :pk AND begins_with(sk, :skPrefix)",
				ExpressionAttributeValues: { ":pk": pk, ":skPrefix": "MSG#" },
				ScanIndexForward: false,
				Limit: 1,
			}),
		),
		client.send(
			new QueryCommand({
				TableName: TABLE_NAME,
				KeyConditionExpression: "pk = :pk AND begins_with(sk, :skPrefix)",
				ExpressionAttributeValues: { ":pk": pk, ":skPrefix": "STATUS#" },
				ScanIndexForward: false,
				Limit: 1,
			}),
		),
	]);

	const latestMsgTs = msgResult.Items?.[0]?.recordedAt as string | undefined;
	const latestStatusTs = statusResult.Items?.[0]?.updatedAt as
		| string
		| undefined;

	if (!latestMsgTs && !latestStatusTs) return null;
	if (!latestMsgTs) return latestStatusTs!;
	if (!latestStatusTs) return latestMsgTs;

	return latestMsgTs > latestStatusTs ? latestMsgTs : latestStatusTs;
};

const reminderKey = (incidentId: string, type: string) => ({
	pk: `INCIDENT#${incidentId}`,
	sk: `REMINDER#${type}`,
});

export const hasReminder = async (
	incidentId: string,
	type: string,
): Promise<boolean> => {
	const result = await client.send(
		new GetCommand({
			TableName: TABLE_NAME,
			Key: reminderKey(incidentId, type),
		}),
	);
	return !!result.Item;
};

export const saveReminder = async (
	incidentId: string,
	type: string,
): Promise<void> => {
	await client.send(
		new PutCommand({
			TableName: TABLE_NAME,
			Item: {
				...reminderKey(incidentId, type),
				sentAt: new Date().toISOString(),
			},
		}),
	);
};

// Backlog 連携のモード設定（P1-3 モード切替）。
// DynamoDB の単一設定アイテムで on/off・起票先プロジェクトを保持し、デプロイ不要で切替可能。
// 未設定時は enabled=false（安全側=起票しない）。
export interface BacklogConfig {
	readonly enabled: boolean;
	readonly projectKey: string;
}

const BACKLOG_CONFIG_KEY = { pk: "CONFIG", sk: "BACKLOG" };

export const getBacklogConfig = async (): Promise<BacklogConfig> => {
	const result = await client.send(
		new GetCommand({ TableName: TABLE_NAME, Key: BACKLOG_CONFIG_KEY }),
	);
	const item = result.Item;
	return {
		enabled: item?.enabled === true,
		projectKey: (item?.projectKey as string) ?? "TR",
	};
};

export const setBacklogConfig = async (cfg: BacklogConfig): Promise<void> => {
	await client.send(
		new PutCommand({
			TableName: TABLE_NAME,
			Item: {
				...BACKLOG_CONFIG_KEY,
				enabled: cfg.enabled,
				projectKey: cfg.projectKey,
			},
		}),
	);
};

// 連携済み Backlog 課題キーをインシデントに保存する（:memo: 追記に使用）
export const setBacklogIssueKey = async (
	incidentId: string,
	issueKey: string,
): Promise<void> => {
	await client.send(
		new UpdateCommand({
			TableName: TABLE_NAME,
			Key: incidentKey(incidentId),
			UpdateExpression: "SET backlogIssueKey = :k",
			ExpressionAttributeValues: { ":k": issueKey },
		}),
	);
};

// :memo: による Backlog 追記の重複防止マーカー（発言 ts 単位）
const backlogCommentKey = (incidentId: string, ts: string) => ({
	pk: `INCIDENT#${incidentId}`,
	sk: `BLC#${ts}`,
});

export const hasBacklogComment = async (
	incidentId: string,
	ts: string,
): Promise<boolean> => {
	const result = await client.send(
		new GetCommand({
			TableName: TABLE_NAME,
			Key: backlogCommentKey(incidentId, ts),
		}),
	);
	return !!result.Item;
};

export const saveBacklogComment = async (
	incidentId: string,
	ts: string,
): Promise<void> => {
	await client.send(
		new PutCommand({
			TableName: TABLE_NAME,
			Item: {
				...backlogCommentKey(incidentId, ts),
				at: new Date().toISOString(),
			},
		}),
	);
};

// リーダー自動招待の設定。DynamoDB の設定アイテムで on/off・招待メンバーを保持。
// 未設定時は enabled=false（テスト安全側=起票者のみ招待）。leaders 未設定時は既定リーダー陣。
export interface InviteConfig {
	readonly enabled: boolean;
	readonly leaders: readonly string[];
}

// 既定の開発リーダー陣（Kouta Kawaguchi は除外）: îo / Kengo / Kouki Nishida / omizu / Hiromichi Honda
const DEFAULT_LEADERS = [
	"URX8H5H26",
	"U01J1HU9HP1",
	"U034NN6KQLW",
	"U3VMFHU2W",
	"UH0NG5UTS",
];

const INVITE_CONFIG_KEY = { pk: "CONFIG", sk: "INVITE" };

export const getInviteConfig = async (): Promise<InviteConfig> => {
	const result = await client.send(
		new GetCommand({ TableName: TABLE_NAME, Key: INVITE_CONFIG_KEY }),
	);
	const item = result.Item;
	return {
		enabled: item?.enabled === true,
		leaders: (item?.leaders as string[]) ?? DEFAULT_LEADERS,
	};
};

export const setInviteConfig = async (cfg: {
	enabled: boolean;
	leaders?: readonly string[];
}): Promise<void> => {
	await client.send(
		new PutCommand({
			TableName: TABLE_NAME,
			Item: {
				...INVITE_CONFIG_KEY,
				enabled: cfg.enabled,
				leaders: cfg.leaders ?? DEFAULT_LEADERS,
			},
		}),
	);
};

// 初動チェックリストの状態（ボタン式）。pk=INCIDENT#<id>, sk=CHECKLIST。
export interface ChecklistStep {
	readonly done: boolean;
	readonly by?: string;
	readonly at?: string;
}
export interface ChecklistState {
	readonly incidentId: string;
	readonly channelId: string;
	messageTs?: string;
	readonly createdAt: string;
	// stepKey -> 完了状態
	readonly steps: Record<string, ChecklistStep>;
	// roleKey -> userId（未アサインのキーは持たない）
	readonly roles: Record<string, string>;
}

const checklistKey = (incidentId: string) => ({
	pk: `INCIDENT#${incidentId}`,
	sk: "CHECKLIST",
});

export const getChecklist = async (
	incidentId: string,
): Promise<ChecklistState | null> => {
	const result = await client.send(
		new GetCommand({ TableName: TABLE_NAME, Key: checklistKey(incidentId) }),
	);
	return result.Item ? (result.Item as unknown as ChecklistState) : null;
};

export const saveChecklist = async (state: ChecklistState): Promise<void> => {
	// undefined を含めないよう明示的に組み立てる（DocumentClient が undefined を拒否するため）
	await client.send(
		new PutCommand({
			TableName: TABLE_NAME,
			Item: {
				...checklistKey(state.incidentId),
				incidentId: state.incidentId,
				channelId: state.channelId,
				createdAt: state.createdAt,
				steps: state.steps,
				roles: state.roles,
				...(state.messageTs !== undefined && { messageTs: state.messageTs }),
			},
		}),
	);
};
