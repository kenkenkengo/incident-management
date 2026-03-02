<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";

const router = useRouter();
const email = ref("");
const password = ref("");
const errorMessage = ref("");
const isLoading = ref(false);

const authStore = useAuthStore();

const handleSignIn = async () => {
	try {
		isLoading.value = true;
		errorMessage.value = "";
		await authStore.signInAction(email.value, password.value);
		router.push({ name: "dashboard" });
	} catch (error) {
		errorMessage.value =
			error instanceof Error ? error.message : "サインインに失敗しました";
	} finally {
		isLoading.value = false;
	}
};
</script>

<template>
  <div class="signin-page">
    <!-- Background grid decoration -->
    <div class="bg-grid" aria-hidden="true" />

    <!-- Corner decorations -->
    <div class="corner corner-tl" aria-hidden="true" />
    <div class="corner corner-tr" aria-hidden="true" />
    <div class="corner corner-bl" aria-hidden="true" />
    <div class="corner corner-br" aria-hidden="true" />

    <div class="signin-container">
      <!-- Brand -->
      <div class="signin-brand">
        <div class="brand-icon">
          <span class="brand-pulse" />
        </div>
        <h1 class="brand-title">GENEROSITY</h1>
        <p class="brand-subtitle">Incident Management System</p>
      </div>

      <!-- Form card -->
      <div class="signin-card">
        <div class="card-header">
          <span class="card-label">AUTH / SIGN IN</span>
          <div class="card-status">
            <span class="status-dot" />
            <span class="text-xs mono text-muted">SYSTEM ONLINE</span>
          </div>
        </div>

        <form @submit.prevent="handleSignIn" class="signin-form">
          <div class="form-group">
            <label for="email">Email Address</label>
            <input
              id="email"
              v-model="email"
              type="email"
              placeholder="ops@example.com"
              required
              autocomplete="email"
            />
          </div>

          <div class="form-group">
            <label for="password">Password</label>
            <input
              id="password"
              v-model="password"
              type="password"
              placeholder="••••••••••••"
              required
              autocomplete="current-password"
            />
          </div>

          <div v-if="errorMessage" class="error-message" role="alert">
            <span class="error-icon">!</span>
            {{ errorMessage }}
          </div>

          <button
            type="submit"
            class="signin-btn"
            :class="{ loading: isLoading }"
            :disabled="isLoading"
          >
            <span v-if="isLoading" class="loading-dots">
              <span />
              <span />
              <span />
            </span>
            <span v-else>AUTHENTICATE →</span>
          </button>
        </form>

        <!-- Bottom decoration -->
        <div class="card-footer">
          <span class="text-xs mono text-muted">v1.0.0</span>
          <span class="text-xs mono text-muted">AWS Cognito</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.signin-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  background: var(--bg-base);
}

/* Background grid */
.bg-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(var(--border-subtle) 1px, transparent 1px),
    linear-gradient(90deg, var(--border-subtle) 1px, transparent 1px);
  background-size: 48px 48px;
  mask-image: radial-gradient(ellipse 70% 70% at 50% 50%, black 30%, transparent 100%);
  -webkit-mask-image: radial-gradient(ellipse 70% 70% at 50% 50%, black 30%, transparent 100%);
  opacity: 0.4;
}

/* Corner marks */
.corner {
  position: absolute;
  width: 40px;
  height: 40px;
}

.corner-tl {
  top: var(--space-xl);
  left: var(--space-xl);
  border-top: 1px solid var(--border-default);
  border-left: 1px solid var(--border-default);
}

.corner-tr {
  top: var(--space-xl);
  right: var(--space-xl);
  border-top: 1px solid var(--border-default);
  border-right: 1px solid var(--border-default);
}

.corner-bl {
  bottom: var(--space-xl);
  left: var(--space-xl);
  border-bottom: 1px solid var(--border-default);
  border-left: 1px solid var(--border-default);
}

.corner-br {
  bottom: var(--space-xl);
  right: var(--space-xl);
  border-bottom: 1px solid var(--border-default);
  border-right: 1px solid var(--border-default);
}

/* Container */
.signin-container {
  width: 100%;
  max-width: 400px;
  padding: var(--space-md);
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
  animation: fade-in 0.4s ease forwards;
}

/* Brand */
.signin-brand {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-sm);
}

.brand-icon {
  width: 48px;
  height: 48px;
  border: 1.5px solid var(--accent);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  margin-bottom: var(--space-xs);
}

.brand-pulse {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 20px var(--accent), 0 0 40px var(--accent-glow);
  animation: heartbeat 1.8s ease-in-out infinite;
}

@keyframes heartbeat {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(0.7); opacity: 0.6; }
}

.brand-title {
  font-family: var(--font-mono);
  font-size: 1.5rem;
  font-weight: 600;
  letter-spacing: 0.2em;
  color: var(--text-primary);
}

.brand-subtitle {
  font-family: var(--font-mono);
  font-size: 0.8rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-secondary);
}

/* Card */
.signin-card {
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: 6px;
  overflow: hidden;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-sm) var(--space-lg);
  background: var(--bg-elevated);
  border-bottom: 1px solid var(--border-default);
}

.card-label {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--accent);
}

.card-status {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
}

/* Form */
.signin-form {
  padding: var(--space-lg);
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

/* Error */
.error-message {
  display: flex;
  align-items: flex-start;
  gap: var(--space-sm);
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  color: var(--status-danger);
  background: var(--status-danger-dim);
  border: 1px solid rgba(255, 77, 107, 0.3);
  border-radius: 3px;
  padding: var(--space-sm) var(--space-md);
}

.error-icon {
  font-weight: 700;
  flex-shrink: 0;
}

/* Submit button */
.signin-btn {
  width: 100%;
  padding: 12px;
  background: var(--accent);
  color: var(--text-inverse);
  border: none;
  border-radius: 3px;
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  cursor: pointer;
  transition: all var(--transition-fast);
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  margin-top: var(--space-xs);
}

.signin-btn:hover:not(:disabled) {
  background: #fbb740;
  box-shadow: 0 0 24px var(--accent-glow-strong);
}

.signin-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

/* Loading dots */
.loading-dots {
  display: flex;
  gap: 5px;
  align-items: center;
}

.loading-dots span {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--text-inverse);
  animation: dot-bounce 1.2s infinite;
}

.loading-dots span:nth-child(2) { animation-delay: 0.2s; }
.loading-dots span:nth-child(3) { animation-delay: 0.4s; }

@keyframes dot-bounce {
  0%, 80%, 100% { transform: scale(0.7); opacity: 0.5; }
  40% { transform: scale(1); opacity: 1; }
}

/* Footer */
.card-footer {
  display: flex;
  justify-content: space-between;
  padding: var(--space-sm) var(--space-lg);
  background: var(--bg-elevated);
  border-top: 1px solid var(--border-default);
}
</style>
