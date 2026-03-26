import { Hono } from "hono";
import {
	errorResponse,
	paginatedResponse,
	successResponse,
} from "../lib/api-response";
import { parsePaginationParams } from "../lib/pagination";
import {
	findById,
	getPostmortem,
	listAll,
	listAllMessages,
	listMessages,
	listStatusUpdates,
	savePostmortem,
} from "./incident.repository";
import {
	generatePostmortem,
	generateRunbookDraft,
	MODEL_ID,
} from "./postmortem.service";

export const incidentRoutes = new Hono();

incidentRoutes.get("/", async (c) => {
	try {
		const status = c.req.query("status") as "active" | "closed" | undefined;
		const pagination = parsePaginationParams(c);
		const result = await listAll(pagination, status);
		return paginatedResponse(c, result, pagination.limit);
	} catch (error) {
		console.error("Error retrieving incident", error);
		return errorResponse(c, "Failed to retrieve incident", 500);
	}
});

incidentRoutes.get("/:id", async (c) => {
	try {
		const id = c.req.param("id");
		const incident = await findById(id);
		if (!incident) {
			return errorResponse(c, "Incident not found", 404);
		}
		return successResponse(c, incident);
	} catch (error) {
		console.error("Error retrieving incident", error);
		return errorResponse(c, "Failed to retrieve incident", 500);
	}
});

incidentRoutes.get("/:id/messages", async (c) => {
	try {
		const id = c.req.param("id");
		const pagination = parsePaginationParams(c);
		const result = await listMessages(id, pagination);
		return paginatedResponse(c, result, pagination.limit);
	} catch (error) {
		console.error("Error retrieving messages", error);
		return errorResponse(c, "Failed to retrieve messages", 500);
	}
});

incidentRoutes.get("/:id/status-updates", async (c) => {
	try {
		const id = c.req.param("id");
		const incident = await findById(id);
		if (!incident) {
			return errorResponse(c, "Incident not found", 404);
		}
		const statusUpdates = await listStatusUpdates(id);
		return successResponse(c, statusUpdates);
	} catch (error) {
		console.error("Error retrieving status updates", error);
		return errorResponse(c, "Failed to retrieve status updates", 500);
	}
});

incidentRoutes.post("/:id/postmortem", async (c) => {
	try {
		const id = c.req.param("id");
		const incident = await findById(id);
		if (!incident) {
			return errorResponse(c, "Incident not found", 404);
		}

		const messages = await listAllMessages(id);
		if (messages.length === 0) {
			return errorResponse(c, "No messages to analyze", 400);
		}

		const content = await generatePostmortem(incident, messages);
		const postmortem = await savePostmortem(id, content, MODEL_ID);
		return successResponse(c, postmortem, 201);
	} catch (error) {
		console.error("Error generating postmortem", error);
		return errorResponse(c, "Failed to generate postmortem", 500);
	}
});

incidentRoutes.post("/:id/generate-runbook", async (c) => {
	try {
		const id = c.req.param("id");
		const incident = await findById(id);
		if (!incident) {
			return errorResponse(c, "Incident not found", 404);
		}

		const postmortem = await getPostmortem(id);
		if (!postmortem) {
			return errorResponse(
				c,
				"Postmortem not found. Generate a postmortem first.",
				400,
			);
		}

		const draft = await generateRunbookDraft(
			postmortem.content,
			incident.title,
		);
		return successResponse(c, draft);
	} catch (error) {
		console.error("Error generating runbook draft", error);
		const message =
			error instanceof Error
				? error.message
				: "Failed to generate runbook draft";
		return errorResponse(c, message, 500);
	}
});

incidentRoutes.get("/:id/postmortem", async (c) => {
	try {
		const id = c.req.param("id");
		const postmortem = await getPostmortem(id);
		if (!postmortem) {
			return errorResponse(c, "Postmortem not found", 404);
		}
		return successResponse(c, postmortem);
	} catch (error) {
		console.error("Error retrieving postmortem", error);
		return errorResponse(c, "Failed to retrieve postmortem", 500);
	}
});
