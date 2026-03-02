<script setup lang="ts">
import { useRouter, useRoute } from "vue-router";
import { useAuthStore } from "@/stores/auth";

const authStore = useAuthStore();
const router = useRouter();
const route = useRoute();

const handleSignOut = () => {
	authStore.signOutAction();
	router.push({ name: "signin" });
};
</script>

<template>
  <header class="header">
    <div class="header-inner">
      <!-- Logo / Brand -->
      <div class="header-brand">
        <div class="brand-mark">
          <span class="brand-mark-dot" />
        </div>
        <span class="brand-name">GENEROSITY</span>
        <span class="brand-sub">IMS</span>
      </div>

      <!-- Navigation -->
      <nav class="header-nav">
        <router-link
          to="/dashboard"
          class="nav-item"
          :class="{ active: route.name === 'dashboard' }"
        >
          <span class="nav-icon">◈</span>
          Dashboard
        </router-link>
        <router-link
          to="/runbooks"
          class="nav-item"
          :class="{ active: route.name?.toString().startsWith('runbook') }"
        >
          <span class="nav-icon">≡</span>
          Runbooks
        </router-link>
      </nav>

      <!-- Right side -->
      <div class="header-actions">
        <span class="user-email mono text-xs text-muted">
          {{ authStore.userEmail }}
        </span>
        <button class="signout-btn" @click="handleSignOut">
          Sign Out
        </button>
      </div>
    </div>
  </header>
</template>

<style scoped>
.header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: var(--header-height);
  background: rgba(9, 12, 19, 0.94);
  border-bottom: 1px solid var(--border-subtle);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  z-index: 100;
}

.header-inner {
  display: flex;
  align-items: center;
  gap: var(--space-xl);
  height: 100%;
  max-width: var(--content-max);
  margin: 0 auto;
  padding: 0 var(--space-lg);
}

/* Brand */
.header-brand {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  flex-shrink: 0;
}

.brand-mark {
  width: 24px;
  height: 24px;
  border: 1.5px solid var(--accent);
  border-radius: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.brand-mark-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 8px var(--accent);
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; box-shadow: 0 0 8px var(--accent); }
  50% { opacity: 0.5; box-shadow: 0 0 4px var(--accent); }
}

.brand-name {
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  font-weight: 600;
  letter-spacing: 0.14em;
  color: var(--text-primary);
}

.brand-sub {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  font-weight: 500;
  letter-spacing: 0.08em;
  color: var(--accent);
  background: var(--accent-glow);
  border: 1px solid var(--accent-dim);
  padding: 2px 6px;
  border-radius: 2px;
}

/* Nav */
.header-nav {
  display: flex;
  align-items: center;
  gap: 2px;
  flex: 1;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  font-weight: 500;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-secondary);
  text-decoration: none;
  padding: 6px var(--space-md);
  border-radius: 3px;
  transition: color var(--transition-fast), background var(--transition-fast);
}

.nav-item:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.nav-item.active {
  color: var(--accent);
  background: var(--accent-glow);
}

.nav-icon {
  font-size: 0.875rem;
  line-height: 1;
}

/* Actions */
.header-actions {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  flex-shrink: 0;
}

.user-email {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.signout-btn {
  font-family: var(--font-mono);
  font-size: 0.8rem;
  font-weight: 500;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-secondary);
  background: transparent;
  border: 1px solid var(--border-default);
  padding: 5px var(--space-sm);
  border-radius: 3px;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.signout-btn:hover {
  color: var(--status-danger);
  border-color: var(--status-danger);
  background: var(--status-danger-dim);
}
</style>
