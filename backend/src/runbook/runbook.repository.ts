import {
	DeleteCommand,
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
	CreateRunbookRequest,
	Runbook,
	UpdateRunbookRequest,
} from "./runbook.types";

const runbookKey = (id: string) => ({
	pk: `RUNBOOK#${id}`,
	sk: "META",
});

const toRunbook = (item: Record<string, unknown>): Runbook => ({
	id: item.id as string,
	title: item.title as string,
	content: item.content as string,
	tags: item.tags as readonly string[],
	createdAt: item.createdAt as string,
	updatedAt: item.updatedAt as string,
	createdBy: item.createdBy as string,
	updatedBy: item.updatedBy as string,
});

export const listAll = async (
	pagination: PaginationParams,
	tags?: string[],
): Promise<PaginatedResult<Runbook>> => {
	const expressionValues: Record<string, unknown> = {
		":type": "RUNBOOK",
	};
	let filterExpression: string | undefined;

	if (tags && tags.length > 0) {
		const conditions = tags.map((tag, i) => {
			expressionValues[`:tag${i}`] = tag;
			return `contains(tags, :tag${i})`;
		});
		filterExpression = conditions.join(" AND ");
	}

	const result = await client.send(
		new QueryCommand({
			TableName: TABLE_NAME,
			IndexName: "GSI1",
			KeyConditionExpression: "GSI1PK = :type",
			FilterExpression: filterExpression,
			ExpressionAttributeValues: expressionValues,
			Limit: pagination.limit,
			ExclusiveStartKey: pagination.cursor
				? decodeCursor(pagination.cursor)
				: undefined,
			ScanIndexForward: false,
		}),
	);

	return {
		items: (result.Items ?? []).map(toRunbook),
		nextCursor: result.LastEvaluatedKey
			? encodeCursor(result.LastEvaluatedKey)
			: null,
	};
};

export const listAllRunbooks = async (): Promise<readonly Runbook[]> => {
	const allRunbooks: Runbook[] = [];
	let exclusiveStartKey: Record<string, unknown> | undefined;

	do {
		const result = await client.send(
			new QueryCommand({
				TableName: TABLE_NAME,
				IndexName: "GSI1",
				KeyConditionExpression: "GSI1PK = :type",
				ExpressionAttributeValues: { ":type": "RUNBOOK" },
				ExclusiveStartKey: exclusiveStartKey,
			}),
		);

		allRunbooks.push(...(result.Items ?? []).map(toRunbook));
		exclusiveStartKey = result.LastEvaluatedKey;
	} while (exclusiveStartKey);

	return allRunbooks;
};

export const getAllTags = async (): Promise<string[]> => {
	const tagsSet = new Set<string>();
	let exclusiveStartKey: Record<string, unknown> | undefined;

	do {
		const result = await client.send(
			new QueryCommand({
				TableName: TABLE_NAME,
				IndexName: "GSI1",
				KeyConditionExpression: "GSI1PK = :type",
				ExpressionAttributeValues: { ":type": "RUNBOOK" },
				ProjectionExpression: "tags",
				ExclusiveStartKey: exclusiveStartKey,
			}),
		);

		for (const item of result.Items ?? []) {
			const tags = item.tags as string[] | undefined;
			if (tags) {
				for (const tag of tags) {
					tagsSet.add(tag);
				}
			}
		}
		exclusiveStartKey = result.LastEvaluatedKey;
	} while (exclusiveStartKey);

	return [...tagsSet].sort();
};

export const findById = async (id: string): Promise<Runbook | null> => {
	const result = await client.send(
		new GetCommand({
			TableName: TABLE_NAME,
			Key: runbookKey(id),
		}),
	);
	return result.Item ? toRunbook(result.Item) : null;
};

export const create = async (
	data: CreateRunbookRequest,
	createdBy: string,
): Promise<Runbook> => {
	const now = new Date().toISOString();
	const id = crypto.randomUUID();

	const runbook: Runbook = {
		id,
		...data,
		createdAt: now,
		updatedAt: now,
		createdBy,
		updatedBy: createdBy,
	};

	await client.send(
		new PutCommand({
			TableName: TABLE_NAME,
			Item: {
				...runbookKey(id),
				...runbook,
				GSI1PK: "RUNBOOK",
				GSI1SK: now,
			},
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
				Key: runbookKey(id),
				UpdateExpression:
					"SET #title = :title, #content = :content, tags = :tags, updatedAt = :updatedAt, updatedBy = :updatedBy",
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
				ConditionExpression: "attribute_exists(pk)",
				ReturnValues: "ALL_NEW",
			}),
		);
		return result.Attributes ? toRunbook(result.Attributes) : null;
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
			Key: runbookKey(id),
		}),
	);
};
