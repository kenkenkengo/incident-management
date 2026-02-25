import { InitiateAuthCommand } from "@aws-sdk/client-cognito-identity-provider";
import { getCognitoClient } from "../lib/cognito.client";
import { AuthTokens, RefreshTokenRequest, SignInRequest } from "./auth.types";
import { Resource } from "sst";

export const signIn = async (request: SignInRequest): Promise<AuthTokens> => {
  const client = getCognitoClient()

  const command = new InitiateAuthCommand({
    AuthFlow: "USER_PASSWORD_AUTH",
    ClientId: Resource.Web.id,
    AuthParameters: {
      USERNAME: request.email,
      PASSWORD: request.password,
    },
  })

  const response = await client.send(command)
  const result = response.AuthenticationResult
  if (!result) {
    throw new Error("Authentication failed")
  }

  return {
    accessToken: result.AccessToken ?? "",
    idToken: result.IdToken ?? "",
    refreshToken: result.RefreshToken ?? "",
    expiresIn: result.ExpiresIn ?? 3600,
    tokenType: result.TokenType ?? "Bearer",
  }
}

export const refreshTokens = async (request: RefreshTokenRequest): Promise<AuthTokens> => {
  const client = getCognitoClient()

  const command = new InitiateAuthCommand({
    AuthFlow: "REFRESH_TOKEN_AUTH",
    ClientId: Resource.Web.id,
    AuthParameters: {
      REFRESH_TOKEN: request.refreshToken,
    },
  })

  const response = await client.send(command)
  const result = response.AuthenticationResult
  if (!result) {
    throw new Error("Token Refresh failed")
  }

  return {
    accessToken: result.AccessToken ?? "",
    idToken: result.IdToken ?? "",
    refreshToken: request.refreshToken,
    expiresIn: result.ExpiresIn ?? 3600,
    tokenType: result.TokenType ?? "Bearer",
  }
}
