// リーダー自動招待のモードを切り替える管理スクリプト。
// DynamoDB の設定アイテム(pk=CONFIG, sk=INVITE)を更新する。デプロイ不要で即反映。
//
// 使い方:
//   AWS_PROFILE=incident-prod node scripts/set-invite-mode.mjs on        # リーダー自動招待 有効化
//   AWS_PROFILE=incident-prod node scripts/set-invite-mode.mjs off       # 無効化（テスト時=起票者のみ）
//   AWS_PROFILE=incident-prod node scripts/set-invite-mode.mjs status    # 現在の設定を表示
//   AWS_PROFILE=incident-prod node scripts/set-invite-mode.mjs on U111,U222  # 招待メンバーを上書き
// 環境変数: TABLE_NAME（未指定なら本番のデフォルト）, AWS_REGION（既定 ap-northeast-1）
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
	DynamoDBDocumentClient,
	GetCommand,
	PutCommand,
} from "@aws-sdk/lib-dynamodb";

const REGION = process.env.AWS_REGION || "ap-northeast-1";
const TABLE_NAME =
	process.env.TABLE_NAME ||
	"generosity-incident-management-production-AppTableTable-zbbvsnbo";
const KEY = { pk: "CONFIG", sk: "INVITE" };

// 既定リーダー陣（Kouta Kawaguchi 除外）
const DEFAULT_LEADERS = [
	"URX8H5H26",
	"U01J1HU9HP1",
	"U034NN6KQLW",
	"U3VMFHU2W",
	"UH0NG5UTS",
];

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

const main = async () => {
	const mode = process.argv[2];
	const leadersArg = process.argv[3];

	if (mode === "status") {
		const res = await doc.send(
			new GetCommand({ TableName: TABLE_NAME, Key: KEY }),
		);
		console.log(
			"current invite config:",
			res.Item ?? "(未設定 = enabled:false)",
		);
		return;
	}

	if (mode !== "on" && mode !== "off") {
		console.log(
			"usage: node scripts/set-invite-mode.mjs on|off|status [comma-separated userIds]",
		);
		process.exit(1);
	}

	const enabled = mode === "on";
	const leaders = leadersArg ? leadersArg.split(",") : DEFAULT_LEADERS;
	await doc.send(
		new PutCommand({
			TableName: TABLE_NAME,
			Item: { ...KEY, enabled, leaders },
		}),
	);
	console.log(
		`リーダー自動招待を更新しました: enabled=${enabled}` +
			(enabled ? ` leaders=[${leaders.join(", ")}]` : ""),
	);
};

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
