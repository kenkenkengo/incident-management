export const signIn = async (email: string, password: string) => {
	const response = await fetch(`/api/auth/signin`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ email, password }),
	});
	return response.json();
};

export const refreshTokens = async (refreshToken: string) => {
	const response = await fetch(`/api/auth/refresh`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ refreshToken }),
	});
	return response.json();
};

export type PaginationMeta = {
	readonly limit: number;
	readonly nextCursor: string | null;
};

export type PaginatedResponse<T> = {
	readonly success: boolean;
	readonly data?: T[];
	readonly meta?: PaginationMeta;
	readonly error?: string;
};

export type Runbook = {
	readonly id: string;
	readonly title: string;
	readonly content: string;
	readonly tags: readonly string[];
	readonly createdAt: string;
	readonly updatedAt: string;
	readonly createdBy: string;
	readonly updatedBy: string;
};

type RunbookInput = {
	readonly title: string;
	readonly content: string;
	readonly tags: readonly string[];
};

const runbookHeaders = (accessToken: string) => ({
	"Content-Type": "application/json",
	Authorization: `Bearer ${accessToken}`,
});

const checkUnauthorized = async (response: Response): Promise<Response> => {
	if (response.status === 401) {
		throw { name: "UnauthorizedError", message: "Unauthorized", status: 401 };
	}
	return response;
};

export const listTags = async (accessToken: string) => {
	try {
		const res = await checkUnauthorized(
			await fetch(`/api/runbooks/tags`, {
				headers: runbookHeaders(accessToken),
			}),
		);
		return res.json() as Promise<{
			success: boolean;
			data?: string[];
			error?: string;
		}>;
	} catch (e: any) {
		if (e?.status === 401) return { success: false, error: "Unauthorized" };
		throw e;
	}
};

export const listRunbooks = async (
	accessToken: string,
	options?: { tags?: string[]; limit?: number; cursor?: string },
) => {
	const params = new URLSearchParams();
	if (options?.tags && options.tags.length > 0) {
		params.set("tag", options.tags.join(","));
	}
	if (options?.limit) params.set("limit", String(options.limit));
	if (options?.cursor) params.set("cursor", options.cursor);
	const query = params.toString();
	const url = query ? `/api/runbooks?${query}` : "/api/runbooks";
	try {
		const res = await checkUnauthorized(
			await fetch(url, { headers: runbookHeaders(accessToken) }),
		);
		return res.json() as Promise<PaginatedResponse<Runbook>>;
	} catch (e: any) {
		if (e?.status === 401) return { success: false, error: "Unauthorized" };
		throw e;
	}
};

export const getRunbook = async (accessToken: string, id: string) => {
	try {
		const res = await checkUnauthorized(
			await fetch(`/api/runbooks/${id}`, {
				headers: runbookHeaders(accessToken),
			}),
		);
		return res.json() as Promise<{
			success: boolean;
			data?: Runbook;
			error?: string;
		}>;
	} catch (e: any) {
		if (e?.status === 401) return { success: false, error: "Unauthorized" };
		throw e;
	}
};

export const createRunbook = async (
	accessToken: string,
	input: RunbookInput,
) => {
	try {
		const res = await checkUnauthorized(
			await fetch(`/api/runbooks`, {
				method: "POST",
				headers: runbookHeaders(accessToken),
				body: JSON.stringify(input),
			}),
		);
		return res.json() as Promise<{
			success: boolean;
			data?: Runbook;
			error?: string;
		}>;
	} catch (e: any) {
		if (e?.status === 401) return { success: false, error: "Unauthorized" };
		throw e;
	}
};

export const updateRunbook = async (
	accessToken: string,
	id: string,
	input: RunbookInput,
) => {
	try {
		const res = await checkUnauthorized(
			await fetch(`/api/runbooks/${id}`, {
				method: "PUT",
				headers: runbookHeaders(accessToken),
				body: JSON.stringify(input),
			}),
		);
		return res.json() as Promise<{
			success: boolean;
			data?: Runbook;
			error?: string;
		}>;
	} catch (e: any) {
		if (e?.status === 401) return { success: false, error: "Unauthorized" };
		throw e;
	}
};

export const deleteRunbook = async (accessToken: string, id: string) => {
	try {
		const res = await checkUnauthorized(
			await fetch(`/api/runbooks/${id}`, {
				method: "DELETE",
				headers: runbookHeaders(accessToken),
			}),
		);
		return res.json() as Promise<{ success: boolean; error?: string }>;
	} catch (e: any) {
		if (e?.status === 401) return { success: false, error: "Unauthorized" };
		throw e;
	}
};

// --- Incident API ---

export type Incident = {
	readonly id: string;
	readonly channelId: string;
	readonly title: string;
	readonly impact?: string;
	readonly status: "active" | "closed";
	readonly startedAt: string;
	readonly endedAt?: string;
	readonly startedBy: string;
	readonly resolution?: string;
};

export type IncidentMessage = {
	readonly incidentId: string;
	readonly messageTs: string;
	readonly userId: string;
	readonly userName: string;
	readonly text: string;
	readonly recordedAt: string;
};

export type Postmortem = {
	readonly incidentId: string;
	readonly content: string;
	readonly generatedAt: string;
	readonly modelId: string;
};

export type StatusUpdate = {
	readonly incidentId: string;
	readonly status: "investigating" | "identified" | "responding" | "recovering";
	readonly message?: string;
	readonly updatedBy: string;
	readonly updatedAt: string;
};

export type RunbookDraft = {
	readonly title: string;
	readonly content: string;
	readonly tags: readonly string[];
};

const authHeaders = (accessToken: string) => ({
	Authorization: `Bearer ${accessToken}`,
});

export const listIncidents = async (
	accessToken: string,
	options?: { status?: "active" | "closed"; limit?: number; cursor?: string },
) => {
	const params = new URLSearchParams();
	if (options?.status) params.set("status", options.status);
	if (options?.limit) params.set("limit", String(options.limit));
	if (options?.cursor) params.set("cursor", options.cursor);
	const query = params.toString();
	const url = query ? `/api/incidents?${query}` : "/api/incidents";
	try {
		const res = await checkUnauthorized(
			await fetch(url, { headers: authHeaders(accessToken) }),
		);
		return res.json() as Promise<PaginatedResponse<Incident>>;
	} catch (e: any) {
		if (e?.status === 401) return { success: false, error: "Unauthorized" };
		throw e;
	}
};

export const getIncident = async (accessToken: string, id: string) => {
	try {
		const res = await checkUnauthorized(
			await fetch(`/api/incidents/${id}`, {
				headers: authHeaders(accessToken),
			}),
		);
		return res.json() as Promise<{
			success: boolean;
			data?: Incident;
			error?: string;
		}>;
	} catch (e: any) {
		if (e?.status === 401) return { success: false, error: "Unauthorized" };
		throw e;
	}
};

export const getIncidentMessages = async (
	accessToken: string,
	id: string,
	options?: { limit?: number; cursor?: string },
) => {
	const params = new URLSearchParams();
	if (options?.limit) params.set("limit", String(options.limit));
	if (options?.cursor) params.set("cursor", options.cursor);
	const query = params.toString();
	const url = query
		? `/api/incidents/${id}/messages?${query}`
		: `/api/incidents/${id}/messages`;
	try {
		const res = await checkUnauthorized(
			await fetch(url, { headers: authHeaders(accessToken) }),
		);
		return res.json() as Promise<PaginatedResponse<IncidentMessage>>;
	} catch (e: any) {
		if (e?.status === 401) return { success: false, error: "Unauthorized" };
		throw e;
	}
};

export const generatePostmortem = async (accessToken: string, id: string) => {
	try {
		const res = await checkUnauthorized(
			await fetch(`/api/incidents/${id}/postmortem`, {
				method: "POST",
				headers: authHeaders(accessToken),
			}),
		);
		return res.json() as Promise<{
			success: boolean;
			data?: Postmortem;
			error?: string;
		}>;
	} catch (e: any) {
		if (e?.status === 401) return { success: false, error: "Unauthorized" };
		throw e;
	}
};

export const generateRunbookFromPostmortem = async (
	accessToken: string,
	id: string,
) => {
	try {
		const res = await checkUnauthorized(
			await fetch(`/api/incidents/${id}/generate-runbook`, {
				method: "POST",
				headers: authHeaders(accessToken),
			}),
		);
		return res.json() as Promise<{
			success: boolean;
			data?: RunbookDraft;
			error?: string;
		}>;
	} catch (e: any) {
		if (e?.status === 401) return { success: false, error: "Unauthorized" };
		throw e;
	}
};

export const getStatusUpdates = async (accessToken: string, id: string) => {
	try {
		const res = await checkUnauthorized(
			await fetch(`/api/incidents/${id}/status-updates`, {
				headers: authHeaders(accessToken),
			}),
		);
		return res.json() as Promise<{
			success: boolean;
			data?: StatusUpdate[];
			error?: string;
		}>;
	} catch (e: any) {
		if (e?.status === 401) return { success: false, error: "Unauthorized" };
		throw e;
	}
};

export const listIncidentsNeedingPostmortem = async (
	accessToken: string,
) => {
	try {
		const res = await checkUnauthorized(
			await fetch("/api/incidents/needs-postmortem", {
				headers: authHeaders(accessToken),
			}),
		);
		return res.json() as Promise<{
			success: boolean;
			data?: Incident[];
			error?: string;
		}>;
	} catch (e: any) {
		if (e?.status === 401) return { success: false, error: "Unauthorized" };
		throw e;
	}
};

export const getPostmortem = async (accessToken: string, id: string) => {
	try {
		const res = await checkUnauthorized(
			await fetch(`/api/incidents/${id}/postmortem`, {
				headers: authHeaders(accessToken),
			}),
		);
		return res.json() as Promise<{
			success: boolean;
			data?: Postmortem;
			error?: string;
		}>;
	} catch (e: any) {
		if (e?.status === 401) return { success: false, error: "Unauthorized" };
		throw e;
	}
};
