<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import CommonHeader from "@/components/CommonHeader.vue";

const route = useRoute();
const isSignIn = computed(() => route.name === "signin");
</script>

<template>
  <div class="app-shell">
    <CommonHeader v-if="!isSignIn" />
    <main class="app-main" :class="{ 'no-header': isSignIn }">
      <router-view v-slot="{ Component }">
        <transition name="page" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.app-main {
  flex: 1;
  padding-top: var(--header-height);
}

.app-main.no-header {
  padding-top: 0;
}

/* Page transition */
.page-enter-active,
.page-leave-active {
  transition: opacity 150ms ease, transform 150ms ease;
}

.page-enter-from {
  opacity: 0;
  transform: translateY(6px);
}

.page-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
