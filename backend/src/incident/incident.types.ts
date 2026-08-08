export interface Incident {
	readonly id: string;
	readonly channelId: string;
	readonly sourceChannelId: string;
	readonly title: string;
	readonly severity: "SEV1" | "SEV2" | "SEV3";
	readonly impact?: string;
	readonly status: "active" | "closed";
	readonly startedAt: string;
	readonly endedAt?: string;
	readonly startedBy: string;
	readonly resolution?: string;
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
	readonly severity: "SEV1" | "SEV2" | "SEV3";
	readonly impact?: string;
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
