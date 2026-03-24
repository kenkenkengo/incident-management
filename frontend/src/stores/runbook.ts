import { defineStore } from "pinia";
import { ref } from "vue";
import {
	createRunbook,
	deleteRunbook,
	getRunbook,
	listRunbooks,
	type Runbook,
	updateRunbook,
} from "../lib/api-client";
import { useAuthStore } from "./auth";

export const useRunbookStore = defineStore("runbook", () => {
	const runbooks = ref<Runbook[]>([]);
	const currentRunbook = ref<Runbook | null>(null);
	const isLoading = ref(false);
	const isLoadingMore = ref(false);
	const error = ref<string | null>(null);
	const nextCursor = ref<string | null>(null);

	const callWithAuth = async <R extends { success: boolean; error?: string }>(
		fn: (token: string) => Promise<R>,
	): Promise<R> => {
		const authStore = useAuthStore();
		if (!authStore.accessToken) throw new Error("Not authenticated");

		let res = await fn(authStore.accessToken);

		if (!res.success && res.error === "Unauthorized") {
			const newToken = await authStore.refreshAccessToken();
			if (!newToken) {
				authStore.signOutAction();
				throw new Error(
					"セッションが期限切れです。再度サインインしてください。",
				);
			}
			res = await fn(newToken);
		}

		return res;
	};

	const fetchAll = async (tags?: string[]) => {
		isLoading.value = true;
		error.value = null;
		nextCursor.value = null;
		try {
			const res = await callWithAuth((token) =>
				listRunbooks(token, { tags }),
			);
			if (!res.success) {
				throw new Error(res.error ?? "Failed to fetch runbooks");
			}
			runbooks.value = res.data || [];
			nextCursor.value = res.meta?.nextCursor ?? null;
		} catch (e) {
			error.value = e instanceof Error ? e.message : "Failed to fetch runbooks";
		} finally {
			isLoading.value = false;
		}
	};

	const fetchMore = async (tags?: string[]) => {
		if (!nextCursor.value) return;
		isLoadingMore.value = true;
		try {
			const cursor = nextCursor.value ?? undefined;
			const res = await callWithAuth((token) =>
				listRunbooks(token, { tags, cursor }),
			);
			if (!res.success) {
				throw new Error(res.error ?? "Failed to fetch runbooks");
			}
			runbooks.value = [...runbooks.value, ...(res.data || [])];
			nextCursor.value = res.meta?.nextCursor ?? null;
		} catch (e) {
			error.value = e instanceof Error ? e.message : "Failed to fetch runbooks";
		} finally {
			isLoadingMore.value = false;
		}
	};

	const fetchOne = async (id: string) => {
		isLoading.value = true;
		error.value = null;
		currentRunbook.value = null;
		try {
			const res = await callWithAuth((token) => getRunbook(token, id));
			if (!res.success) {
				throw new Error(res.error ?? "Failed to fetch runbook");
			}
			currentRunbook.value = res.data || null;
		} catch (e) {
			error.value = e instanceof Error ? e.message : "Failed to fetch runbook";
		} finally {
			isLoading.value = false;
		}
	};

	const create = async (input: {
		title: string;
		content: string;
		tags: string[];
	}): Promise<Runbook | null> => {
		isLoading.value = true;
		error.value = null;
		try {
			const res = await callWithAuth((token) => createRunbook(token, input));
			if (!res.success) {
				throw new Error(res.error ?? "Failed to create runbook");
			}
			return res.data || null;
		} catch (e) {
			error.value = e instanceof Error ? e.message : "Failed to create runbook";
			return null;
		} finally {
			isLoading.value = false;
		}
	};

	const edit = async (
		id: string,
		input: {
			title: string;
			content: string;
			tags: string[];
		},
	): Promise<Runbook | null> => {
		isLoading.value = true;
		error.value = null;
		try {
			const res = await callWithAuth((token) =>
				updateRunbook(token, id, input),
			);
			if (!res.success) {
				throw new Error(res.error ?? "Failed to update runbook");
			}
			return res.data || null;
		} catch (e) {
			error.value = e instanceof Error ? e.message : "Failed to update runbook";
			return null;
		} finally {
			isLoading.value = false;
		}
	};

	const remove = async (id: string): Promise<boolean> => {
		isLoading.value = true;
		error.value = null;
		try {
			await callWithAuth(async (token) => {
				await deleteRunbook(token, id);
				return { success: true };
			});
			runbooks.value = runbooks.value.filter((r) => r.id !== id);
			return true;
		} catch (e) {
			error.value = e instanceof Error ? e.message : "Failed to delete runbook";
			return false;
		} finally {
			isLoading.value = false;
		}
	};

	return {
		runbooks,
		currentRunbook,
		isLoading,
		isLoadingMore,
		error,
		nextCursor,
		fetchAll,
		fetchMore,
		fetchOne,
		create,
		edit,
		remove,
	};
});
