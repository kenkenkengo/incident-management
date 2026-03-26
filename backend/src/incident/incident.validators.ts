import { z } from "zod/v4";

export const createIncidentSchema = z.object({
	title: z.string().min(1).max(200),
	severity: z.enum(["SEV1", "SEV2", "SEV3"]),
	impact: z.string().max(500).optional(),
});

export const closeIncidentSchema = z.object({
	resolution: z.string().min(1).max(2000),
});

export const statusUpdateSchema = z.object({
	status: z.enum(["investigating", "identified", "responding", "recovering"]),
	message: z.string().max(500).optional(),
});
