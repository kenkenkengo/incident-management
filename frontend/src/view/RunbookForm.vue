<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useRunbookStore } from "@/stores/runbook";

const route = useRoute();
const router = useRouter();
const store = useRunbookStore();

const id = route.params.id as string | undefined;
const isEdit = computed(() => !!id);

const title = ref("");
const content = ref("");
const tagsInput = ref("");

onMounted(async () => {
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
  <main>
    <button @click="router.back()">← 戻る</button>
    <h1>{{ isEdit ? 'Runbookを編集' : 'Runbookを作成' }}</h1>
    <p v-if="store.error">{{ store.error }}</p>

    <form @submit.prevent="handleSubmit">
      <div>
        <label for="title">タイトル:</label>
        <input id="title" v-model="title" type="text" placeholder="例：DBサーバー障害対応手順" required />
      </div>
      <div>
        <label for="tags">タグ（カンマ区切り）:</label>
        <input id="tags" v-model="tagsInput" type="text" placeholder="例：DB, Network, Deploy" />
      </div>
      <div>
        <label for="content">内容 (Markdown形式):</label>
        <textarea id="content" v-model="content" rows="20" placeholder="例：1. サーバーにSSHで接続\n2. ログを確認\n3. 必要に応じてサービスを再起動"
          required></textarea>
      </div>

      <button type="submit">{{ store.isLoading ? (isEdit ? '更新中...' : '作成中...') : (isEdit ? '更新' : '作成') }}</button>
    </form>
  </main>
</template>

<style scoped></style>