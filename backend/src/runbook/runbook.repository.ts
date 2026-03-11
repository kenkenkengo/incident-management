import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
	DeleteCommand,
	DynamoDBDocumentClient,
	GetCommand,
	PutCommand,
	ScanCommand,
	UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { Resource } from "sst";
import type {
	CreateRunbookRequest,
	Runbook,
	UpdateRunbookRequest,
} from "./runbook.types";

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE_NAME = Resource.RunbookTable.name;

export const listAll = async (tags?: string[]): Promise<Runbook[]> => {
	if (!tags || tags.length === 0) {
		const result = await client.send(
			new ScanCommand({ TableName: TABLE_NAME }),
		);
		return (result.Items ?? []) as Runbook[];
	}

	const filterExpression = tags
		.map((_, i) => `contains(tags, :tag${i})`)
		.join(" AND ");
	const expressionAttributeValues = tags.reduce<Record<string, string>>(
		(acc, tag, i) => ({ ...acc, [`:tag${i}`]: tag }),
		{},
	);

	const result = await client.send(
		new ScanCommand({
			TableName: TABLE_NAME,
			FilterExpression: filterExpression,
			ExpressionAttributeValues: expressionAttributeValues,
		}),
	);
	return (result.Items ?? []) as Runbook[];
};

export const getAllTags = async (): Promise<string[]> => {
	const result = await client.send(
		new ScanCommand({
			TableName: TABLE_NAME,
			ProjectionExpression: "tags",
		}),
	);
	const tagsSet = new Set<string>();
	result.Items?.forEach((item) => {
		const runbook = item as Runbook;
		runbook.tags.forEach((tag) => tagsSet.add(tag));
	});
	return [...tagsSet].sort();
};

export const findById = async (id: string): Promise<Runbook | null> => {
	const result = await client.send(
		new GetCommand({
			TableName: TABLE_NAME,
			Key: { id },
		}),
	);
	return (result.Item as Runbook) ?? null;
};

export const create = async (
	data: CreateRunbookRequest,
	createdBy: string,
): Promise<Runbook> => {
	const now = new Date().toISOString();

	const runbook: Runbook = {
		id: crypto.randomUUID(),
		...data,
		createdAt: now,
		updatedAt: now,
		createdBy,
		updatedBy: createdBy,
	};
	await client.send(
		new PutCommand({
			TableName: TABLE_NAME,
			Item: runbook,
		}),
	);
	return runbook;
};

export const update = async (
	id: string,
	data: UpdateRunbookRequest,
	updatedBy: string,
): Promise<Runbook | null> => {
	try {
		const result = await client.send(
			new UpdateCommand({
				TableName: TABLE_NAME,
				Key: { id },
				UpdateExpression:
					"set #title = :title, #content = :content, tags = :tags, updatedAt = :updatedAt, updatedBy = :updatedBy",
				ExpressionAttributeNames: {
					"#title": "title",
					"#content": "content",
				},
				ExpressionAttributeValues: {
					":title": data.title,
					":content": data.content,
					":tags": data.tags,
					":updatedAt": new Date().toISOString(),
					":updatedBy": updatedBy,
				},
				ConditionExpression: "attribute_exists(id)",
				ReturnValues: "ALL_NEW",
			}),
		);
		return (result.Attributes as Runbook) ?? null;
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

export const remove = async (id: string): Promise<void> => {
	await client.send(
		new DeleteCommand({
			TableName: TABLE_NAME,
			Key: { id },
		}),
	);
};
