import {
	CloudFrontClient,
	GetDistributionConfigCommand,
	UpdateDistributionCommand,
} from "@aws-sdk/client-cloudfront";
import {
	GetSecretValueCommand,
	PutSecretValueCommand,
	SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import { randomUUID } from "crypto";

const secretsClient = new SecretsManagerClient({});
const cfClient = new CloudFrontClient({});

export const handler = async () => {
	const secretId = process.env.ORIGIN_VERIFY_SECRET_ID!;
	const distributionId = process.env.CLOUDFRONT_DISTRIBUTION_ID!;

	// 1. 現在のトークンを取得
	const current = await secretsClient.send(
		new GetSecretValueCommand({ SecretId: secretId }),
	);
	const previousSecret = current.SecretString!;
	const currentTokens = JSON.parse(current.SecretString!);

	// 2. 新トークン生成、旧トークンを保持
	const newToken = randomUUID();
	await secretsClient.send(
		new PutSecretValueCommand({
			SecretId: secretId,
			SecretString: JSON.stringify({
				current: newToken,
				previous: currentTokens.current,
			}),
		}),
	);

	try {
		// 3. CloudFrontのカスタムヘッダーを更新
		const distConfig = await cfClient.send(
			new GetDistributionConfigCommand({ Id: distributionId }),
		);
		const config = distConfig.DistributionConfig!;
		const etag = distConfig.ETag!;

		// apiOriginのx-origin-verifyヘッダーを更新
		const apiOrigin = config.Origins?.Items?.find((o) => o.Id === "apiOrigin");
		if (apiOrigin?.CustomHeaders?.Items) {
			const header = apiOrigin.CustomHeaders.Items.find(
				(h) => h.HeaderName === "x-origin-verify",
			);
			if (header) {
				header.HeaderValue = newToken;
			}
		}

		await cfClient.send(
			new UpdateDistributionCommand({
				Id: distributionId,
				DistributionConfig: config,
				IfMatch: etag,
			}),
		);
	} catch (error) {
		await secretsClient.send(
			new PutSecretValueCommand({
				SecretId: secretId,
				SecretString: previousSecret, // ロールバック
			}),
		);
		throw new Error(
			`CloudFront update failed, secret rolled back: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
};
