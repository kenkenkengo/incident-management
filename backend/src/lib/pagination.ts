import type { Context } from "hono";

export interface PaginationParams {
	readonly limit: number;
	readonly cursor?: string;
}

export interface PaginatedResult<T> {
	readonly items: readonly T[];
	readonly nextCursor: string | null;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export const encodeCursor = (
	lastEvaluatedKey: Record<string, unknown>,
): string =>
	Buffer.from(JSON.stringify(lastEvaluatedKey)).toString("base64url");

export const decodeCursor = (cursor: string): Record<string, unknown> =>
	JSON.parse(Buffer.from(cursor, "base64url").toString());

export const parsePaginationParams = (c: Context): PaginationParams => {
	const limitParam = c.req.query("limit");
	const cursor = c.req.query("cursor");

	const rawLimit = limitParam ? Number.parseInt(limitParam, 10) : DEFAULT_LIMIT;
	const limit = Number.isNaN(rawLimit)
		? DEFAULT_LIMIT
		: Math.min(Math.max(rawLimit, 1), MAX_LIMIT);

	return cursor ? { limit, cursor } : { limit };
};
