import { Hono } from "hono";
import { handle } from "hono/aws-lambda";
import { cors } from "hono/cors";
import { Resource } from "sst";
import { authRoutes } from "./auth/auth.routes";
import { errorHandler } from "./middleware/error-handler.middleware";
import { run } from "node:test";
import { runbookRoutes } from "./runbook/runbook.routes";

const app = new Hono();

const allowedOrigin = Resource.Site.url.replace(/\/$/, "");
app.use(
	"*",
	cors({
		origin: [allowedOrigin],
		allowMethods: ["GET", "HEAD", "PUT", "POST", "DELETE", "PATCH"],
		allowHeaders: ["Content-Type", "Authorization"],
		maxAge: 86400,
	}),
)

app.onError(errorHandler);

app.get("/", (c) => {
	return c.json({
		success: true,
		data: {
			message: "Welcome to the Generosity Incident Management API",
		},
	});
});

app.route("/auth", authRoutes);
app.route("/api/runbooks", runbookRoutes);

app.get("/api/me", (c) => {
	const event = c.env as {
		requestContext: { authorizer: { jwt: { claims: Record<string, any> } } };
	};
	const claims = event.requestContext.authorizer.jwt.claims;
	return c.json({
		success: true,
		data: { sub: claims.sub, email: claims.email },
	});
});

export const handler = handle(app);
