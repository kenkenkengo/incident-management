export interface Incident {
	readonly id: string;
	readonly channelId: string;
	readonly sourceChannelId: string;
	readonly title: string;
	readonly impact?: string;
	// 案件・顧客名（対外案件の識別用, P2-1）
	readonly project?: string;
	// 対外影響の有無（顧客・対外に影響するか, P2-1）
	readonly externalImpact?: boolean;
	readonly status: "active" | "closed";
	readonly startedAt: string;
	readonly endedAt?: string;
	readonly startedBy: string;
	readonly resolution?: string;
	// 連携済み Backlog 課題キー（起票時に作成した場合。:memo: 追記に使用）
	readonly backlogIssueKey?: string;
}

export interface IncidentMessage {
	readonly incidentId: string;
	readonly messageTs: string;
	readonly userId: string;
	readonly userName: string;
	readonly text: string;
	readonly recordedAt: string;
}

export interface CreateIncidentRequest {
	readonly title: string;
	readonly impact?: string;
	readonly project?: string;
	readonly externalImpact?: boolean;
}

export interface Postmortem {
	readonly incidentId: string;
	readonly content: string;
	readonly generatedAt: string;
	readonly modelId: string;
}

export interface StatusUpdate {
	readonly incidentId: string;
	readonly status: "investigating" | "identified" | "responding" | "recovering";
	readonly message?: string;
	readonly updatedBy: string;
	readonly updatedAt: string;
}
