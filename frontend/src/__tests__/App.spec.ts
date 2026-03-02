import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { createPinia } from "pinia";
import { createRouter, createWebHistory } from "vue-router";
import App from "../App.vue";

describe("App", () => {
	it("マウントできる", () => {
		const pinia = createPinia();
		const router = createRouter({
			history: createWebHistory(),
			routes: [{ path: "/", component: { template: "<div />" } }],
		});
		const wrapper = mount(App, {
			global: { plugins: [pinia, router] },
		});
		expect(wrapper.exists()).toBe(true);
	});
});
