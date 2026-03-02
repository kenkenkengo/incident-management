<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useRunbookStore } from "@/stores/runbook";
import { listTags } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth";
import TagInput from "@/components/TagInput.vue";

const route = useRoute();
const router = useRouter();
const store = useRunbookStore();
const authStore = useAuthStore();
const tagSuggestions = ref<string[]>([]);

const id = route.params.id as string | undefined;
const isEdit = computed(() => !!id);

const title = ref("");
const content = ref("");
const tagsInput = ref("");

onMounted(async () => {
	if (authStore.accessToken) {
		try {
			const tags = await listTags(authStore.accessToken);
			if (tags.success && tags.data) {
				tagSuggestions.value = tags.data;
			}
		} catch {
			// タグ取得エラーは無視
		}
	}
	if (isEdit.value && id) {
		try {
			await store.fetchOne(id);
			if (store.currentRunbook) {
				title.value = store.currentRunbook.title;
				content.value = store.currentRunbook.content;
				tagsInput.value = store.currentRunbook.tags.join(", ");
			}
		} catch (error) {
			alert(
				error instanceof Error
					? error.message
					: "Runbookの読み込みに失敗しました",
			);
			router.push({ name: "runbook-list" });
		}
	}
});

const parseTags = (input: string): string[] => {
	return input
		.split(",")
		.map((tag) => tag.trim())
		.filter((tag) => tag.length > 0);
};

const handleSubmit = async () => {
	const runbookData = {
		title: title.value,
		content: content.value,
		tags: parseTags(tagsInput.value),
	};

	try {
		if (isEdit.value && id) {
			const updated = await store.edit(id, runbookData);
			if (updated) {
				router.push({ name: "runbook-detail", params: { id } });
			}
		} else {
			const created = await store.create(runbookData);
			if (created) {
				router.push({ name: "runbook-detail", params: { id: created.id } });
			}
		}
	} catch (error) {
		alert(error instanceof Error ? error.message : "保存に失敗しました");
	}
};
</script>

<template>
  <div class="page-container">
    <!-- Back button -->
    <button class="back-btn" @click="router.back()">
      ← 戻る
    </button>

    <!-- Page header -->
    <div class="page-header">
      <div>
        <div class="page-eyebrow">{{ isEdit ? 'EDIT PROCEDURE' : 'NEW PROCEDURE' }}</div>
        <h1 class="page-title">{{ isEdit ? 'Runbookを編集' : 'Runbookを作成' }}</h1>
      </div>
    </div>

    <!-- Error -->
    <div v-if="store.error" class="form-error" role="alert">
      <span>!</span>
      {{ store.error }}
    </div>

    <form @submit.prevent="handleSubmit" class="runbook-form">
      <div class="form-layout">
        <!-- Main column -->
        <div class="form-main">
          <!-- Title -->
          <div class="form-group">
            <label for="title">タイトル</label>
            <input
              id="title"
              v-model="title"
              type="text"
              placeholder="例：DBサーバー障害対応手順"
              required
              class="title-input"
            />
          </div>

          <!-- Content -->
          <div class="form-group content-group">
            <div class="content-label-row">
              <label for="content">内容 (Markdown)</label>
              <span class="mono text-xs text-muted">Markdown形式で記述</span>
            </div>
            <textarea
              id="content"
              v-model="content"
              placeholder="## 手順
1. サーバーにSSHで接続
2. ログを確認
   \`\`\`bash
   tail -f /var/log/app.log
   \`\`\`
3. 必要に応じてサービスを再起動"
              required
              class="content-textarea"
            />
          </div>
        </div>

        <!-- Side column -->
        <div class="form-side">
          <!-- Tags -->
          <div class="side-card">
            <div class="side-card-header">
              <span class="side-card-title">タグ</span>
            </div>
            <div class="side-card-body">
              <label for="tags">カンマ区切りで入力</label>
              <TagInput
                id="tags"
                v-model="tagsInput"
                :suggestions="tagSuggestions"
                placeholder="DB, Network, Deploy"
              />

              <!-- Tag preview -->
              <div v-if="tagsInput" class="tag-preview">
                <span
                  v-for="tag in tagsInput.split(',').map(t => t.trim()).filter(Boolean)"
                  :key="tag"
                  class="tag"
                >{{ tag }}</span>
              </div>
            </div>
          </div>

          <!-- Actions -->
          <div class="form-actions">
            <button
              type="submit"
              class="submit-btn"
              :class="{ loading: store.isLoading }"
              :disabled="store.isLoading"
            >
              <span v-if="store.isLoading" class="loading-dots">
                <span />
                <span />
                <span />
              </span>
              <span v-else>
                {{ isEdit ? '更新する' : '作成する' }} →
              </span>
            </button>

            <button
              type="button"
              class="cancel-btn"
              @click="router.back()"
            >
              キャンセル
            </button>
          </div>
        </div>
      </div>
    </form>
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

.page-eyebrow {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  color: var(--accent);
  margin-bottom: 4px;
}

/* Error */
.form-error {
  display: flex;
  align-items: flex-start;
  gap: var(--space-sm);
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  color: var(--status-danger);
  background: var(--status-danger-dim);
  border: 1px solid rgba(255, 77, 107, 0.3);
  border-radius: 4px;
  padding: var(--space-sm) var(--space-md);
  margin-bottom: var(--space-lg);
}

/* Form layout */
.runbook-form {
  animation: fade-in 0.3s ease forwards;
}

.form-layout {
  display: grid;
  grid-template-columns: 1fr 280px;
  gap: var(--space-lg);
  align-items: start;
}

.form-main {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

/* Form groups */
.form-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.title-input {
  font-size: 1rem;
  padding: 12px var(--space-md);
}

.content-group {
  flex: 1;
}

.content-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-xs);
}

.content-textarea {
  height: calc(100vh - 380px);
  min-height: 400px;
  resize: vertical;
  line-height: 1.7;
  font-size: 0.875rem;
  font-family: var(--font-mono);
}

/* Side card */
.form-side {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  position: sticky;
  top: calc(var(--header-height) + var(--space-lg));
}

.side-card {
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: 6px;
  overflow: hidden;
}

.side-card-header {
  padding: 10px var(--space-md);
  background: var(--bg-elevated);
  border-bottom: 1px solid var(--border-default);
}

.side-card-title {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-secondary);
}

.side-card-body {
  padding: var(--space-md);
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

/* Tag preview */
.tag-preview {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
  padding-top: var(--space-xs);
}

/* Actions */
.form-actions {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.submit-btn {
  width: 100%;
  padding: 12px;
  background: var(--accent);
  color: var(--text-inverse);
  border: none;
  border-radius: 3px;
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  cursor: pointer;
  transition: all var(--transition-fast);
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
}

.submit-btn:hover:not(:disabled) {
  background: #fbb740;
  box-shadow: 0 0 20px var(--accent-glow-strong);
}

.submit-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.cancel-btn {
  width: 100%;
  padding: 10px;
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid var(--border-default);
  border-radius: 3px;
  font-family: var(--font-mono);
  font-size: 0.875rem;
  cursor: pointer;
  transition: all var(--transition-fast);
  letter-spacing: 0.04em;
}

.cancel-btn:hover {
  color: var(--text-secondary);
  border-color: var(--border-default);
  background: var(--bg-hover);
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
</style>
