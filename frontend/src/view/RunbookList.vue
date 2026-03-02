<script setup lang="ts">
import { useRunbookStore } from '@/stores/runbook';
import { useRouter } from 'vue-router';
import { onMounted, ref } from 'vue';

const store = useRunbookStore();
const router = useRouter();
const tagFilter = ref('');

onMounted(() => {
  store.fetchAll();
});

const applyFilter = () => {
  store.fetchAll(tagFilter.value.trim() || undefined);
};

const goToDetail = (id: string) => {
  router.push({ name: 'runbook-detail', params: { id } });
};

const goToNew = () => {
  router.push({ name: 'runbook-new' });
};
</script>

<template>
  <main>
    <div>
      <h1>Runbooks</h1>
      <button @click="goToNew">新規作成</button>
    </div>

    <div>
      <input v-model="tagFilter" placeholder="タグで絞り込み" @keyup.enter="applyFilter" />
      <button @click="applyFilter">検索</button>
    </div>

    <p v-if="store.isLoading">読み込み中...</p>
    <p v-else-if="store.error">{{ store.error }}</p>
    <p v-else-if="store.runbooks.length === 0">Runbookが見つかりませんでした。</p>
    <ul v-else>
      <li v-for="runbook in store.runbooks" :key="runbook.id" @click="goToDetail(runbook.id)" style="cursor: pointer;">
        <strong>{{ runbook.title }}</strong>
        <span v-if="runbook.tags.length"> - {{ runbook.tags.join(', ') }}</span>
        <br />
        <small>最終更新: {{ new Date(runbook.updatedAt).toLocaleString() }}</small>
      </li>
    </ul>
  </main>
</template>

<style scoped></style>