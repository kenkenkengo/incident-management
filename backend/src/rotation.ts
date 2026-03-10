import {
  SecretsManagerClient,
  GetSecretValueCommand,
  PutSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import {
  CloudFrontClient,
  GetDistributionConfigCommand,
  UpdateDistributionCommand,
  CreateInvalidationCommand,
} from "@aws-sdk/client-cloudfront";
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

  // 3. CloudFrontのカスタムヘッダーを更新
  const distConfig = await cfClient.send(
    new GetDistributionConfigCommand({ Id: distributionId }),
  );
  const config = distConfig.DistributionConfig!;
  const etag = distConfig.ETag!;

  // apiOriginのx-origin-verifyヘッダーを更新
  const apiOrigin = config.Origins?.Items?.find(
    (o) => o.Id === "apiOrigin",
  );
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

  // 4. キャッシュ無効化
  await cfClient.send(
    new CreateInvalidationCommand({
      DistributionId: distributionId,
      InvalidationBatch: {
        CallerReference: `rotation-${Date.now()}`,
        Paths: {
          Quantity: 1,
          Items: ["/api/*"],
        },
      },
    }),
  );

  console.log("Token rotation completed successfully");
};