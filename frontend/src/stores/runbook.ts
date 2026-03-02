import { defineStore } from "pinia";
import { ref } from "vue";
import {
  type Runbook,
  createRunbook,
  getRunbook,
  listRunbooks,
  updateRunbook,
  deleteRunbook
} from "../lib/api-client";
import { useAuthStore } from "./auth";

export const useRunbookStore = defineStore("runbook", () => {
  const runbooks = ref<Runbook[]>([]);
  const currentRunbook = ref<Runbook | null>(null);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  const getToken = (): string => {
    const authStore = useAuthStore();
    if (!authStore.accessToken) throw new Error("Not authenticated");
    return authStore.accessToken;
  }

  const fetchAll = async (tag?: string) => {
    isLoading.value = true;
    error.value = null;
    try {
      const res = await listRunbooks(getToken(), tag);
      if (!res.success) {
        throw new Error(res.error ?? "Failed to fetch runbooks");
      } else {
        runbooks.value = res.data || [];
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to fetch runbooks";
    } finally {
      isLoading.value = false;
    }
  }

  const fetchOne = async (id: string) => {
    isLoading.value = true;
    error.value = null;
    currentRunbook.value = null;
    try {
      const res = await getRunbook(getToken(), id);
      if (!res.success) {
        throw new Error(res.error ?? "Failed to fetch runbook");
      } else {
        currentRunbook.value = res.data || null;
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to fetch runbook";
    } finally {
      isLoading.value = false;
    }
  }

  const create = async (input: {
    title: string;
    content: string;
    tags: string[];
  }): Promise<Runbook | null> => {
    isLoading.value = true;
    error.value = null;
    try {
      const res = await createRunbook(getToken(), input);
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
  }

  const edit = async (id: string, input: {
    title: string;
    content: string;
    tags: string[];
  }): Promise<Runbook | null> => {
    isLoading.value = true;
    error.value = null;
    try {
      const res = await updateRunbook(getToken(), id, input);
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
  }

  const remove = async (id: string): Promise<boolean> => {
    isLoading.value = true;
    error.value = null;
    try {
      await deleteRunbook(getToken(), id);
      runbooks.value = runbooks.value.filter(r => r.id !== id);
      return true;
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to delete runbook";
      return false;
    } finally {
      isLoading.value = false;
    }
  }

  return {
    runbooks,
    currentRunbook,
    isLoading,
    error,
    fetchAll,
    fetchOne,
    create,
    edit,
    remove,
  };
})