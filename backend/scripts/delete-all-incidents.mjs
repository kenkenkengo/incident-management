// 全インシデントレコードを完全削除する管理スクリプト（一回限りの運用作業・不可逆）。
// 単一テーブル設計のため、各インシデント (pk = "INCIDENT#<id>") に紐づく
// META / MSG# / POSTMORTEM / STATUS# / REMINDER# の全アイテムを削除する。
// ランブック等 INCIDENT# 以外のデータには一切触れない。
//
// 使い方:
//   AWS_PROFILE=incident-prod DRY_RUN=1 node scripts/delete-all-incidents.mjs  # 件数確認のみ
//   AWS_PROFILE=incident-prod node scripts/delete-all-incidents.mjs            # 実削除
// 環境変数:
//   TABLE_NAME  対象 DynamoDB テーブル名（未指定なら本番のデフォルト）
//   AWS_REGION  リージョン（未指定なら ap-northeast-1）
//   DRY_RUN=1   削除せず件数のみ表示
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
	BatchWriteCommand,
	DynamoDBDocumentClient,
	QueryCommand,
} from "@aws-sdk/lib-dynamodb";

const REGION = process.env.AWS_REGION || "ap-northeast-1";
const TABLE_NAME =
	process.env.TABLE_NAME ||
	"generosity-incident-management-production-AppTableTable-zbbvsnbo";
const DRY_RUN = process.env.DRY_RUN === "1";

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

// GSI1 (GSI1PK = "INCIDENT") から全インシデントの id を列挙する。
const listIncidentIds = async () => {
	const ids = [];
	let lastKey;
	do {
		const q = await doc.send(
			new QueryCommand({
				TableName: TABLE_NAME,
				IndexName: "GSI1",
				KeyConditionExpression: "GSI1PK = :t",
				ExpressionAttributeValues: { ":t": "INCIDENT" },
				ProjectionExpression: "id",
				ExclusiveStartKey: lastKey,
			}),
		);
		for (const it of q.Items ?? []) {
			if (it.id) ids.push(it.id);
		}
		lastKey = q.LastEvaluatedKey;
	} while (lastKey);
	return ids;
};

// pk = "INCIDENT#<id>" 配下の全アイテムのキーを取得する。
const listItemKeys = async (id) => {
	const keys = [];
	let lastKey;
	do {
		const q = await doc.send(
			new QueryCommand({
				TableName: TABLE_NAME,
				KeyConditionExpression: "pk = :pk",
				ExpressionAttributeValues: { ":pk": `INCIDENT#${id}` },
				ProjectionExpression: "pk, sk",
				ExclusiveStartKey: lastKey,
			}),
		);
		for (const it of q.Items ?? []) {
			keys.push({ pk: it.pk, sk: it.sk });
		}
		lastKey = q.LastEvaluatedKey;
	} while (lastKey);
	return keys;
};

const batchDelete = async (keys) => {
	for (let i = 0; i < keys.length; i += 25) {
		let requests = keys
			.slice(i, i + 25)
			.map((Key) => ({ DeleteRequest: { Key } }));
		// UnprocessedItems をリトライ
		let attempt = 0;
		while (requests.length > 0) {
			const res = await doc.send(
				new BatchWriteCommand({ RequestItems: { [TABLE_NAME]: requests } }),
			);
			const un = res.UnprocessedItems?.[TABLE_NAME] ?? [];
			requests = un;
			if (requests.length > 0 && ++attempt <= 5) {
				await new Promise((r) => setTimeout(r, 200 * attempt));
			} else if (requests.length > 0) {
				throw new Error(
					`UnprocessedItems remain after retries: ${requests.length}`,
				);
			}
		}
	}
};

const main = async () => {
	console.log(`Table: ${TABLE_NAME} (region: ${REGION})`);
	console.log(DRY_RUN ? "*** DRY RUN ***" : "*** DELETING ***");

	const ids = await listIncidentIds();
	console.log(`Incidents found: ${ids.length}`);

	let totalItems = 0;
	let deletedIncidents = 0;

	for (const id of ids) {
		const keys = await listItemKeys(id);
		totalItems += keys.length;
		if (!DRY_RUN) {
			await batchDelete(keys);
			deletedIncidents++;
			if (deletedIncidents % 25 === 0) {
				console.log(
					`  deleted ${deletedIncidents}/${ids.length} incidents ...`,
				);
			}
		}
	}

	if (DRY_RUN) {
		console.log(
			`Would delete ${ids.length} incidents / ${totalItems} items (no changes made).`,
		);
	} else {
		console.log(
			`Done. Deleted ${deletedIncidents} incidents / ${totalItems} items.`,
		);
	}
};

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
