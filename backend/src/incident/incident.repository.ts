import {
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
	title: item.title as string,
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
	startedBy: string,
): Promise<Incident> => {
	const id = crypto.randomUUID();
	const startedAt = new Date().toISOString();
	const incident: Incident = {
		id,
		channelId,
		title: data.title,
		status: "active",
		startedAt,
		startedBy,
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

export const close = async (id: string): Promise<Incident | null> => {
	try {
		const result = await client.send(
			new UpdateCommand({
				TableName: TABLE_NAME,
				Key: incidentKey(id),
				UpdateExpression:
					"SET #status = :closedStatus, endedAt = :endedAt, GSI2SK = :closedStatus",
				ExpressionAttributeNames: {
					"#status": "status",
				},
				ExpressionAttributeValues: {
					":closedStatus": "closed",
					":endedAt": new Date().toISOString(),
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
