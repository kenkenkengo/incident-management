import { z } from "zod";

export const signInSchema = z.object({
  email: z.email('Invalid email address'),
  password: z.string().min(8, "Password must be at least 8 characters long"),
})

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
})