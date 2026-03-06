export interface Runbook {
	readonly id: string;
	readonly title: string;
	readonly content: string;
	readonly tags: readonly string[];
	readonly createdAt: string;
	readonly updatedAt: string;
	readonly createdBy: string;
	readonly updatedBy: string;
}

export interface CreateRunbookRequest {
	readonly title: string;
	readonly content: string;
	readonly tags: readonly string[];
}

export interface UpdateRunbookRequest {
	readonly title: string;
	readonly content: string;
	readonly tags: readonly string[];
}
