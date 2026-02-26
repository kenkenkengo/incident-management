<script setup lang="ts">
import { useAuthStore } from "@/stores/auth";

const authStore = useAuthStore();
authStore.loadFromStorage();
const userEmail = authStore.userEmail;
</script>

<template>
  <h1>Dashboard</h1>
  <p>Welcome, {{ userEmail }}</p>
</template>