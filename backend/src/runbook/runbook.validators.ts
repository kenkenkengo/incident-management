import z from "zod";

export const createRunbookSchema = z.object({
	title: z.string().min(1).max(200),
	content: z.string().min(1),
	tags: z.array(z.string().min(1).max(50)).max(20),
});

export const updateRunbookSchema = createRunbookSchema;
