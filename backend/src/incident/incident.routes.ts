import { Hono } from "hono";
import { errorResponse, successResponse } from "../lib/api-response";
import {
	findById,
	getPostmortem,
	listAll,
	listMessages,
	savePostmortem,
} from "./incident.repository";
import { generatePostmortem, MODEL_ID } from "./postmortem.service";

export const incidentRoutes = new Hono();

incidentRoutes.get("/", async (c) => {
	try {
		const status = c.req.query("status") as "active" | "closed" | undefined;
		const incidents = await listAll(status);
		return successResponse(c, incidents);
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
		const messages = await listMessages(id);
		return successResponse(c, messages);
	} catch (error) {
		console.error("Error retrieving messages", error);
		return errorResponse(c, "Failed to retrieve messages", 500);
	}
});

incidentRoutes.post("/:id/postmortem", async (c) => {
	try {
		const id = c.req.param("id");
		const incident = await findById(id);
		if (!incident) {
			return errorResponse(c, "Incident not found", 404);
		}

		const messages = await listMessages(id);
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
