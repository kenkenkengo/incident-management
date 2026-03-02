<script setup lang="ts">
import DOMPurify from "dompurify";
import { marked } from "marked";
import { computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useRunbookStore } from "@/stores/runbook";

const route = useRoute();
const router = useRouter();
const store = useRunbookStore();

const id = route.params.id as string;

onMounted(() => {
	store.fetchOne(id);
});

const renderedContent = computed(() => {
	if (!store.currentRunbook) return "";
	return DOMPurify.sanitize(
		marked.parse(store.currentRunbook.content) as string,
	);
});

const goToEdit = () => {
	router.push({ name: "runbook-edit", params: { id } });
};

const handleDelete = async () => {
	if (confirm("このRunbookを削除してもよろしいですか？")) {
		try {
			const success = await store.remove(id);
			if (success) {
				router.push({ name: "runbook-list" });
			}
		} catch (error) {
			alert(error instanceof Error ? error.message : "削除に失敗しました");
		}
	}
};
</script>

<template>
  <div class="page-container">
    <!-- Back button -->
    <button class="back-btn" @click="router.push({ name: 'runbook-list' })">
      ← Runbooks
    </button>

    <!-- Loading -->
    <template v-if="store.isLoading">
      <div class="loading-state">
        <div class="skeleton" style="height: 32px; width: 60%; border-radius: 4px; margin-bottom: 16px;" />
        <div class="skeleton" style="height: 20px; width: 30%; border-radius: 3px; margin-bottom: 32px;" />
        <div v-for="i in 5" :key="i" class="skeleton" :style="`height: 16px; width: ${80 + (i % 3) * 10}%; border-radius: 3px; margin-bottom: 12px;`" />
      </div>
    </template>

    <!-- Error -->
    <div v-else-if="store.error" class="error-state">
      <span class="error-icon">!</span>
      <p>{{ store.error }}</p>
    </div>

    <!-- Content -->
    <template v-else-if="store.currentRunbook">
      <!-- Article header -->
      <div class="article-header">
        <div class="article-meta-top">
          <div class="runbook-id mono text-xs text-muted">
            RB-{{ store.currentRunbook.id.slice(-8).toUpperCase() }}
          </div>
          <div class="article-actions">
            <button class="btn-ghost" @click="goToEdit">編集</button>
            <button class="btn-danger" @click="handleDelete">削除</button>
          </div>
        </div>

        <h1 class="article-title">{{ store.currentRunbook.title }}</h1>

        <div class="article-meta">
          <div class="tags-row" v-if="store.currentRunbook.tags.length > 0">
            <span v-for="tag in store.currentRunbook.tags" :key="tag" class="tag">{{ tag }}</span>
          </div>
          <div class="timestamps">
            <span class="mono text-xs text-muted">
              作成: {{ new Date(store.currentRunbook.createdAt).toLocaleString("ja-JP") }}
            </span>
            <span class="timestamp-sep">·</span>
            <span class="mono text-xs text-muted">
              更新: {{ new Date(store.currentRunbook.updatedAt).toLocaleString("ja-JP") }}
            </span>
          </div>
        </div>
      </div>

      <!-- Divider -->
      <div class="article-divider">
        <span class="divider-label mono text-xs">CONTENT</span>
      </div>

      <!-- Article content -->
      <article
        class="markdown-body article-body"
        v-html="renderedContent"
      />
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

.runbook-id {
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  padding: 3px 8px;
  border-radius: 2px;
  font-size: 0.8rem;
}

.article-actions {
  display: flex;
  gap: var(--space-sm);
}

.btn-ghost {
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid var(--border-default);
  padding: 6px 14px;
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
  border-color: var(--border-strong);
}

.btn-danger {
  background: transparent;
  color: var(--status-danger);
  border: 1px solid rgba(255, 92, 117, 0.5);
  padding: 6px 14px;
  font-family: var(--font-mono);
  font-size: 0.875rem;
  border-radius: 3px;
  cursor: pointer;
  transition: all var(--transition-fast);
  letter-spacing: 0.04em;
}

.btn-danger:hover {
  background: var(--status-danger-dim);
  border-color: var(--status-danger);
}

.article-title {
  font-family: var(--font-mono);
  font-size: 2rem;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.2;
  margin-bottom: var(--space-lg);
  letter-spacing: -0.03em;
}

.article-meta {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.tags-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
}

.timestamps {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.timestamp-sep {
  color: var(--text-muted);
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

/* Article body */
.article-body {
  max-width: 760px;
  animation: fade-in 0.35s ease 0.1s both;
}
</style>
