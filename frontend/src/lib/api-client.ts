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
}

export const listTags = async (accessToken: string) => {
	try {
		const res = await checkUnauthorized(
			await fetch(`/api/runbooks/tags`, { headers: runbookHeaders(accessToken) })
		);
		return res.json() as Promise<{ success: boolean; data?: string[]; error?: string }>;
	} catch (e: any) {
		if (e?.status === 401) return { success: false, error: "Unauthorized" };
		throw e;
	}
};

export const listRunbooks = async (accessToken: string, tags?: string[]) => {
	const url = tags ? `/api/runbooks?tag=${encodeURIComponent(tags.join(","))}` : "/api/runbooks";
	try {
		const res = await checkUnauthorized(
			await fetch(url, { headers: runbookHeaders(accessToken) })
		);
		return res.json() as Promise<{ success: boolean; data?: Runbook[]; error?: string }>;
	} catch (e: any) {
		if (e?.status === 401) return { success: false, error: "Unauthorized" };
		throw e;
	}
};


export const getRunbook = async (accessToken: string, id: string) => {
	try {
		const res = await checkUnauthorized(
			await fetch(`/api/runbooks/${id}`, { headers: runbookHeaders(accessToken) })
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
			})
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
			})
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
			})
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
	readonly status: "active" | "closed";
	readonly startedAt: string;
	readonly endedAt?: string;
	readonly startedBy: string;
};

export type IncidentMessage = {
	readonly incidentId: string;
	readonly messageTs: string;
	readonly userId: string;
	readonly userName: string;
	readonly text: string;
	readonly recordedAt: string;
};

const authHeaders = (accessToken: string) => ({
	Authorization: `Bearer ${accessToken}`,
});

export const listIncidents = async (accessToken: string, status?: "active" | "closed") => {
	const params = status ? `?status=${status}` : "";
	try {
		const res = await checkUnauthorized(
			await fetch(`/api/incidents${params}`, { headers: authHeaders(accessToken) })
		);
		return res.json() as Promise<{ success: boolean; data?: Incident[]; error?: string }>;
	} catch (e: any) {
		if (e?.status === 401) return { success: false, error: "Unauthorized" };
		throw e;
	}
};

export const getIncident = async (accessToken: string, id: string) => {
	try {
		const res = await checkUnauthorized(
			await fetch(`/api/incidents/${id}`, { headers: authHeaders(accessToken) })
		);
		return res.json() as Promise<{ success: boolean; data?: Incident; error?: string }>;
	} catch (e: any) {
		if (e?.status === 401) return { success: false, error: "Unauthorized" };
		throw e;
	}
};

export const getIncidentMessages = async (accessToken: string, id: string) => {
	try {
		const res = await checkUnauthorized(
			await fetch(`/api/incidents/${id}/messages`, { headers: authHeaders(accessToken) })
		);
		return res.json() as Promise<{ success: boolean; data?: IncidentMessage[]; error?: string }>;
	} catch (e: any) {
		if (e?.status === 401) return { success: false, error: "Unauthorized" };
		throw e;
	}
};
