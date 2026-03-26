import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as apiClient from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth";
import { useIncidentStore } from "@/stores/incident";

const mockIncident: apiClient.Incident = {
	id: "inc-1",
	channelId: "C123",
	title: "テストインシデント",
	severity: "SEV1",
	status: "active",
	startedAt: "2026-01-01T00:00:00.000Z",
	startedBy: "user-1",
};

const mockClosedIncident: apiClient.Incident = {
	id: "inc-2",
	channelId: "C456",
	title: "クローズ済みインシデント",
	severity: "SEV2",
	status: "closed",
	startedAt: "2026-01-01T00:00:00.000Z",
	endedAt: "2026-01-02T00:00:00.000Z",
	startedBy: "user-2",
	resolution: "修正済み",
};

describe("useIncidentStore", () => {
	beforeEach(() => {
		setActivePinia(createPinia());
		const authStore = useAuthStore();
		authStore.accessToken = "mock-token";
	});

	describe("fetchActive", () => {
		it("アクティブインシデントを取得してstoreに保存する", async () => {
			vi.spyOn(apiClient, "listIncidents").mockResolvedValueOnce({
				success: true,
				data: [mockIncident],
			});

			const store = useIncidentStore();
			await store.fetchActive();

			expect(store.activeIncidents).toHaveLength(1);
			expect(store.activeIncidents[0]?.title).toBe("テストインシデント");
			expect(store.activeCount).toBe(1);
			expect(store.error).toBeNull();
			expect(store.isLoading).toBe(false);
		});

		it("APIエラー時にerrorをセットする", async () => {
			vi.spyOn(apiClient, "listIncidents").mockResolvedValueOnce({
				success: false,
				error: "Server error",
			});

			const store = useIncidentStore();
			await store.fetchActive();

			expect(store.activeIncidents).toHaveLength(0);
			expect(store.error).toBe("Server error");
			expect(store.isLoading).toBe(false);
		});

		it("Unauthorized時にリフレッシュして再取得する", async () => {
			vi.spyOn(apiClient, "listIncidents")
				.mockResolvedValueOnce({
					success: false,
					error: "Unauthorized",
				})
				.mockResolvedValueOnce({
					success: true,
					data: [mockIncident],
				});

			const authStore = useAuthStore();
			vi.spyOn(authStore, "refreshAccessToken").mockResolvedValueOnce(
				"new-token",
			);

			const store = useIncidentStore();
			await store.fetchActive();

			expect(authStore.refreshAccessToken).toHaveBeenCalled();
			expect(store.activeIncidents).toHaveLength(1);
			expect(store.error).toBeNull();
		});

		it("リフレッシュ失敗時にサインアウトする", async () => {
			vi.spyOn(apiClient, "listIncidents").mockResolvedValueOnce({
				success: false,
				error: "Unauthorized",
			});

			const authStore = useAuthStore();
			vi.spyOn(authStore, "refreshAccessToken").mockResolvedValueOnce(null);
			vi.spyOn(authStore, "signOutAction");

			const store = useIncidentStore();
			await store.fetchActive();

			expect(authStore.signOutAction).toHaveBeenCalled();
			expect(store.error).toBe(
				"セッションが期限切れです。再度サインインしてください。",
			);
		});
	});

	describe("fetchNeedingPostmortem", () => {
		it("ポストモーテム未作成インシデントを取得する", async () => {
			vi.spyOn(
				apiClient,
				"listIncidentsNeedingPostmortem",
			).mockResolvedValueOnce({
				success: true,
				data: [mockClosedIncident],
			});

			const store = useIncidentStore();
			await store.fetchNeedingPostmortem();

			expect(store.needsPostmortemIncidents).toHaveLength(1);
			expect(store.needsPostmortemCount).toBe(1);
			expect(store.needsPostmortemIncidents[0]?.id).toBe("inc-2");
		});

		it("APIエラー時にサイレントに処理する", async () => {
			vi.spyOn(
				apiClient,
				"listIncidentsNeedingPostmortem",
			).mockResolvedValueOnce({
				success: false,
				error: "Server error",
			});

			const store = useIncidentStore();
			await store.fetchNeedingPostmortem();

			expect(store.needsPostmortemIncidents).toHaveLength(0);
		});

		it("Unauthorized時にリフレッシュして再取得する", async () => {
			vi.spyOn(apiClient, "listIncidentsNeedingPostmortem")
				.mockResolvedValueOnce({
					success: false,
					error: "Unauthorized",
				})
				.mockResolvedValueOnce({
					success: true,
					data: [mockClosedIncident],
				});

			const authStore = useAuthStore();
			vi.spyOn(authStore, "refreshAccessToken").mockResolvedValueOnce(
				"new-token",
			);

			const store = useIncidentStore();
			await store.fetchNeedingPostmortem();

			expect(authStore.refreshAccessToken).toHaveBeenCalled();
			expect(store.needsPostmortemIncidents).toHaveLength(1);
		});

		it("リフレッシュ失敗時にサインアウトしてサイレントに処理する", async () => {
			vi.spyOn(
				apiClient,
				"listIncidentsNeedingPostmortem",
			).mockResolvedValueOnce({
				success: false,
				error: "Unauthorized",
			});

			const authStore = useAuthStore();
			vi.spyOn(authStore, "refreshAccessToken").mockResolvedValueOnce(null);
			vi.spyOn(authStore, "signOutAction");

			const store = useIncidentStore();
			await store.fetchNeedingPostmortem();

			expect(authStore.signOutAction).toHaveBeenCalled();
			expect(store.needsPostmortemIncidents).toHaveLength(0);
		});
	});
});
