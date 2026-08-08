// アクティブなインシデントを一括クローズする管理スクリプト（一回限りの運用作業）。
// 使い方:
//   AWS_PROFILE=incident-prod node scripts/close-all-incidents.mjs
// 環境変数:
//   TABLE_NAME  対象 DynamoDB テーブル名（未指定なら本番のデフォルト）
//   AWS_REGION  リージョン（未指定なら ap-northeast-1）
//   RESOLUTION  クローズ時に記録する解決方法テキスト
//   DRY_RUN=1   件数の確認だけ行い、更新はしない
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
	DynamoDBDocumentClient,
	QueryCommand,
	UpdateCommand,
} from "@aws-sdk/lib-dynamodb";

const REGION = process.env.AWS_REGION || "ap-northeast-1";
const TABLE_NAME =
	process.env.TABLE_NAME ||
	"generosity-incident-management-production-AppTableTable-zbbvsnbo";
const RESOLUTION = process.env.RESOLUTION || "一括クローズ（管理操作）";
const DRY_RUN = process.env.DRY_RUN === "1";

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

const main = async () => {
	console.log(`Table: ${TABLE_NAME} (region: ${REGION})`);
	console.log(DRY_RUN ? "*** DRY RUN ***" : `Resolution: "${RESOLUTION}"`);

	let lastKey;
	let closed = 0;
	let found = 0;

	do {
		const q = await doc.send(
			new QueryCommand({
				TableName: TABLE_NAME,
				IndexName: "GSI1",
				KeyConditionExpression: "GSI1PK = :t",
				FilterExpression: "#s = :a",
				ExpressionAttributeNames: { "#s": "status" },
				ExpressionAttributeValues: { ":t": "INCIDENT", ":a": "active" },
				ExclusiveStartKey: lastKey,
			}),
		);

		const items = q.Items ?? [];
		found += items.length;

		for (const it of items) {
			if (DRY_RUN) {
				continue;
			}
			await doc.send(
				new UpdateCommand({
					TableName: TABLE_NAME,
					Key: { pk: `INCIDENT#${it.id}`, sk: "META" },
					UpdateExpression:
						"SET #s = :closed, endedAt = :endedAt, resolution = :resolution, GSI2SK = :closed, GSI3SK = :closed",
					ExpressionAttributeNames: { "#s": "status" },
					ExpressionAttributeValues: {
						":closed": "closed",
						":endedAt": new Date().toISOString(),
						":resolution": RESOLUTION,
					},
				}),
			);
			closed++;
			if (closed % 25 === 0) {
				console.log(`  closed ${closed} ...`);
			}
		}

		lastKey = q.LastEvaluatedKey;
	} while (lastKey);

	if (DRY_RUN) {
		console.log(`Found ${found} active incidents (no changes made).`);
	} else {
		console.log(`Done. Closed ${closed} active incidents.`);
	}
};

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
