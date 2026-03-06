export interface Incident {
	readonly id: string;
	readonly channelId: string;
	readonly title: string;
	readonly status: "active" | "closed";
	readonly startedAt: string;
	readonly endedAt?: string;
	readonly startedBy: string;
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
}

export interface Postmortem {
	readonly incidentId: string;
	readonly content: string;
	readonly generatedAt: string;
	readonly modelId: string;
}
