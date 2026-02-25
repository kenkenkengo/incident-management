import SignIn from "@/view/SignIn.vue";
import { createRouter, createWebHistory } from "vue-router";

const router = createRouter({
	history: createWebHistory(import.meta.env.BASE_URL),
	routes: [
		{
			path: "/",
			name: "signin",
			component: SignIn
		}
	],
});

export default router;
