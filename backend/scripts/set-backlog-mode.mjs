// Backlog 起票のモードを切り替える管理スクリプト（P1-3 モード切替）。
// DynamoDB の設定アイテム(pk=CONFIG, sk=BACKLOG)を更新する。デプロイ不要で即反映。
//
// 使い方:
//   AWS_PROFILE=incident-prod node scripts/set-backlog-mode.mjs on        # TR へ起票を有効化
//   AWS_PROFILE=incident-prod node scripts/set-backlog-mode.mjs on WEBG_OTHERS  # 起票先を変更（テスト用等）
//   AWS_PROFILE=incident-prod node scripts/set-backlog-mode.mjs off       # 起票を無効化（テスト時）
//   AWS_PROFILE=incident-prod node scripts/set-backlog-mode.mjs status    # 現在の設定を表示
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
const KEY = { pk: "CONFIG", sk: "BACKLOG" };

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

const usage = () => {
	console.log(
		"usage: node scripts/set-backlog-mode.mjs on|off|status [projectKey]",
	);
	process.exit(1);
};

const main = async () => {
	const mode = process.argv[2];
	const projectKey = process.argv[3] || "TR";

	if (mode === "status") {
		const res = await doc.send(
			new GetCommand({ TableName: TABLE_NAME, Key: KEY }),
		);
		console.log(
			"current backlog config:",
			res.Item ?? "(未設定 = enabled:false)",
		);
		return;
	}

	if (mode !== "on" && mode !== "off") {
		usage();
	}

	const enabled = mode === "on";
	await doc.send(
		new PutCommand({
			TableName: TABLE_NAME,
			Item: { ...KEY, enabled, projectKey },
		}),
	);
	console.log(
		`Backlog 起票モードを更新しました: enabled=${enabled}` +
			(enabled ? ` projectKey=${projectKey}` : ""),
	);
};

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
