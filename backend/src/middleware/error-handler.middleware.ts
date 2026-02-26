import type { ErrorHandler } from "hono";

export const errorHandler: ErrorHandler = (err, c) => {
	return c.json(
		{
			success: false,
			error: "An unexpected error occurred. Please try again later.",
		},
		500,
	);
};
