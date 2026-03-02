<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useRunbookStore } from "@/stores/runbook";

const store = useRunbookStore();
const router = useRouter();
const tagsInput = ref("");

onMounted(() => store.fetchAll());

const applyFilter = () => {
  const tags = tagsInput.value
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  store.fetchAll(tags.length > 0 ? tags : undefined);
};

const goToDetail = (id: string) => {
  router.push({ name: "runbook-detail", params: { id } });
};

const goToNew = () => {
  router.push({ name: "runbook-new" });
};
</script>

<template>
  <main>
    <div>
      <h1>Runbooks</h1>
      <button @click="goToNew">新規作成</button>
    </div>

    <div>
      <input v-model="tagsInput" placeholder="タグで絞り込み（カンマ区切りでAND検索）例: DB, Network" @keyup.enter="applyFilter" />
      <button @click="applyFilter">検索</button>
    </div>

    <p v-if="store.isLoading">読み込み中...</p>
    <p v-else-if="store.error">{{ store.error }}</p>
    <p v-else-if="store.runbooks.length === 0">Runbookがありません</p>

    <ul v-else>
      <li v-for="runbook in store.runbooks" :key="runbook.id" @click="goToDetail(runbook.id)" style="cursor: pointer">
        <strong>{{ runbook.title }}</strong>
        <span v-if="runbook.tags.length > 0">
          　{{ runbook.tags.join(", ") }}
        </span>
        <br />
        <small>更新: {{ new Date(runbook.updatedAt).toLocaleString("ja-JP") }}</small>
      </li>
    </ul>
  </main>
</template>
