import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { refreshTokens, signIn } from "@/lib/api-client";

export const useAuthStore = defineStore("auth", () => {
	const accessToken = ref<string | null>(null);
	const refreshToken = ref<string | null>(null);
	const userEmail = ref<string | null>(null);

	const isAuthenticated = computed(() => !!accessToken.value);

	async function signInAction(email: string, password: string) {
		const response = await signIn(email, password);
		if (!response.success) {
			throw new Error(response.error || "Sign-in failed");
		}
		accessToken.value = response.data.accessToken;
		refreshToken.value = response.data.refreshToken;
		userEmail.value = email;
		saveToStorage();
		return response;
	}

	function signOutAction() {
		accessToken.value = null;
		refreshToken.value = null;
		userEmail.value = null;
		saveToStorage();
	}

	function loadFromStorage() {
		const storedAccessToken = localStorage.getItem("accessToken");
		const storedRefreshToken = localStorage.getItem("refreshToken");
		const storedUserEmail = localStorage.getItem("userEmail");
		if (storedAccessToken && storedRefreshToken && storedUserEmail) {
			accessToken.value = storedAccessToken;
			refreshToken.value = storedRefreshToken;
			userEmail.value = storedUserEmail;
		}
	}

	function saveToStorage() {
		if (accessToken.value && refreshToken.value && userEmail.value) {
			localStorage.setItem("accessToken", accessToken.value);
			localStorage.setItem("refreshToken", refreshToken.value);
			localStorage.setItem("userEmail", userEmail.value);
		} else {
			localStorage.removeItem("accessToken");
			localStorage.removeItem("refreshToken");
			localStorage.removeItem("userEmail");
		}
	}

	async function refreshAccessToken(): Promise<string | null> {
		if (!refreshToken.value) return null;
		try {
			const response = await refreshTokens(refreshToken.value);

			if (!response.success || !response.data) {
				signOutAction();
				return null;
			}
			accessToken.value = response.data.accessToken;
			saveToStorage();
			return accessToken.value;
		} catch (e) {
			signOutAction();
			return null;
		}
	}

	return {
		accessToken,
		refreshToken,
		userEmail,
		isAuthenticated,
		signInAction,
		signOutAction,
		loadFromStorage,
		saveToStorage,
		refreshAccessToken,
	};
});
