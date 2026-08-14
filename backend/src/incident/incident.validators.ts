import { z } from "zod";

export const createIncidentSchema = z.object({
	title: z.string().min(1).max(200),
	severity: z.enum(["SEV1", "SEV2", "SEV3"]),
	impact: z.string().max(500).optional(),
	project: z.string().max(200).optional(),
	externalImpact: z.boolean().optional(),
});

// 監視アラート等からの自動起票ペイロード。
// sourceChannelId は起票元となる Slack チャンネル（専用ch名・通知先の基準）。
export const autoStartIncidentSchema = z.object({
	title: z.string().min(1).max(200),
	severity: z.enum(["SEV1", "SEV2", "SEV3"]),
	impact: z.string().max(500).optional(),
	project: z.string().max(200).optional(),
	externalImpact: z.boolean().optional(),
	sourceChannelId: z.string().min(1),
	detectedBy: z.string().max(100).optional(),
});
