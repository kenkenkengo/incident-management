import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { PaginatedResult } from "./pagination";

interface ApiResponse<T> {
	readonly success: boolean;
	readonly data?: T;
	readonly error?: string;
}

export const successResponse = <T>(
	c: Context,
	data: T,
	status: ContentfulStatusCode = 200,
) => {
	return c.json({ success: true, data } as ApiResponse<T>, status);
};

export const paginatedResponse = <T>(
	c: Context,
	result: PaginatedResult<T>,
	limit: number,
	status: ContentfulStatusCode = 200,
) => {
	return c.json(
		{
			success: true,
			data: result.items,
			meta: { limit, nextCursor: result.nextCursor },
		},
		status,
	);
};

export const errorResponse = <T>(
	c: Context,
	error: string,
	status: ContentfulStatusCode = 400,
) => {
	return c.json({ success: false, error } as ApiResponse<T>, status);
};
