<script setup lang="ts">
import { ref } from "vue";
import { useAuthStore } from "@/stores/auth";

const email = ref("");
const password = ref("");

const authStore = useAuthStore();

const handleSignIn = async () => {
	const response = await authStore.signInAction(email.value, password.value);
	console.log(response);

	if (response.success) {
		// Sign-in successful, you can redirect the user or show a success message
		console.log("Sign-in successful");

		// todo:routerで別のページに遷移
	} else {
		// Sign-in failed, you can show an error message
		console.error("Sign-in failed:", response.error);
	}
};
</script>

<template>
  <h1>Sign In</h1>
  <form @submit.prevent="handleSignIn">
    <input type="email" placeholder="Email" v-model="email" />
    <input type="password" placeholder="Password" v-model="password" />
    <button type="submit">Sign In</button>
  </form>
</template>

<style scoped></style>