import { LimitExceededException, NotAuthorizedException, UserNotConfirmedException, UserNotFoundException } from "@aws-sdk/client-cognito-identity-provider"
import { Hono } from "hono"
import { auth } from "hono/utils/basic-auth"
import { refreshTokenSchema, signInSchema } from "./auth.validators"
import { refreshTokens, signIn } from "./auth.service"
import { success } from "zod"
import { errorResponse, successResponse } from "../lib/api-response"

const formatCognitoError = (error: unknown): string => {
  if (error instanceof Error) {
    const cognitoErrors: Record<string, string> = {
      UserNotFoundException: "No account found with this email",
      NotAuthorizedException: "Incorrect email or password",
      UserNotConfirmedException: "Account not confirmed. Please check your email for confirmation instructions.",
      LimitExceededException: "Too many attempts. Please try again later.",
    }
    return cognitoErrors[error.name] || "An unexpected error occurred. Please try again."
  }
  return "An unknown error occurred. Please try again."
}

export const authRoutes = new Hono()

authRoutes.post('/signin', async (c) => {
  try {
    const body = await c.req.json()
    const validated = signInSchema.parse(body)
    const tokens = await signIn(validated)
    return successResponse(c, tokens)
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') {
      return errorResponse(c, 'Invalid input', 422)
    }
    return errorResponse(c, formatCognitoError(error), 401)
  }
})

authRoutes.post('/refresh', async (c) => {
  try {
    const body = await c.req.json()
    const validated = refreshTokenSchema.parse(body)
    const tokens = await refreshTokens(validated)
    return successResponse(c, tokens)
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') {
      return errorResponse(c, 'Invalid input', 422)
    }
    return errorResponse(c, formatCognitoError(error), 401)
  }
})