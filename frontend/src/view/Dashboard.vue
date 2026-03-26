<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { useIncidentStore } from "@/stores/incident";
import { useRunbookStore } from "@/stores/runbook";

const authStore = useAuthStore();
const runbookStore = useRunbookStore();
const incidentStore = useIncidentStore();
const router = useRouter();

authStore.loadFromStorage();
const userEmail = authStore.userEmail;

const currentTime = ref(
	new Date().toLocaleTimeString("ja-JP", { hour12: false }),
);

const severityLabel = (severity: string) => {
	const labels: Record<string, string> = {
		SEV1: "SEV1",
		SEV2: "SEV2",
		SEV3: "SEV3",
	};
	return labels[severity] ?? severity;
};

const elapsedTime = (startedAt: string) => {
	const diffMs = Date.now() - new Date(startedAt).getTime();
	const totalMinutes = Math.floor(diffMs / 60000);
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;
	if (hours === 0) return `${minutes}m`;
	if (hours < 24) return `${hours}h ${minutes}m`;
	const days = Math.floor(hours / 24);
	return `${days}d ${hours % 24}h`;
};

let timerId: ReturnType<typeof setInterval> | undefined;

onMounted(async () => {
	timerId = setInterval(() => {
		currentTime.value = new Date().toLocaleTimeString("ja-JP", {
			hour12: false,
		});
	}, 1000);
	await Promise.all([
		runbookStore.fetchAll(),
		incidentStore.fetchActive(),
		incidentStore.fetchNeedingPostmortem(),
	]);
});

onUnmounted(() => {
	if (timerId !== undefined) {
		clearInterval(timerId);
	}
});

const goToRunbooks = () => router.push({ name: "runbook-list" });
const goToNewRunbook = () => router.push({ name: "runbook-new" });
</script>

<template>
  <div class="page-container">
    <!-- Page header -->
    <div class="page-header">
      <div>
        <div class="page-eyebrow">MISSION CONTROL</div>
        <h1 class="page-title">Dashboard</h1>
      </div>
      <div class="header-meta">
        <span class="mono text-xs text-muted">{{ currentTime }}</span>
        <button class="btn-primary" @click="goToNewRunbook">
          + New Runbook
        </button>
      </div>
    </div>

    <!-- Postmortem warning banner -->
    <div v-if="incidentStore.needsPostmortemCount > 0" class="warning-banner">
      <div class="warning-banner-header">
        <span class="warning-icon">!</span>
        <span class="warning-title">{{ incidentStore.needsPostmortemCount }}件のクローズ済みインシデントにポストモーテムが未作成です</span>
      </div>
      <div class="warning-banner-list">
        <div
          v-for="incident in incidentStore.needsPostmortemIncidents.slice(0, 5)"
          :key="incident.id"
          class="warning-banner-item"
          @click="router.push({ name: 'incident-detail', params: { id: incident.id } })"
        >
          <span :class="['severity-badge', incident.severity.toLowerCase()]">{{ severityLabel(incident.severity) }}</span>
          <span class="warning-item-title">{{ incident.title }}</span>
          <span class="arrow">→</span>
        </div>
      </div>
    </div>

    <!-- Status bar -->
    <div class="status-bar">
      <div class="status-item">
        <span :class="['status-dot', incidentStore.activeCount > 0 ? 'danger' : '']" />
        <span class="mono text-xs">{{ incidentStore.activeCount > 0 ? `${incidentStore.activeCount} ACTIVE INCIDENT${incidentStore.activeCount > 1 ? 'S' : ''}` : 'SYSTEM OPERATIONAL' }}</span>
      </div>
      <div class="status-divider" />
      <div class="status-item text-secondary">
        <span class="mono text-xs">OPERATOR: {{ userEmail }}</span>
      </div>
    </div>

    <!-- Stats grid -->
    <div class="stats-grid">
      <div :class="['stat-card', incidentStore.activeCount > 0 ? 'danger' : '']">
        <div class="stat-label">Active Incidents</div>
        <div class="stat-value">
          <span v-if="incidentStore.isLoading" class="skeleton" style="width: 40px; height: 40px; display: block; border-radius: 4px;" />
          <span v-else>{{ incidentStore.activeCount }}</span>
        </div>
        <div class="stat-footer">
          <span v-if="incidentStore.activeCount === 0" class="text-xs mono" style="color: var(--status-ok);">ALL CLEAR</span>
          <span v-else class="text-xs mono" style="color: var(--status-danger);">REQUIRES ATTENTION</span>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-label">Total Runbooks</div>
        <div class="stat-value">
          <span v-if="runbookStore.isLoading" class="skeleton" style="width: 40px; height: 40px; display: block; border-radius: 4px;" />
          <span v-else>{{ runbookStore.runbooks.length }}</span>
        </div>
        <div class="stat-footer">
          <span class="text-xs text-muted mono">PROCEDURES REGISTERED</span>
        </div>
      </div>

      <div class="stat-card accent">
        <div class="stat-label">Ready to Use</div>
        <div class="stat-value">
          <span v-if="runbookStore.isLoading" class="skeleton" style="width: 40px; height: 40px; display: block; border-radius: 4px;" />
          <span v-else>{{ runbookStore.runbooks.length }}</span>
        </div>
        <div class="stat-footer">
          <span class="text-xs mono">↑ ALL RUNBOOKS ACTIVE</span>
        </div>
      </div>
    </div>

    <!-- Active incidents -->
    <div v-if="incidentStore.activeCount > 0" class="section incident-section">
      <div class="section-header">
        <h2 class="section-title">Active Incidents</h2>
        <button class="btn-ghost text-xs" @click="router.push({ name: 'incident-list' })">View all →</button>
      </div>

      <div class="incident-list">
        <div
          v-for="(incident, i) in incidentStore.activeIncidents.slice(0, 5)"
          :key="incident.id"
          class="incident-row"
          :style="{ animationDelay: `${i * 60}ms` }"
          @click="router.push({ name: 'incident-detail', params: { id: incident.id } })"
        >
          <div class="incident-row-left">
            <span :class="['severity-badge', incident.severity.toLowerCase()]">{{ severityLabel(incident.severity) }}</span>
            <div>
              <div class="incident-title">{{ incident.title }}</div>
              <div class="incident-meta mono text-xs text-muted">
                Started {{ elapsedTime(incident.startedAt) }} ago · {{ incident.startedBy }}
              </div>
            </div>
          </div>
          <div class="incident-row-right">
            <span class="status-badge active">
              <span class="status-dot-sm active" />
              ACTIVE
            </span>
            <span class="arrow">→</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Recent runbooks -->
    <div class="section">
      <div class="section-header">
        <h2 class="section-title">Recent Runbooks</h2>
        <button class="btn-ghost text-xs" @click="goToRunbooks">View all →</button>
      </div>

      <div v-if="runbookStore.isLoading" class="runbook-list">
        <div v-for="i in 3" :key="i" class="runbook-skeleton">
          <div class="skeleton" style="height: 16px; width: 60%; border-radius: 3px;" />
          <div class="skeleton" style="height: 12px; width: 30%; border-radius: 3px;" />
        </div>
      </div>

      <div v-else-if="runbookStore.runbooks.length === 0" class="empty-state">
        <div class="empty-icon">≡</div>
        <p class="empty-title">No runbooks yet</p>
        <p class="text-sm text-muted">Create your first runbook to get started.</p>
        <button class="btn-primary" style="margin-top: 16px;" @click="goToNewRunbook">
          + Create Runbook
        </button>
      </div>

      <div v-else class="runbook-list">
        <div
          v-for="(runbook, i) in runbookStore.runbooks.slice(0, 5)"
          :key="runbook.id"
          class="runbook-row"
          :style="{ animationDelay: `${i * 60}ms` }"
          @click="router.push({ name: 'runbook-detail', params: { id: runbook.id } })"
        >
          <div class="runbook-row-left">
            <span class="runbook-index mono text-xs text-muted">{{ String(i + 1).padStart(2, '0') }}</span>
            <div>
              <div class="runbook-title">{{ runbook.title }}</div>
              <div class="runbook-tags" v-if="runbook.tags.length > 0">
                <span v-for="tag in runbook.tags" :key="tag" class="tag">{{ tag }}</span>
              </div>
            </div>
          </div>
          <div class="runbook-row-right">
            <span class="mono text-xs text-muted">
              {{ new Date(runbook.updatedAt).toLocaleDateString("ja-JP") }}
            </span>
            <span class="arrow">→</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page-eyebrow {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  color: var(--accent);
  margin-bottom: 4px;
}

.header-meta {
  display: flex;
  align-items: center;
  gap: var(--space-lg);
}

.btn-primary {
  background: var(--accent);
  color: var(--text-inverse);
  border: none;
  padding: 8px 16px;
  font-family: var(--font-mono);
  font-size: 0.875rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  border-radius: 3px;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.btn-primary:hover {
  background: var(--accent-hover);
  box-shadow: 0 2px 8px var(--accent-glow-strong);
}

.btn-ghost {
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid var(--border-default);
  padding: 6px 12px;
  font-family: var(--font-mono);
  font-size: 0.875rem;
  border-radius: 3px;
  cursor: pointer;
  transition: all var(--transition-fast);
  letter-spacing: 0.04em;
}

.btn-ghost:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

/* Warning banner */
.warning-banner {
  background: rgba(199, 138, 30, 0.06);
  border: 1px solid rgba(199, 138, 30, 0.25);
  border-left: 3px solid #c78a1e;
  border-radius: 4px;
  padding: var(--space-md) var(--space-lg);
  margin-bottom: var(--space-lg);
}

.warning-banner-header {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  margin-bottom: var(--space-sm);
}

.warning-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #c78a1e;
  color: #fff;
  font-family: var(--font-mono);
  font-size: 0.7rem;
  font-weight: 700;
  flex-shrink: 0;
}

.warning-title {
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  font-weight: 600;
  color: #c78a1e;
}

.warning-banner-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: var(--space-sm);
}

.warning-banner-item {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: 6px var(--space-sm);
  border-radius: 3px;
  cursor: pointer;
  transition: background var(--transition-fast);
}

.warning-banner-item:hover {
  background: rgba(199, 138, 30, 0.08);
}

.warning-banner-item:hover .arrow {
  color: #c78a1e;
  transform: translateX(4px);
}

.warning-item-title {
  font-size: 0.875rem;
  color: var(--text-primary);
  flex: 1;
}

/* Status bar */
.status-bar {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: 10px var(--space-md);
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: 4px;
  margin-bottom: var(--space-xl);
  font-family: var(--font-mono);
}

.status-item {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.status-divider {
  width: 1px;
  height: 16px;
  background: var(--border-default);
}

/* Stats grid */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-md);
  margin-bottom: var(--space-xl);
}

.stat-card {
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  padding: var(--space-lg);
  box-shadow: var(--shadow-sm);
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
}

.stat-card:hover {
  border-color: var(--border-default);
  box-shadow: var(--shadow-md);
}

.stat-card.accent {
  border-color: var(--accent-dim);
  background: rgba(245, 166, 35, 0.04);
}

.stat-card.danger {
  border-color: rgba(192, 55, 55, 0.4);
  background: var(--status-danger-dim);
}

.stat-card.danger .stat-value {
  color: var(--status-danger);
}

.stat-label {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-secondary);
  margin-bottom: var(--space-sm);
}

.stat-value {
  font-family: var(--font-mono);
  font-size: 2.5rem;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1;
  margin-bottom: var(--space-md);
}

.stat-card.accent .stat-value {
  color: var(--accent);
}

.stat-footer {
  padding-top: var(--space-sm);
  border-top: 1px solid var(--border-default);
  color: var(--text-secondary);
}

.stat-card.accent .stat-footer {
  color: var(--accent-dim);
  border-color: rgba(245, 166, 35, 0.2);
}

.stat-card.danger .stat-footer {
  border-color: rgba(192, 55, 55, 0.2);
}

/* Section */
.section {
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  overflow: hidden;
  box-shadow: var(--shadow-sm);
}

.section + .section {
  margin-top: var(--space-lg);
}

.incident-section {
  border-color: rgba(192, 55, 55, 0.25);
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-md) var(--space-lg);
  border-bottom: 1px solid var(--border-subtle);
  background: var(--bg-elevated);
}

.section-title {
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-secondary);
}

/* Incident list */
.incident-list {
  display: flex;
  flex-direction: column;
}

.incident-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-md) var(--space-lg);
  border-bottom: 1px solid var(--border-subtle);
  cursor: pointer;
  transition: background var(--transition-fast);
  animation: fade-in 0.25s ease both;
}

.incident-row:last-child {
  border-bottom: none;
}

.incident-row:hover {
  background: var(--bg-hover);
}

.incident-row:hover .arrow {
  color: var(--accent);
  transform: translateX(4px);
}

.incident-row-left {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.incident-title {
  font-size: 0.9375rem;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 2px;
}

.incident-meta {
  font-size: 0.75rem;
}

.incident-row-right {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  flex-shrink: 0;
}

/* Severity badges */
.severity-badge {
  display: inline-flex;
  align-items: center;
  font-family: var(--font-mono);
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  padding: 2px 8px;
  border-radius: 3px;
  flex-shrink: 0;
}

.severity-badge.sev1 {
  color: var(--status-danger);
  background: var(--status-danger-dim);
  border: 1px solid rgba(192, 55, 55, 0.25);
}

.severity-badge.sev2 {
  color: var(--status-warning, #c78a1e);
  background: rgba(199, 138, 30, 0.1);
  border: 1px solid rgba(199, 138, 30, 0.25);
}

.severity-badge.sev3 {
  color: var(--text-secondary);
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
}

/* Status badge */
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-family: var(--font-mono);
  font-size: 0.65rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  padding: 2px 8px;
  border-radius: 3px;
}

.status-badge.active {
  color: var(--status-danger);
  background: var(--status-danger-dim);
  border: 1px solid rgba(192, 55, 55, 0.25);
}

.status-dot-sm {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-dot-sm.active {
  background: var(--status-danger);
  box-shadow: 0 0 4px rgba(192, 55, 55, 0.4);
  animation: dashboard-status-pulse 2s infinite;
}

/* Runbook list */
.runbook-list {
  display: flex;
  flex-direction: column;
}

.runbook-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-md) var(--space-lg);
  border-bottom: 1px solid var(--border-subtle);
  cursor: pointer;
  transition: background var(--transition-fast);
  animation: fade-in 0.25s ease both;
}

.runbook-row:last-child {
  border-bottom: none;
}

.runbook-row:hover {
  background: var(--bg-hover);
}

.runbook-row:hover .arrow {
  color: var(--accent);
  transform: translateX(4px);
}

.runbook-row-left {
  display: flex;
  align-items: flex-start;
  gap: var(--space-md);
}

.runbook-index {
  padding-top: 2px;
  min-width: 20px;
}

.runbook-title {
  font-size: 0.9375rem;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.runbook-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.runbook-row-right {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  flex-shrink: 0;
}

.arrow {
  color: var(--text-secondary);
  font-family: var(--font-mono);
  transition: color var(--transition-fast), transform var(--transition-fast);
}

/* Skeleton */
.runbook-skeleton {
  padding: var(--space-md) var(--space-lg);
  border-bottom: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

/* Empty state */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-2xl) var(--space-lg);
  text-align: center;
}

.empty-icon {
  font-size: 2rem;
  color: var(--text-muted);
  margin-bottom: var(--space-md);
  font-family: var(--font-mono);
}

.empty-title {
  font-family: var(--font-mono);
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: var(--space-xs);
}

/* Status dot */
.status-dot {
  background: var(--status-ok);
}

.status-dot.danger {
  background: var(--status-danger);
  box-shadow: 0 0 6px rgba(192, 55, 55, 0.4);
  animation: dashboard-status-pulse 2s infinite;
}

@keyframes dashboard-status-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
</style>
