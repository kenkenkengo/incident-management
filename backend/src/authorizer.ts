import {
	GetSecretValueCommand,
	SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import type { APIGatewayRequestSimpleAuthorizerHandlerV2 } from "aws-lambda";

const secretsClient = new SecretsManagerClient({});

// Lambda実行環境のウォームスタート間で再利用される
let cachedTokens: { current: string; previous: string } | null = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5分

async function getTokens(secretId: string) {
	if (cachedTokens && Date.now() < cacheExpiry) {
		return cachedTokens;
	}
	const result = await secretsClient.send(
		new GetSecretValueCommand({ SecretId: secretId }),
	);
	cachedTokens = JSON.parse(result.SecretString!);
	cacheExpiry = Date.now() + CACHE_TTL_MS;
	return cachedTokens!;
}

export const handler: APIGatewayRequestSimpleAuthorizerHandlerV2 = async (
	event,
) => {
	const token = event.headers?.["x-origin-verify"];

	// 1. 現在のトークンを取得
	const secretId = process.env.ORIGIN_VERIFY_SECRET_ID!;
	const currentTokens = await getTokens(secretId);

	// トークンは現在のものか、前回のもののどちらかを許可する
	if (
		token &&
		(token === currentTokens.current || token === currentTokens.previous)
	) {
		return { isAuthorized: true };
	}
	return { isAuthorized: false };
};
