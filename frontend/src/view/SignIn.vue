<script setup lang="ts">
import { ref } from "vue";
import { useAuthStore } from "@/stores/auth";
import { useRouter } from "vue-router";
const router = useRouter();

const email = ref("");
const password = ref("");

const errorMessage = ref("");

const authStore = useAuthStore();

const handleSignIn = async () => {
  try {
    errorMessage.value = "";
    await authStore.signInAction(email.value, password.value);
    router.push({ name: "dashboard" });
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : "サインインに失敗しました";
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

  <p v-if="errorMessage" style="color: red">{{ errorMessage }}</p>
</template>

<style scoped></style>