<script setup lang="ts">
import { ref } from "vue";
import { signIn } from "../lib/api-client";

const email = ref("");
const password = ref("");

const handleSignIn = async () => {
  const response = await signIn(email.value, password.value);
  console.log(response);
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