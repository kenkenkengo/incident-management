import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import Dashboard from "@/view/Dashboard.vue";
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
			component: () => import("@/view/Dashboard.vue"),
		},
	],
});

router.beforeEach((to, from, next) => {
	const authStore = useAuthStore();
	authStore.loadFromStorage();
	const isAuthenticated = authStore.isAuthenticated;

	if (to.name !== "signin" && !isAuthenticated) {
		next({ name: "signin" });
	} else {
		next();
	}
});

export default router;
