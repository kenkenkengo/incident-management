<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { listIncidents, type Incident } from "@/lib/api-client";

const router = useRouter();
const authStore = useAuthStore();
const incidents = ref<Incident[]>([]);
const loading = ref(true);
const error = ref("");
const statusFilter = ref<"active" | "closed" | undefined>(undefined);

const fetchIncidents = async () => {
	loading.value = true;
	error.value = "";
	try {
		if (!authStore.accessToken) return;
		const res = await listIncidents(authStore.accessToken, statusFilter.value);
		if (res.success && res.data) {
			incidents.value = res.data;
		} else {
			error.value = res.error ?? "Failed to load incidents";
		}
	} catch {
		error.value = "Failed to load incidents";
	} finally {
		loading.value = false;
	}
};

onMounted(fetchIncidents);

const setFilter = (status: "active" | "closed" | undefined) => {
	statusFilter.value = status;
	fetchIncidents();
};

const goToDetail = (id: string) => {
	router.push({ name: "incident-detail", params: { id } });
};

const formatDate = (iso: string) => new Date(iso).toLocaleString("ja-JP");

const formatDuration = (incident: Incident) => {
	const start = new Date(incident.startedAt).getTime();
	const end = incident.endedAt
		? new Date(incident.endedAt).getTime()
		: Date.now();
	const diffMin = Math.floor((end - start) / 60000);
	if (diffMin < 60) return `${diffMin}m`;
	const h = Math.floor(diffMin / 60);
	const m = diffMin % 60;
	return `${h}h ${m}m`;
};
</script>

<template>
	<div class="page-container">
		<!-- Page header -->
		<div class="page-header">
			<div>
				<div class="page-eyebrow">RESPONSE</div>
				<h1 class="page-title">Incidents</h1>
			</div>
		</div>

		<!-- Filter tabs -->
		<div class="filter-tabs">
			<button
				class="filter-tab"
				:class="{ active: statusFilter === undefined }"
				@click="setFilter(undefined)"
			>
				All
			</button>
			<button
				class="filter-tab"
				:class="{ active: statusFilter === 'active' }"
				@click="setFilter('active')"
			>
				<span class="status-dot active" />
				Active
			</button>
			<button
				class="filter-tab"
				:class="{ active: statusFilter === 'closed' }"
				@click="setFilter('closed')"
			>
				<span class="status-dot closed" />
				Closed
			</button>
		</div>

		<!-- Table -->
		<div class="incident-table">
			<div class="table-head">
				<span class="col-status">Status</span>
				<span class="col-title">Title</span>
				<span class="col-duration">Duration</span>
				<span class="col-date">Started</span>
				<span class="col-arrow" />
			</div>

			<!-- Loading -->
			<template v-if="loading">
				<div v-for="i in 4" :key="i" class="table-row skeleton-row">
					<span class="col-status">
						<div class="skeleton" style="width: 60px; height: 20px; border-radius: 3px;" />
					</span>
					<span class="col-title">
						<div class="skeleton" :style="`width: ${50 + i * 10}%; height: 16px; border-radius: 3px;`" />
					</span>
					<span class="col-duration">
						<div class="skeleton" style="width: 40px; height: 14px; border-radius: 2px;" />
					</span>
					<span class="col-date">
						<div class="skeleton" style="width: 100px; height: 14px; border-radius: 2px;" />
					</span>
					<span class="col-arrow" />
				</div>
			</template>

			<!-- Error -->
			<div v-else-if="error" class="state-message error">
				<span class="state-icon">!</span>
				<span>{{ error }}</span>
			</div>

			<!-- Empty -->
			<div v-else-if="incidents.length === 0" class="state-message empty">
				<span class="state-icon">◇</span>
				<span>インシデントはありません</span>
			</div>

			<!-- Rows -->
			<template v-else>
				<div
					v-for="(incident, i) in incidents"
					:key="incident.id"
					class="table-row"
					:style="{ animationDelay: `${i * 40}ms` }"
					@click="goToDetail(incident.id)"
				>
					<span class="col-status">
						<span :class="['status-badge', incident.status]">
							<span :class="['status-dot', incident.status]" />
							{{ incident.status === "active" ? "ACTIVE" : "CLOSED" }}
						</span>
					</span>
					<span class="col-title">
						<span class="row-title">{{ incident.title }}</span>
					</span>
					<span class="col-duration mono text-xs text-muted">
						{{ formatDuration(incident) }}
					</span>
					<span class="col-date mono text-xs text-muted">
						{{ formatDate(incident.startedAt) }}
					</span>
					<span class="col-arrow">→</span>
				</div>
			</template>
		</div>

		<!-- Results count -->
		<div v-if="!loading && incidents.length > 0" class="results-count">
			<span class="mono text-xs text-muted">{{ incidents.length }} incident(s)</span>
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

/* Filter tabs */
.filter-tabs {
	display: flex;
	gap: 2px;
	margin-bottom: var(--space-lg);
	background: var(--bg-elevated);
	border: 1px solid var(--border-subtle);
	border-radius: 4px;
	padding: 3px;
	width: fit-content;
}

.filter-tab {
	display: flex;
	align-items: center;
	gap: var(--space-xs);
	font-family: var(--font-mono);
	font-size: 0.8rem;
	font-weight: 500;
	letter-spacing: 0.04em;
	color: var(--text-secondary);
	background: transparent;
	border: none;
	padding: 5px 14px;
	border-radius: 3px;
	cursor: pointer;
	transition: all var(--transition-fast);
}

.filter-tab:hover {
	color: var(--text-primary);
}

.filter-tab.active {
	background: var(--bg-surface);
	color: var(--text-primary);
	box-shadow: var(--shadow-sm);
}

/* Status */
.status-badge {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	font-family: var(--font-mono);
	font-size: 0.7rem;
	font-weight: 600;
	letter-spacing: 0.06em;
	padding: 3px 10px;
	border-radius: 3px;
}

.status-badge.active {
	color: var(--status-danger);
	background: var(--status-danger-dim);
	border: 1px solid rgba(192, 55, 55, 0.25);
}

.status-badge.closed {
	color: var(--status-ok);
	background: var(--status-ok-dim);
	border: 1px solid rgba(27, 127, 78, 0.25);
}

.status-dot {
	width: 6px;
	height: 6px;
	border-radius: 50%;
	flex-shrink: 0;
}

.status-dot.active {
	background: var(--status-danger);
	box-shadow: 0 0 6px rgba(192, 55, 55, 0.4);
	animation: pulse 2s infinite;
}

.status-dot.closed {
	background: var(--status-ok);
}

/* Table */
.incident-table {
	background: var(--bg-surface);
	border: 1px solid var(--border-subtle);
	border-radius: 8px;
	overflow: hidden;
	margin-bottom: var(--space-md);
	box-shadow: var(--shadow-sm);
}

.table-head {
	display: grid;
	grid-template-columns: 100px 1fr 80px 160px 32px;
	align-items: center;
	padding: 8px var(--space-lg);
	background: var(--bg-elevated);
	border-bottom: 1px solid var(--border-default);
}

.table-head span {
	font-family: var(--font-mono);
	font-size: 0.75rem;
	font-weight: 600;
	letter-spacing: 0.06em;
	text-transform: uppercase;
	color: var(--text-secondary);
}

.table-row {
	display: grid;
	grid-template-columns: 100px 1fr 80px 160px 32px;
	align-items: center;
	padding: var(--space-md) var(--space-lg);
	border-bottom: 1px solid var(--border-subtle);
	cursor: pointer;
	transition: background var(--transition-fast);
	animation: fade-in 0.25s ease both;
}

.table-row:last-child {
	border-bottom: none;
}

.table-row:hover {
	background: var(--bg-hover);
}

.table-row:hover .col-arrow {
	color: var(--accent);
	transform: translateX(4px);
}

.skeleton-row {
	cursor: default;
	animation: none;
}

.row-title {
	font-size: 0.9375rem;
	font-weight: 500;
	color: var(--text-primary);
	line-height: 1.3;
}

.col-arrow {
	font-family: var(--font-mono);
	color: var(--text-secondary);
	transition: color var(--transition-fast), transform var(--transition-fast);
	text-align: right;
}

/* State messages */
.state-message {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	padding: var(--space-2xl) var(--space-lg);
	gap: var(--space-sm);
	font-family: var(--font-mono);
	text-align: center;
}

.state-icon {
	font-size: 2rem;
	color: var(--text-muted);
	margin-bottom: var(--space-sm);
}

.state-message.error {
	color: var(--status-danger);
}

.state-message.empty {
	color: var(--text-secondary);
}

/* Results count */
.results-count {
	text-align: right;
	padding: var(--space-sm) 0;
}
</style>
