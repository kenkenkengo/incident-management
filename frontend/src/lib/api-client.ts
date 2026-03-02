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
