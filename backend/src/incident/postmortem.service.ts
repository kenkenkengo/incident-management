import {
	BedrockRuntimeClient,
	InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import type { Incident, IncidentMessage, StatusUpdate } from "./incident.types";

const client = new BedrockRuntimeClient({});
export const MODEL_ID = "openai.gpt-oss-safeguard-120b";

const STATUS_LABELS: Record<StatusUpdate["status"], string> = {
	investigating: "調査中",
	identified: "原因特定",
	responding: "対応中",
	recovering: "復旧確認中",
};

const computeDuration = (startedAt: string, endedAt?: string): string => {
	if (!endedAt) return "対応中";
	const diffMs = new Date(endedAt).getTime() - new Date(startedAt).getTime();
	const totalMinutes = Math.floor(diffMs / 60000);
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;
	if (hours === 0) return `${minutes}分`;
	return `${hours}時間${minutes}分`;
};

const formatStatusUpdates = (
	statusUpdates: readonly StatusUpdate[],
): string => {
	if (statusUpdates.length === 0) return "（なし）";
	return statusUpdates
		.map(
			(su) =>
				`[${su.updatedAt}] ${STATUS_LABELS[su.status]}${su.message ? ` - ${su.message}` : ""} (by ${su.updatedBy})`,
		)
		.join("\n");
};

const buildPrompt = (
	incident: Incident,
	messages: readonly IncidentMessage[],
	statusUpdates: readonly StatusUpdate[],
): string => {
	const messageLog = messages
		.map((m) => `[${m.recordedAt}] ${m.userName}: ${m.text}`)
		.join("\n");

	return `以下はインシデント「${incident.title}」の対応中に交わされたチャットログと構造化データです。
これをもとにポストモーテム（振り返り文書）をMarkdown形式で生成してください。

## インシデント情報
- 影響範囲: ${incident.impact ?? "未記載"}
- 解決策: ${incident.resolution ?? "未記載"}
- 発生期間: ${incident.startedAt} 〜 ${incident.endedAt ?? "対応中"}（${computeDuration(incident.startedAt, incident.endedAt)}）

## ステータス更新履歴
${formatStatusUpdates(statusUpdates)}

## 含めるべきセクション
- 概要（何が起きたか）
- タイムライン（時系列での主要イベント。「時刻」「イベント」「担当者」の3列のMarkdown表で記述し、各行に必ず時刻と担当者名を入れること。時刻と担当者名はチャットログとステータス更新履歴に記録されたものをそのまま使う）
- 根本原因（推定）
- 対応内容（何をしたか）
- 改善アクション（再発防止策の提案）

## チャットログ
${messageLog}`;
};

export interface RunbookDraft {
	readonly title: string;
	readonly content: string;
	readonly tags: readonly string[];
}

const buildRunbookPrompt = (
	postmortemContent: string,
	incidentTitle: string,
): string => {
	return `以下はインシデント「${incidentTitle}」のポストモーテムです。
この内容をもとに、次回同じ障害が発生した場合の対応手順書（ランブック）を生成してください。

## 出力フォーマット
以下の JSON 形式で出力してください。content は Markdown 形式です。JSONのみを出力し、それ以外のテキストは含めないでください。
{
  "title": "ランブックのタイトル",
  "content": "## 概要\\n...\\n## 手順\\n1. ...\\n2. ...\\n## 参考: 対応タイムライン\\n| 時刻 | 対応内容 | 担当 |\\n|---|---|---|\\n| ... | ... | ... |",
  "tags": ["障害カテゴリ", "関連サービス"]
}

## ランブックに含めるべきセクション
- 概要（どんな障害か、いつ発生しうるか）
- 検知方法（どうやって気づくか）
- 対応手順（ステップバイステップ）
- エスカレーション基準（いつ誰に連絡するか）
- 復旧確認（どうやって正常に戻ったことを確認するか）
- 参考: 対応タイムライン（今回の実際の対応の時系列。「時刻」「対応内容」「担当」の3列のMarkdown表。ポストモーテムのタイムラインに記載された時刻と担当者名をそのまま転記すること）

## ポストモーテム
${postmortemContent}`;
};

const stripReasoning = (text: string): string => {
	return text.replace(/<reasoning>[\s\S]*?<\/reasoning>/g, "").trim();
};

const parseJsonResponse = (text: string): RunbookDraft => {
	const cleaned = stripReasoning(text);

	try {
		return JSON.parse(cleaned);
	} catch {
		// コードブロック内の JSON を抽出
		const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
		if (codeBlockMatch?.[1]) {
			return JSON.parse(codeBlockMatch[1].trim());
		}
		// { から始まる JSON オブジェクトを抽出
		const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
		if (jsonMatch?.[0]) {
			return JSON.parse(jsonMatch[0]);
		}
		throw new Error("Failed to parse runbook draft from AI response");
	}
};

export const generateRunbookDraft = async (
	postmortemContent: string,
	incidentTitle: string,
): Promise<RunbookDraft> => {
	const requestBody = {
		messages: [
			{
				role: "system",
				content:
					"あなたは SRE チームのランブック作成を支援するアシスタントです。実用的で具体的な手順書を生成してください。出力は必ず指定された JSON 形式のみにしてください。",
			},
			{
				role: "user",
				content: buildRunbookPrompt(postmortemContent, incidentTitle),
			},
		],
		max_completion_tokens: 4096,
		temperature: 0.3,
	};

	const command = new InvokeModelCommand({
		modelId: MODEL_ID,
		body: JSON.stringify(requestBody),
		contentType: "application/json",
		accept: "application/json",
	});

	const response = await client.send(command);
	const rawResponse = new TextDecoder().decode(response.body);
	console.error("Bedrock runbook raw response:", rawResponse.slice(0, 500));
	const responseBody = JSON.parse(rawResponse);
	const rawContent = responseBody.choices?.[0]?.message?.content;
	if (!rawContent) {
		throw new Error(
			`Unexpected Bedrock response structure: ${rawResponse.slice(0, 300)}`,
		);
	}
	return parseJsonResponse(rawContent);
};

export const generatePostmortem = async (
	incident: Incident,
	messages: readonly IncidentMessage[],
	statusUpdates: readonly StatusUpdate[],
): Promise<string> => {
	const requestBody = {
		messages: [
			{
				role: "system",
				content:
					"あなたは SRE チームのポストモーテム作成を支援するアシスタントです。簡潔で実用的な文書を生成してください。",
			},
			{ role: "user", content: buildPrompt(incident, messages, statusUpdates) },
		],
		max_completion_tokens: 4096,
		temperature: 0.3,
	};

	const command = new InvokeModelCommand({
		modelId: MODEL_ID,
		body: JSON.stringify(requestBody),
		contentType: "application/json",
		accept: "application/json",
	});

	const response = await client.send(command);
	const responseBody = JSON.parse(new TextDecoder().decode(response.body));
	// モデルが付与する <reasoning>...</reasoning> の思考ログを除去して返す
	return stripReasoning(responseBody.choices[0].message.content);
};

// UTC ISO を JST に変換して表示するヘルパー（Backlog トラブル報告用）
const toJst = (iso: string): Date =>
	new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
const jstHm = (iso: string): string => {
	const d = toJst(iso);
	return `${String(d.getUTCHours()).padStart(2, "0")}:${String(
		d.getUTCMinutes(),
	).padStart(2, "0")}`;
};
const jstDateTime = (iso: string): string => {
	const d = toJst(iso);
	return `${d.getUTCFullYear()}/${d.getUTCMonth() + 1}/${d.getUTCDate()} :${jstHm(iso)}`;
};

/**
 * インシデント終了時に Backlog へ追記する「トラブル報告」を生成する（追記のみ）。
 * ＜発生日時＞＜時系列＞＜発生事象＞＜原因＞＜影響＞＜対応＞＜今後の対策＞の定型フォーマット。
 */
export const generateTroubleReport = async (
	incident: Incident,
	messages: readonly IncidentMessage[],
): Promise<string> => {
	const messageLog = messages
		.map((m) => `[${jstHm(m.recordedAt)}] ${m.userName}: ${m.text}`)
		.join("\n");

	const prompt = `以下はインシデント「${incident.title}」の対応記録です。これをもとに、Backlog課題へ追記する「トラブル報告」を生成してください。

## 出力ルール
- 以下の見出しを、この順序・この表記（全角山括弧）で必ず出力する。
- 各見出しの下に内容を記述する。該当情報が無い場合は「（不明）」と書く。
- JSON・コードブロック・前置き/後置きは付けず、本文のみをプレーンテキストで出力する。
- 時刻は日本時間(JST)。

＜発生日時＞
${jstDateTime(incident.startedAt)}

＜時系列＞
（チャットログを時刻(HH:MM)付きで時系列に要約。各行「HH:MM　内容」の形式）

＜発生事象＞
（何が起きたか）

＜原因＞
（根本または直接の原因）

＜影響＞
（影響範囲）

＜対応＞
（実施した対応。暫定対応・恒久対応を含める）

＜今後の対策＞
（再発防止策）

## 参考情報
- 影響範囲(入力): ${incident.impact ?? "未記載"}
- 解決方法(入力): ${incident.resolution || "未記載"}
- 発生: ${jstDateTime(incident.startedAt)} 〜 終了: ${
		incident.endedAt ? jstDateTime(incident.endedAt) : "対応中"
	}

## チャットログ（[HH:MM] 発言者: 本文）
${messageLog || "（記録なし）"}`;

	const requestBody = {
		messages: [
			{
				role: "system",
				content:
					"あなたは SRE チームのトラブル報告作成を支援するアシスタントです。指定フォーマットに厳密に従い、簡潔で正確な報告を生成してください。",
			},
			{ role: "user", content: prompt },
		],
		max_completion_tokens: 4096,
		temperature: 0.3,
	};

	const command = new InvokeModelCommand({
		modelId: MODEL_ID,
		body: JSON.stringify(requestBody),
		contentType: "application/json",
		accept: "application/json",
	});

	const response = await client.send(command);
	const responseBody = JSON.parse(new TextDecoder().decode(response.body));
	return stripReasoning(responseBody.choices?.[0]?.message?.content ?? "");
};

/**
 * リアクション起票の元メッセージから、簡潔なインシデントタイトルを生成する。
 * 失敗時は空文字を返す（呼び出し側で元テキストにフォールバック）。
 */
export const generateIncidentTitle = async (text: string): Promise<string> => {
	const requestBody = {
		messages: [
			{
				role: "system",
				content:
					"あなたは障害対応の記録を支援するアシスタントです。指示に厳密に従い、タイトルのみを1行で出力します。",
			},
			{
				role: "user",
				content:
					`次のSlackメッセージは障害の一次報告です。インシデントのタイトルを日本語で40字以内・簡潔な体言止めで作成してください。` +
					`記号や引用符・接頭辞は付けず、タイトルのみを1行で出力してください。\n\nメッセージ:\n${text.slice(0, 1000)}`,
			},
		],
		max_completion_tokens: 1024,
		temperature: 0.2,
	};

	const command = new InvokeModelCommand({
		modelId: MODEL_ID,
		body: JSON.stringify(requestBody),
		contentType: "application/json",
		accept: "application/json",
	});

	const response = await client.send(command);
	const responseBody = JSON.parse(new TextDecoder().decode(response.body));
	const raw = stripReasoning(responseBody.choices?.[0]?.message?.content ?? "");
	return raw
		.split("\n")[0]
		.replace(/^["'「『【]+|["'」』】]+$/g, "")
		.trim()
		.slice(0, 100);
};
