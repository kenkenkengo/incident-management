import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { signIn } from "@/lib/api-client";

export const useAuthStore = defineStore("auth", () => {
	const accessToken = ref<string | null>(null);
	const refreshToken = ref<string | null>(null);

	const isAuthenticated = computed(() => !!accessToken.value);

	async function signInAction(email: string, password: string) {
		try {
			const response = await signIn(email, password);
			if (response.success) {
				accessToken.value = response.data.accessToken;
				refreshToken.value = response.data.refreshToken;
				saveToStorage();
				return response;
			} else {
				throw new Error(response.error || "Sign-in failed");
			}
		} catch (error) {
			console.error("Error during sign-in:", error);
			throw error;
		}
	}

	function signOutAction() {
		accessToken.value = null;
		refreshToken.value = null;
		saveToStorage();
	}

	function loadFromStorage() {
		const storedAccessToken = localStorage.getItem("accessToken");
		const storedRefreshToken = localStorage.getItem("refreshToken");
		if (storedAccessToken && storedRefreshToken) {
			accessToken.value = storedAccessToken;
			refreshToken.value = storedRefreshToken;
		}
	}

	function saveToStorage() {
		if (accessToken.value && refreshToken.value) {
			localStorage.setItem("accessToken", accessToken.value);
			localStorage.setItem("refreshToken", refreshToken.value);
		} else {
			localStorage.removeItem("accessToken");
			localStorage.removeItem("refreshToken");
		}
	}

	return {
		accessToken,
		refreshToken,
		isAuthenticated,
		signInAction,
		signOutAction,
		loadFromStorage,
		saveToStorage,
	};
});
