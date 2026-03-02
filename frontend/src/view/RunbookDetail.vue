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
  <main>
    <button @click="router.push({
      name: 'runbook-list'
    })">一覧に戻る</button>

    <p v-if="store.isLoading">読み込み中...</p>
    <p v-else-if="store.error">{{ store.error }}</p>

    <template v-else-if="store.currentRunbook">
      <div>
        <h1>{{ store.currentRunbook.title }}</h1>
        <div>
          <button @click="goToEdit">編集</button>
          <button @click="handleDelete">削除</button>
        </div>
        <div v-if="store.currentRunbook.tags.length > 0">
          <span v-for="tag in store.currentRunbook.tags" :key="tag">{{ tag }}, </span>
        </div>

        <article v-html="renderedContent"></article>
        <footer>
          <small>作成：{{ new Date(store.currentRunbook.createdAt).toLocaleString("ja-JP") }}
            <br />
            最終更新：{{ new Date(store.currentRunbook.updatedAt).toLocaleString("ja-JP") }}
          </small>
        </footer>
      </div>
    </template>
  </main>
</template>

<style scoped></style>