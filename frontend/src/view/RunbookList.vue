<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import TagInput from "@/components/TagInput.vue";
import { listTags } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth";
import { useRunbookStore } from "@/stores/runbook";

const store = useRunbookStore();
const authStore = useAuthStore();
const router = useRouter();
const tagsInput = ref("");
const allTags = ref<string[]>([]);

onMounted(async () => {
	store.fetchAll();
	if (authStore.accessToken) {
		try {
			const res = await listTags(authStore.accessToken);
			if (res.success && res.data) {
				allTags.value = res.data;
			}
		} catch {
			// タグ取得エラーは無視
		}
	}
});

const currentTags = () => {
	const tags = tagsInput.value
		.split(",")
		.map((t) => t.trim())
		.filter(Boolean);
	return tags.length > 0 ? tags : undefined;
};

const applyFilter = () => {
	store.fetchAll(currentTags());
};

const clearFilter = () => {
	tagsInput.value = "";
	store.fetchAll();
};

const loadMore = () => {
	store.fetchMore(currentTags());
};

const goToDetail = (id: string) => {
	router.push({ name: "runbook-detail", params: { id } });
};

const goToNew = () => {
	router.push({ name: "runbook-new" });
};
</script>

<template>
  <div class="page-container">
    <!-- Page header -->
    <div class="page-header">
      <div>
        <div class="page-eyebrow">PROCEDURES</div>
        <h1 class="page-title">Runbooks</h1>
      </div>
      <button class="btn-primary" @click="goToNew">+ New Runbook</button>
    </div>

    <!-- Filter bar -->
    <div class="filter-bar">
      <div class="filter-input-wrap">
        <span class="filter-icon mono text-muted">#</span>
        <TagInput
          v-model="tagsInput"
          :suggestions="allTags"
          class="filter-tag-input"
          placeholder="タグで絞り込み（カンマ区切りでAND検索）"
          @keyup.enter="applyFilter"
        />
        <button v-if="tagsInput" class="clear-btn" @click="clearFilter">×</button>
      </div>
      <button class="btn-ghost" @click="applyFilter">検索</button>
    </div>

    <!-- Content -->
    <div class="runbook-table">
      <!-- Table header -->
      <div class="table-head">
        <span class="col-num">#</span>
        <span class="col-title">Title</span>
        <span class="col-tags">Tags</span>
        <span class="col-date">Last Updated</span>
      </div>

      <!-- Loading -->
      <template v-if="store.isLoading">
        <div v-for="i in 5" :key="i" class="table-row skeleton-row">
          <span class="col-num">
            <div class="skeleton" style="width: 20px; height: 14px; border-radius: 2px;" />
          </span>
          <span class="col-title">
            <div class="skeleton" :style="`width: ${60 + i * 7}%; height: 16px; border-radius: 3px;`" />
          </span>
          <span class="col-tags">
            <div class="skeleton" style="width: 80px; height: 20px; border-radius: 2px;" />
          </span>
          <span class="col-date">
            <div class="skeleton" style="width: 90px; height: 14px; border-radius: 2px;" />
          </span>
        </div>
      </template>

      <!-- Error -->
      <div v-else-if="store.error" class="state-message error">
        <span class="state-icon">!</span>
        <span>{{ store.error }}</span>
      </div>

      <!-- Empty -->
      <div v-else-if="store.runbooks.length === 0" class="state-message empty">
        <span class="state-icon">≡</span>
        <span>Runbookがありません</span>
        <button class="btn-primary" style="margin-top: 16px;" @click="goToNew">+ 最初のRunbookを作成</button>
      </div>

      <!-- Rows -->
      <template v-else>
        <div
          v-for="(runbook, i) in store.runbooks"
          :key="runbook.id"
          class="table-row"
          :style="{ animationDelay: `${i * 40}ms` }"
          @click="goToDetail(runbook.id)"
        >
          <span class="col-num mono text-xs text-muted">{{ String(i + 1).padStart(2, '0') }}</span>
          <span class="col-title">
            <span class="row-title">{{ runbook.title }}</span>
          </span>
          <span class="col-tags">
            <span v-if="runbook.tags.length > 0" class="tags-wrap">
              <span v-for="tag in runbook.tags.slice(0, 3)" :key="tag" class="tag">{{ tag }}</span>
              <span v-if="runbook.tags.length > 3" class="tag text-muted">+{{ runbook.tags.length - 3 }}</span>
            </span>
            <span v-else class="text-muted text-xs mono">—</span>
          </span>
          <span class="col-date mono text-xs text-muted">
            {{ new Date(runbook.updatedAt).toLocaleDateString("ja-JP") }}
          </span>
          <span class="col-arrow">→</span>
        </div>
      </template>
    </div>

    <!-- Load more -->
    <div v-if="store.nextCursor && !store.isLoading" class="load-more">
      <button class="btn-load-more" :disabled="store.isLoadingMore" @click="loadMore">
        {{ store.isLoadingMore ? "読み込み中..." : "もっと読む" }}
      </button>
    </div>

    <!-- Results count -->
    <div v-if="!store.isLoading && store.runbooks.length > 0" class="results-count">
      <span class="mono text-xs text-muted">{{ store.runbooks.length }} runbook(s) found</span>
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
  padding: 8px 16px;
  font-family: var(--font-mono);
  font-size: 0.875rem;
  border-radius: 3px;
  cursor: pointer;
  transition: all var(--transition-fast);
  white-space: nowrap;
}

.btn-ghost:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

/* Filter bar */
.filter-bar {
  display: flex;
  gap: var(--space-sm);
  margin-bottom: var(--space-lg);
}

.filter-input-wrap {
  flex: 1;
  position: relative;
  display: flex;
  align-items: center;
}

.filter-icon {
  position: absolute;
  left: var(--space-md);
  font-size: 1rem;
  pointer-events: none;
  user-select: none;
}

.filter-tag-input {
  flex: 1;
}

.filter-tag-input :deep(input) {
  width: 100%;
  padding-left: calc(var(--space-md) + 16px + var(--space-xs));
  padding-right: var(--space-xl);
}

.clear-btn {
  position: absolute;
  right: var(--space-sm);
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 1.2rem;
  line-height: 1;
  padding: 2px 4px;
  transition: color var(--transition-fast);
}

.clear-btn:hover {
  color: var(--text-primary);
}

/* Table */
.runbook-table {
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  overflow: hidden;
  margin-bottom: var(--space-md);
  box-shadow: var(--shadow-sm);
}

.table-head {
  display: grid;
  grid-template-columns: 40px 1fr 200px 120px 32px;
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
  grid-template-columns: 40px 1fr 200px 120px 32px;
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

.tags-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
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

/* Load more */
.load-more {
  display: flex;
  justify-content: center;
  padding: var(--space-md) 0;
}

.btn-load-more {
  font-family: var(--font-mono);
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--text-secondary);
  background: transparent;
  border: 1px solid var(--border-default);
  padding: 8px 24px;
  border-radius: 4px;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.btn-load-more:hover:not(:disabled) {
  color: var(--accent);
  border-color: var(--accent);
}

.btn-load-more:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Results count */
.results-count {
  text-align: right;
  padding: var(--space-sm) 0;
}
</style>
