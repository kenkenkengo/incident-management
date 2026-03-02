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
}

type RunbookInput = {
	readonly title: string;
	readonly content: string;
	readonly tags: readonly string[];
}

const runbookHeaders = (accessToken: string) => ({
	"Content-Type": "application/json",
	"Authorization": `Bearer ${accessToken}`,
});

export const listRunbooks = async (accessToken: string, tag?: string) => {
	const url = tag ? `/api/runbooks?tag=${encodeURIComponent(tag)}` : `/api/runbooks`;
	const rest = await fetch(url, {
		headers: runbookHeaders(accessToken),
	});
	return rest.json() as Promise<{ success: boolean; data?: Runbook[]; error?: string }>;
}

export const getRunbook = async (accessToken: string, id: string) => {
	const res = await fetch(`/api/runbooks/${id}`, {
		headers: runbookHeaders(accessToken),
	});
	return res.json() as Promise<{ success: boolean; data?: Runbook; error?: string }>;
}

export const createRunbook = async (accessToken: string, input: RunbookInput) => {
	const res = await fetch(`/api/runbooks`, {
		method: "POST",
		headers: runbookHeaders(accessToken),
		body: JSON.stringify(input),
	});
	return res.json() as Promise<{ success: boolean; data?: Runbook; error?: string }>;
}

export const updateRunbook = async (accessToken: string, id: string, input: RunbookInput) => {
	const res = await fetch(`/api/runbooks/${id}`, {
		method: "PUT",
		headers: runbookHeaders(accessToken),
		body: JSON.stringify(input),
	});
	return res.json() as Promise<{ success: boolean; data?: Runbook; error?: string }>;
}

export const deleteRunbook = async (accessToken: string, id: string) => {
	const res = await fetch(`/api/runbooks/${id}`, {
		method: "DELETE",
		headers: runbookHeaders(accessToken),
	});
}

