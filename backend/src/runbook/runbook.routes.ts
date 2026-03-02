import { Hono } from "hono";
import { errorResponse, successResponse } from "../lib/api-response";
import { create, findById, listAll, update, remove, getAllTags } from "./runbook.repository";
import { createRunbookSchema, updateRunbookSchema } from "./runbook.validators";

const getCallerSub = (c: { env: unknown }): string => {
  const event = c.env as {
    requestContext: {
      authorizer: {
        jwt: {
          claims: Record<string, string>
        }
      }
    }
  };
  return event.requestContext.authorizer.jwt.claims.sub;
}

export const runbookRoutes = new Hono()

runbookRoutes.get("/", async (c) => {
  try {
    const tagParam = c.req.query("tag");
    const tags = tagParam
      ? tagParam.split(",").map((t) => t.trim()).filter(Boolean)
      : undefined;
    const runbooks = await listAll(tags);
    return successResponse(c, runbooks);
  } catch (error) {
    console.error("Error listing runbooks", error);
    return errorResponse(c, "Failed to list runbooks", 500);
  }
})

runbookRoutes.post("/", async (c) => {
  try {
    const body = await c.req.json();
    const validated = createRunbookSchema.parse(body);
    const sub = getCallerSub(c);
    const runbook = await create(validated, sub);
    return successResponse(c, runbook, 201);
  } catch (error) {
    console.error("Error creating runbook", error);
    return errorResponse(c, "Failed to create runbook", 500);
  }
})

runbookRoutes.get("/tags", async (c) => {
  try {
    const tags = await getAllTags();
    return successResponse(c, tags);
  } catch (error) {
    console.error("Error retrieving tags", error);
    return errorResponse(c, "Failed to retrieve tags", 500);
  }
})

runbookRoutes.get("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const runbook = await findById(id)
    if (!runbook) {
      return errorResponse(c, "Runbook not found", 404);
    }
    return successResponse(c, runbook);
  } catch (error) {
    console.error("Error retrieving runbook", error);
    return errorResponse(c, "Failed to retrieve runbook", 500);
  }
})

runbookRoutes.put("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json();
    const validated = updateRunbookSchema.parse(body);
    const sub = getCallerSub(c);
    const runbook = await update(id, validated, sub);
    if (!runbook) {
      return errorResponse(c, "Runbook not found", 404);
    }
    return successResponse(c, runbook);
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      return errorResponse(c, "Invalid input", 422);
    }
    console.error("Error updating runbook", error);
    return errorResponse(c, "Failed to update runbook", 500);
  }
})

runbookRoutes.delete("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    await remove(id);
    return c.body(null, 204);
  } catch (error) {
    console.error("Error deleting runbook", error);
    return errorResponse(c, "Failed to delete runbook", 500);
  }
})