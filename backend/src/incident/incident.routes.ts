import { Hono } from "hono";
import { successResponse, errorResponse } from "../lib/api-response";
import { listAll, findById, listMessages } from "./incident.repository";

export const incidentRoutes = new Hono()

incidentRoutes.get("/", async (c) => {
  try {
    const status = c.req.query("status") as "active" | "closed" | undefined
    const incidents = await listAll(status)
    return successResponse(c, incidents)
  } catch (error) {
    console.error("Error retrieving incident", error)
    return errorResponse(c, "Failed to retrieve incident", 500)
  }
})

incidentRoutes.get("/:id", async (c) => {
  try {
    const id = c.req.param("id")
    const incident = await findById(id)
    if (!incident) {
      return errorResponse(c, "Incident not found", 404)
    }
    return successResponse(c, incident)
  } catch (error) {
    console.error("Error retrieving incident", error)
    return errorResponse(c, "Failed to retrieve incident", 500)
  }
})

incidentRoutes.get("/:id/messages", async (c) => {
  try {
    const id = c.req.param("id")
    const messages = await listMessages(id)
    return successResponse(c, messages)
  } catch (error) {
    console.error("Error retrievint messages", error)
    return errorResponse(c, "Failed to retrieve messages", 500)
  }
})