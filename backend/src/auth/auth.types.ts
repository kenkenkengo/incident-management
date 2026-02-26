export interface AuthTokens {
	readonly accessToken: string;
	readonly idToken: string;
	readonly refreshToken: string;
	readonly expiresIn: number;
	readonly tokenType: string;
}

export interface SignInRequest {
	readonly email: string;
	readonly password: string;
}

export interface RefreshTokenRequest {
	readonly refreshToken: string;
}

export interface CognitoJwtPayload {
	readonly sub: string;
	readonly email: string;
	readonly email_verified: boolean;
	readonly token_use: "access" | "id";
	readonly iss: string;
	readonly exp: number;
	readonly iat: number;
}
