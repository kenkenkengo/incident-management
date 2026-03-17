<script setup lang="ts">
import DOMPurify from "dompurify";
import { marked } from "marked";
import { onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
	generatePostmortem,
	generateRunbookFromPostmortem,
	getIncident,
	getIncidentMessages,
	getPostmortem,
	type Incident,
	type IncidentMessage,
	type Postmortem,
} from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth";

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const incident = ref<Incident | null>(null);
const messages = ref<IncidentMessage[]>([]);
const postmortem = ref<Postmortem | null>(null);
const postmortemHtml = ref("");
const generatingPostmortem = ref(false);
const postmortemError = ref("");
const generatingRunbook = ref(false);
const loading = ref(true);
const error = ref("");

const id = route.params.id as string;

onMounted(async () => {
	try {
		if (!authStore.accessToken) return;
		const incidentRes = await getIncident(authStore.accessToken, id);
		if (incidentRes.success && incidentRes.data) {
			incident.value = incidentRes.data;
		} else {
			error.value = incidentRes.error ?? "Incident not found";
		}

		// メッセージを全件取得（ページネーションループ）
		const allMessages: IncidentMessage[] = [];
		let cursor: string | undefined;
		do {
			const res = await getIncidentMessages(authStore.accessToken, id, {
				limit: 100,
				cursor,
			});
			if (res.success && res.data) {
				allMessages.push(...res.data);
			}
			cursor = res.meta?.nextCursor ?? undefined;
		} while (cursor);
		messages.value = allMessages;

		const pmRes = await getPostmortem(authStore.accessToken, id);
		if (pmRes.success && pmRes.data) {
			postmortem.value = pmRes.data;
			postmortemHtml.value = DOMPurify.sanitize(
				await marked.parse(pmRes.data.content),
			);
		}
	} catch {
		error.value = "Failed to load incident";
	} finally {
		loading.value = false;
	}
});

const formatDate = (iso: string) => new Date(iso).toLocaleString("ja-JP");

const formatDuration = (inc: Incident) => {
	const start = new Date(inc.startedAt).getTime();
	const end = inc.endedAt ? new Date(inc.endedAt).getTime() : Date.now();
	const diffMin = Math.floor((end - start) / 60000);
	if (diffMin < 60) return `${diffMin}分`;
	const h = Math.floor(diffMin / 60);
	const m = diffMin % 60;
	return `${h}時間${m}分`;
};

const formatMessageTime = (iso: string) => {
	const d = new Date(iso);
	return d.toLocaleTimeString("ja-JP", {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
};

const handleGeneratePostmortem = async () => {
	if (!authStore.accessToken) return;
	generatingPostmortem.value = true;
	postmortemError.value = "";
	try {
		const res = await generatePostmortem(authStore.accessToken, id);
		if (res.success && res.data) {
			postmortem.value = res.data;
			postmortemHtml.value = DOMPurify.sanitize(
				await marked.parse(res.data.content),
			);
		} else {
			postmortemError.value = res.error ?? "Failed to generate postmortem";
		}
	} catch {
		postmortemError.value = "Failed to generate postmortem";
	} finally {
		generatingPostmortem.value = false;
	}
};

const handleGenerateRunbook = async () => {
	if (!authStore.accessToken) return;
	generatingRunbook.value = true;
	try {
		const res = await generateRunbookFromPostmortem(authStore.accessToken, id);
		if (res.success && res.data) {
			router.push({
				name: "runbook-new",
				query: { fromIncident: id },
				state: { draft: JSON.stringify(res.data) },
			});
		} else {
			postmortemError.value = res.error ?? "Failed to generate runbook draft";
		}
	} catch {
		postmortemError.value = "Failed to generate runbook draft";
	} finally {
		generatingRunbook.value = false;
	}
};
</script>

<template>
	<div class="page-container">
		<!-- Back button -->
		<button class="back-btn" @click="router.push({ name: 'incident-list' })">
			← Incidents
		</button>

		<!-- Loading -->
		<template v-if="loading">
			<div class="loading-state">
				<div class="skeleton" style="height: 32px; width: 60%; border-radius: 4px; margin-bottom: 16px;" />
				<div class="skeleton" style="height: 20px; width: 30%; border-radius: 3px; margin-bottom: 32px;" />
				<div v-for="i in 5" :key="i" class="skeleton"
					:style="`height: 16px; width: ${80 + (i % 3) * 10}%; border-radius: 3px; margin-bottom: 12px;`" />
			</div>
		</template>

		<!-- Error -->
		<div v-else-if="error" class="error-state">
			<span class="error-icon">!</span>
			<p>{{ error }}</p>
		</div>

		<!-- Content -->
		<template v-else-if="incident">
			<!-- Header -->
			<div class="article-header">
				<div class="article-meta-top">
					<div class="incident-id mono text-xs text-muted">
						INC-{{ incident.id.slice(-8).toUpperCase() }}
					</div>
					<span :class="['status-badge', incident.status]">
						<span :class="['status-dot', incident.status]" />
						{{ incident.status === "active" ? "ACTIVE" : "CLOSED" }}
					</span>
				</div>

				<h1 class="article-title">{{ incident.title }}</h1>

				<div class="meta-grid">
					<div class="meta-item">
						<span class="meta-label">重要度</span>
						<span class="meta-value">
							<span :class="['severity-badge', incident.severity.toLowerCase()]">{{ incident.severity }}</span>
						</span>
					</div>
					<div class="meta-item">
						<span class="meta-label">開始</span>
						<span class="meta-value mono">{{ formatDate(incident.startedAt) }}</span>
					</div>
					<div v-if="incident.endedAt" class="meta-item">
						<span class="meta-label">終了</span>
						<span class="meta-value mono">{{ formatDate(incident.endedAt) }}</span>
					</div>
					<div class="meta-item">
						<span class="meta-label">経過時間</span>
						<span class="meta-value mono">{{ formatDuration(incident) }}</span>
					</div>
					<div class="meta-item">
						<span class="meta-label">メッセージ</span>
						<span class="meta-value mono">{{ messages.length }}件</span>
					</div>
					<div v-if="incident.impact" class="meta-item meta-item-wide">
						<span class="meta-label">影響範囲</span>
						<span class="meta-value">{{ incident.impact }}</span>
					</div>
					<div v-if="incident.resolution" class="meta-item meta-item-wide">
						<span class="meta-label">解決方法</span>
						<span class="meta-value">{{ incident.resolution }}</span>
					</div>
				</div>
			</div>

			<!-- Postmortem section -->
			<div class="article-divider">
				<span class="divider-label mono text-xs">POSTMORTEM</span>
			</div>

			<div v-if="postmortem" class="postmortem-section">
				<div class="postmortem-meta">
					<span class="mono text-xs text-muted">
						生成日時: {{ formatDate(postmortem.generatedAt) }}
					</span>
					<div class="postmortem-actions">
						<button class="btn-runbook" :disabled="generatingRunbook" @click="handleGenerateRunbook">
							{{ generatingRunbook ? "生成中..." : "Runbookを生成" }}
						</button>
						<button class="btn-regenerate" :disabled="generatingPostmortem" @click="handleGeneratePostmortem">
							{{ generatingPostmortem ? "生成中..." : "再生成" }}
						</button>
					</div>
				</div>
				<div class="postmortem-content markdown-body" v-html="postmortemHtml" />
			</div>

			<div v-else class="postmortem-empty">
				<p v-if="postmortemError" class="postmortem-error mono text-xs">{{ postmortemError }}</p>
				<button v-if="incident.status === 'closed' && messages.length > 0" class="btn-generate"
					:disabled="generatingPostmortem" @click="handleGeneratePostmortem">
					{{ generatingPostmortem ? "生成中..." : "ポストモーテムを生成" }}
				</button>
				<span v-else class="mono text-xs text-muted">
					{{ incident.status === "active" ? "インシデント終了後に生成できます" : "メッセージがありません" }}
				</span>
			</div>

			<!-- Divider -->
			<div class="article-divider">
				<span class="divider-label mono text-xs">MESSAGE LOG</span>
			</div>

			<!-- Messages -->
			<div v-if="messages.length === 0" class="empty-messages">
				<span class="mono text-muted">メッセージはありません</span>
			</div>

			<div v-else class="message-timeline">
				<div v-for="(msg, i) in messages" :key="msg.messageTs" class="message-item"
					:style="{ animationDelay: `${i * 30}ms` }">
					<div class="message-gutter">
						<span class="message-time mono text-xs">{{ formatMessageTime(msg.recordedAt) }}</span>
						<div class="timeline-line" />
					</div>
					<div class="message-content">
						<span class="message-user mono text-xs">{{ msg.userName }}</span>
						<p class="message-text">{{ msg.text }}</p>
					</div>
				</div>
			</div>
		</template>
	</div>
</template>

<style scoped>
.back-btn {
	display: inline-flex;
	align-items: center;
	font-family: var(--font-mono);
	font-size: 0.875rem;
	font-weight: 500;
	letter-spacing: 0.04em;
	color: var(--text-secondary);
	background: transparent;
	border: none;
	cursor: pointer;
	padding: 4px 0;
	margin-bottom: var(--space-xl);
	transition: color var(--transition-fast);
	gap: var(--space-xs);
}

.back-btn:hover {
	color: var(--accent);
}

/* Loading */
.loading-state {
	padding-top: var(--space-lg);
}

/* Error */
.error-state {
	display: flex;
	align-items: flex-start;
	gap: var(--space-sm);
	font-family: var(--font-mono);
	color: var(--status-danger);
	background: var(--status-danger-dim);
	border: 1px solid rgba(255, 77, 107, 0.3);
	border-radius: 4px;
	padding: var(--space-md) var(--space-lg);
}

.error-icon {
	font-weight: 700;
	flex-shrink: 0;
}

/* Article header */
.article-header {
	margin-bottom: var(--space-lg);
	animation: fade-in 0.3s ease forwards;
}

.article-meta-top {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-bottom: var(--space-md);
}

.incident-id {
	background: var(--bg-elevated);
	border: 1px solid var(--border-default);
	padding: 3px 8px;
	border-radius: 2px;
	font-size: 0.8rem;
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

.article-title {
	font-family: var(--font-display);
	font-size: 2.25rem;
	font-weight: 500;
	color: var(--text-primary);
	line-height: 1.2;
	margin-bottom: var(--space-lg);
	letter-spacing: -0.01em;
}

/* Meta grid */
.meta-grid {
	display: flex;
	gap: var(--space-xl);
	flex-wrap: wrap;
}

.meta-item {
	display: flex;
	flex-direction: column;
	gap: 2px;
}

.meta-label {
	font-family: var(--font-mono);
	font-size: 0.7rem;
	font-weight: 600;
	letter-spacing: 0.08em;
	text-transform: uppercase;
	color: var(--text-muted);
}

.meta-value {
	font-size: 0.875rem;
	color: var(--text-primary);
}

/* Divider */
.article-divider {
	position: relative;
	margin: var(--space-xl) 0;
	border-top: 1px solid var(--border-default);
}

.divider-label {
	position: absolute;
	top: -10px;
	left: 0;
	background: var(--bg-base);
	padding-right: var(--space-sm);
	color: var(--text-secondary);
	letter-spacing: 0.08em;
	font-size: 0.75rem;
}

/* Empty messages */
.empty-messages {
	text-align: center;
	padding: var(--space-2xl);
}

/* Message timeline */
.message-timeline {
	display: flex;
	flex-direction: column;
}

.message-item {
	display: flex;
	gap: var(--space-md);
	animation: fade-in 0.25s ease both;
}

.message-gutter {
	display: flex;
	flex-direction: column;
	align-items: center;
	width: 70px;
	flex-shrink: 0;
	padding-top: 2px;
}

.message-time {
	color: var(--text-muted);
	white-space: nowrap;
}

.timeline-line {
	flex: 1;
	width: 1px;
	background: var(--border-default);
	margin-top: var(--space-xs);
}

.message-content {
	flex: 1;
	padding-bottom: var(--space-lg);
	border-bottom: 1px solid var(--border-subtle);
	margin-bottom: var(--space-md);
}

.message-item:last-child .message-content {
	border-bottom: none;
	margin-bottom: 0;
}

.message-item:last-child .timeline-line {
	display: none;
}

.message-user {
	color: var(--accent);
	font-weight: 600;
	display: block;
	margin-bottom: 2px;
}

.message-text {
	font-size: 0.9375rem;
	line-height: 1.6;
	color: var(--text-primary);
	white-space: pre-wrap;
	word-break: break-word;
}

/* Postmortem */
.postmortem-section {
	margin-bottom: var(--space-lg);
}

.postmortem-meta {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-bottom: var(--space-md);
}

.postmortem-actions {
	display: flex;
	align-items: center;
	gap: var(--space-sm);
}

.btn-runbook {
	font-family: var(--font-mono);
	font-size: 0.75rem;
	font-weight: 600;
	letter-spacing: 0.06em;
	padding: 4px 12px;
	border-radius: 4px;
	cursor: pointer;
	transition: all var(--transition-fast);
	color: var(--bg-base);
	background: var(--accent);
	border: 1px solid var(--accent);
}

.btn-runbook:hover:not(:disabled) {
	opacity: 0.9;
}

.btn-runbook:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.postmortem-content {
	background: var(--bg-surface);
	border: 1px solid var(--border-subtle);
	border-radius: 8px;
	padding: var(--space-lg);
	line-height: 1.7;
}

.postmortem-content :deep(h2) {
	font-size: 1.25rem;
	font-weight: 600;
	margin-top: var(--space-lg);
	margin-bottom: var(--space-sm);
	color: var(--text-primary);
}

.postmortem-content :deep(h2:first-child) {
	margin-top: 0;
}

.postmortem-content :deep(ul) {
	padding-left: var(--space-lg);
	margin-bottom: var(--space-md);
}

.postmortem-content :deep(li) {
	margin-bottom: var(--space-xs);
}

.postmortem-content :deep(p) {
	margin-bottom: var(--space-sm);
}

.postmortem-empty {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: var(--space-sm);
	padding: var(--space-xl);
	text-align: center;
}

.postmortem-error {
	color: var(--status-danger);
}

.btn-generate,
.btn-regenerate {
	font-family: var(--font-mono);
	font-size: 0.8rem;
	font-weight: 600;
	letter-spacing: 0.06em;
	padding: 8px 20px;
	border-radius: 4px;
	cursor: pointer;
	transition: all var(--transition-fast);
}

.btn-generate {
	color: var(--bg-base);
	background: var(--accent);
	border: 1px solid var(--accent);
}

.btn-generate:hover:not(:disabled) {
	opacity: 0.9;
}

.btn-generate:disabled,
.btn-regenerate:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.btn-regenerate {
	color: var(--text-secondary);
	background: transparent;
	border: 1px solid var(--border-default);
	font-size: 0.75rem;
	padding: 4px 12px;
}

.btn-regenerate:hover:not(:disabled) {
	color: var(--accent);
	border-color: var(--accent);
}

.severity-badge {
	font-family: var(--font-mono);
	font-size: 0.7rem;
	font-weight: 600;
	letter-spacing: 0.04em;
	padding: 2px 8px;
	border-radius: 3px;
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

.meta-item-wide {
	flex-basis: 100%;
}
</style>
