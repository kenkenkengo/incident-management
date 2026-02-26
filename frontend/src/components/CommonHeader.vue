<script setup lang="ts">
import { useAuthStore } from "@/stores/auth";
import { useRouter } from "vue-router";

const authStore = useAuthStore();
const router = useRouter();

const handleSignOut = () => {
  authStore.signOutAction();
  router.push({ name: "signin" });
};
</script>

<template>
  <header>
    <nav>
      <ul>
        <li><router-link to="/dashboard">Dashboard</router-link></li>
      </ul>
      <button @click="handleSignOut">Sign Out</button>
    </nav>
  </header>
</template>