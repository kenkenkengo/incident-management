import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
	DeleteCommand,
	DynamoDBDocumentClient,
	GetCommand,
	PutCommand,
	QueryCommand,
	ScanCommand,
	UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { Resource } from "sst";
import type {
	CreateIncidentRequest,
	Incident,
	IncidentMessage,
	Postmortem,
} from "./incident.types";

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE_NAME = Resource.IncidentTable.name;

const incidentKey = (id: string) => ({ pk: `INCIDENT#${id}`, sk: `METADATA` });
const messageKey = (incidentId: string, messageTs: string) => ({
	pk: `INCIDENT#${incidentId}`,
	sk: `MSG#${messageTs}`,
});

const postmortemKey = (incidentId: string) => ({
	pk: `INCIDENT#${incidentId}`,
	sk: "POSTMORTEM",
});

export const create = async (
	data: CreateIncidentRequest,
	channelId: string,
	startedBy: string,
): Promise<Incident> => {
	const id = crypto.randomUUID();
	const incident: Incident = {
		id,
		channelId,
		title: data.title,
		status: "active",
		startedAt: new Date().toISOString(),
		startedBy,
	};
	await client.send(
		new PutCommand({
			TableName: TABLE_NAME,
			Item: {
				...incidentKey(id),
				...incident,
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
	return (result.Item as Incident) ?? null;
};

export const findActiveByChannel = async (
	channelId: string,
): Promise<Incident | null> => {
	const result = await client.send(
		new ScanCommand({
			TableName: TABLE_NAME,
			FilterExpression:
				"sk = :sk AND channelId = :channelId AND #status = :activeStatus",
			ExpressionAttributeNames: {
				"#status": "status",
			},
			ExpressionAttributeValues: {
				":sk": "METADATA",
				":channelId": channelId,
				":activeStatus": "active",
			},
		}),
	);
	return (result.Items?.[0] as Incident) ?? null;
};

export const close = async (id: string): Promise<Incident | null> => {
	try {
		const result = await client.send(
			new UpdateCommand({
				TableName: TABLE_NAME,
				Key: incidentKey(id),
				UpdateExpression: "SET #status = :closedStatus, endedAt = :endedAt",
				ExpressionAttributeNames: {
					"#status": "status",
				},
				ExpressionAttributeValues: {
					":closedStatus": "closed",
					":endedAt": new Date().toISOString(),
				},
			}),
		);
		return (result.Attributes as Incident) ?? null;
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
	status?: "active" | "closed",
): Promise<Incident[]> => {
	const baseFilter = "sk = :sk";
	const baseValues: Record<string, string> = { ":sk": "METADATA" };

	const result = await client.send(
		new ScanCommand({
			TableName: TABLE_NAME,
			FilterExpression: status
				? `${baseFilter} AND #status = :status`
				: baseFilter,
			ExpressionAttributeNames: status ? { "#status": "status" } : undefined,
			ExpressionAttributeValues: status
				? { ...baseValues, ":status": status }
				: baseValues,
		}),
	);
	return (result.Items as Incident[]) ?? [];
};

export const addMessage = async (
	incidentId: string,
	data: { userId: string; userName: string; text: string; messageTs: string },
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
): Promise<IncidentMessage[]> => {
	const result = await client.send(
		new QueryCommand({
			TableName: TABLE_NAME,
			KeyConditionExpression: "pk = :pk AND begins_with(sk, :skPrefix)",
			ExpressionAttributeValues: {
				":pk": `INCIDENT#${incidentId}`,
				":skPrefix": "MSG#",
			},
			ScanIndexForward: true,
		}),
	);
	return (result.Items as IncidentMessage[]) ?? [];
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
