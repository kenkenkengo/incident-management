import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as apiClient from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth";
import { useRunbookStore } from "@/stores/runbook";

const mockRunbook: apiClient.Runbook = {
	id: "test-id",
	title: "テスト手順書",
	content: "# 手順\n\n1. 確認する",
	tags: ["DB", "Network"],
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:00:00.000Z",
	createdBy: "user-sub-1",
	updatedBy: "user-sub-1",
};

describe("useRunbookStore", () => {
	beforeEach(() => {
		setActivePinia(createPinia());
		const authStore = useAuthStore();
		authStore.accessToken = "mock-token";
	});

	describe("fetchAll", () => {
		it("一覧を取得してstoreに保存する", async () => {
			vi.spyOn(apiClient, "listRunbooks").mockResolvedValueOnce({
				success: true,
				data: [mockRunbook],
			});

			const store = useRunbookStore();
			await store.fetchAll();

			expect(store.runbooks).toHaveLength(1);
			expect(store.runbooks[0]?.title).toBe("テスト手順書");
			expect(store.error).toBeNull();
		});

		it("APIエラー時にerrorをセットする", async () => {
			vi.spyOn(apiClient, "listRunbooks").mockResolvedValueOnce({
				success: false,
				error: "Server error",
			});

			const store = useRunbookStore();
			await store.fetchAll();

			expect(store.runbooks).toHaveLength(0);
			expect(store.error).toBe("Server error");
		});
	});

	describe("fetchOne", () => {
		it("1件取得してcurrentRunbookに保存する", async () => {
			vi.spyOn(apiClient, "getRunbook").mockResolvedValueOnce({
				success: true,
				data: mockRunbook,
			});

			const store = useRunbookStore();
			await store.fetchOne("test-id");

			expect(store.currentRunbook?.id).toBe("test-id");
		});

		it("見つからない場合currentRunbookがnullのままになる", async () => {
			vi.spyOn(apiClient, "getRunbook").mockResolvedValueOnce({
				success: false,
				error: "Runbook not found",
			});

			const store = useRunbookStore();
			await store.fetchOne("missing-id");

			expect(store.currentRunbook).toBeNull();
			expect(store.error).toBe("Runbook not found");
		});
	});

	describe("create", () => {
		it("作成に成功したらRunbookを返す", async () => {
			vi.spyOn(apiClient, "createRunbook").mockResolvedValueOnce({
				success: true,
				data: mockRunbook,
			});

			const store = useRunbookStore();
			const result = await store.create({
				title: "テスト手順書",
				content: "# 手順",
				tags: ["DB"],
			});

			expect(result?.id).toBe("test-id");
		});

		it("作成失敗時にnullを返す", async () => {
			vi.spyOn(apiClient, "createRunbook").mockResolvedValueOnce({
				success: false,
				error: "Invalid input",
			});

			const store = useRunbookStore();
			const result = await store.create({
				title: "",
				content: "",
				tags: [],
			});

			expect(result).toBeNull();
			expect(store.error).toBe("Invalid input");
		});
	});

	describe("remove", () => {
		it("削除に成功したらstoreからも除去する", async () => {
			vi.spyOn(apiClient, "deleteRunbook").mockResolvedValueOnce({
				success: true,
			});
			const store = useRunbookStore();
			store.runbooks = [mockRunbook];

			const result = await store.remove("test-id");

			expect(result).toBe(true);
			expect(store.runbooks).toHaveLength(0);
		});
	});
});
