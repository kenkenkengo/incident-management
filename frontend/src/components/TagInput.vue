<script setup lang="ts">
import { computed, ref } from "vue";

defineOptions({ inheritAttrs: false });

const props = withDefaults(
	defineProps<{
		modelValue: string;
		suggestions: string[];
		placeholder?: string;
		id?: string;
	}>(),
	{ placeholder: "" },
);

const emit = defineEmits<{
	"update:modelValue": [value: string];
}>();

const showDropdown = ref(false);
const activeIndex = ref(-1);

const currentFragment = computed(() => {
	const parts = props.modelValue.split(",");
	return (parts[parts.length - 1] ?? "").trim();
});

const alreadySelected = computed(() =>
	props.modelValue
		.split(",")
		.slice(0, -1)
		.map((t) => t.trim())
		.filter(Boolean),
);

const filteredSuggestions = computed(() => {
	const fragment = currentFragment.value;
	if (!fragment) return [];
	return props.suggestions.filter(
		(tag) =>
			tag.toLowerCase().includes(fragment.toLowerCase()) &&
			!alreadySelected.value.includes(tag),
	);
});

const selectSuggestion = (tag: string) => {
	const parts = props.modelValue.split(",");
	const prefix = parts.slice(0, -1);
	const newValue =
		prefix.length > 0 ? `${prefix.join(",")}, ${tag}, ` : `${tag}, `;
	emit("update:modelValue", newValue);
	showDropdown.value = false;
	activeIndex.value = -1;
};

const onInput = (e: Event) => {
	emit("update:modelValue", (e.target as HTMLInputElement).value);
	showDropdown.value = true;
	activeIndex.value = -1;
};

const onFocus = () => {
	showDropdown.value = true;
};

const onBlur = () => {
	setTimeout(() => {
		showDropdown.value = false;
		activeIndex.value = -1;
	}, 150);
};

const onKeydown = (e: KeyboardEvent) => {
	if (!showDropdown.value || filteredSuggestions.value.length === 0) return;
	if (e.key === "ArrowDown") {
		e.preventDefault();
		activeIndex.value = Math.min(
			activeIndex.value + 1,
			filteredSuggestions.value.length - 1,
		);
	} else if (e.key === "ArrowUp") {
		e.preventDefault();
		activeIndex.value = Math.max(activeIndex.value - 1, 0);
	} else if (e.key === "Enter" && activeIndex.value >= 0) {
		const selected = filteredSuggestions.value[activeIndex.value];
		if (selected) {
			e.preventDefault();
			selectSuggestion(selected);
		}
	} else if (e.key === "Escape") {
		showDropdown.value = false;
		activeIndex.value = -1;
	}
};
</script>

<template>
  <div class="tag-input-wrapper">
    <input
      v-bind="$attrs"
      :id="id"
      :value="modelValue"
      :placeholder="placeholder"
      type="text"
      autocomplete="off"
      @input="onInput"
      @focus="onFocus"
      @blur="onBlur"
      @keydown="onKeydown"
    />
    <ul
      v-if="showDropdown && filteredSuggestions.length > 0"
      class="suggestions-dropdown"
      role="listbox"
    >
      <li
        v-for="(tag, index) in filteredSuggestions"
        :key="tag"
        :class="{ active: index === activeIndex }"
        role="option"
        @mousedown.prevent="selectSuggestion(tag)"
      >
        {{ tag }}
      </li>
    </ul>
  </div>
</template>

<style scoped>
.tag-input-wrapper {
  position: relative;
}

.suggestions-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 100;
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-top: none;
  border-radius: 0 0 4px 4px;
  list-style: none;
  margin: 0;
  padding: 4px 0;
  max-height: 200px;
  overflow-y: auto;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.suggestions-dropdown li {
  padding: 7px 12px;
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  color: var(--text-primary);
  transition: background var(--transition-fast), color var(--transition-fast);
}

.suggestions-dropdown li:hover,
.suggestions-dropdown li.active {
  background: var(--bg-hover);
  color: var(--accent);
}
</style>
