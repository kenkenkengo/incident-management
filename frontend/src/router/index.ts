import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import Dashboard from "@/view/Dashboard.vue";
import RunbookDetail from "@/view/RunbookDetail.vue";
import RunbookForm from "@/view/RunbookForm.vue";
import RunbookList from "@/view/RunbookList.vue";
import SignIn from "@/view/SignIn.vue";

const router = createRouter({
	history: createWebHistory(import.meta.env.BASE_URL),
	routes: [
		{
			path: "/",
			name: "signin",
			component: SignIn,
		},
		{
			path: "/dashboard",
			name: "dashboard",
			component: Dashboard,
		},
		{
			path: "/runbooks",
			name: "runbook-list",
			component: RunbookList,
		},
		{
			path: "/runbooks/:id",
			name: "runbook-detail",
			component: RunbookDetail,
		},
		{
			path: "/runbooks/:id/edit",
			name: "runbook-edit",
			component: RunbookForm,
		},
		{
			path: "/runbooks/new",
			name: "runbook-new",
			component: RunbookForm,
		},
	],
});

router.beforeEach((to, from, next) => {
	const authStore = useAuthStore();
	authStore.loadFromStorage();
	const isAuthenticated = authStore.isAuthenticated;

	if (isAuthenticated && to.name === "signin") {
		next({ name: "dashboard" });
	}

	if (to.name !== "signin" && !isAuthenticated) {
		next({ name: "signin" });
	} else {
		next();
	}
});

export default router;
