import { defineStore } from "pinia";
import { computed, ref } from "vue";
import {
	type Incident,
	listIncidents,
	listIncidentsNeedingPostmortem,
} from "../lib/api-client";
import { useAuthStore } from "./auth";

export const useIncidentStore = defineStore("incident", () => {
	const activeIncidents = ref<Incident[]>([]);
	const needsPostmortemIncidents = ref<Incident[]>([]);
	const isLoading = ref(false);
	const error = ref<string | null>(null);

	const activeCount = computed(() => activeIncidents.value.length);
	const needsPostmortemCount = computed(
		() => needsPostmortemIncidents.value.length,
	);

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

	const fetchActive = async () => {
		isLoading.value = true;
		error.value = null;
		try {
			const res = await callWithAuth((token) =>
				listIncidents(token, { status: "active", limit: 10 }),
			);
			if (!res.success) {
				throw new Error(res.error ?? "Failed to fetch active incidents");
			}
			activeIncidents.value = res.data ?? [];
		} catch (e) {
			error.value =
				e instanceof Error ? e.message : "Failed to fetch active incidents";
		} finally {
			isLoading.value = false;
		}
	};

	const fetchNeedingPostmortem = async () => {
		try {
			const res = await callWithAuth((token) =>
				listIncidentsNeedingPostmortem(token),
			);
			if (!res.success) return;
			needsPostmortemIncidents.value = res.data ?? [];
		} catch {
			// ポストモーテムチェックの失敗はサイレントに処理
		}
	};

	return {
		activeIncidents,
		needsPostmortemIncidents,
		isLoading,
		error,
		activeCount,
		needsPostmortemCount,
		fetchActive,
		fetchNeedingPostmortem,
	};
});
