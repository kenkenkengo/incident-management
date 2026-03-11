import {
	BedrockRuntimeClient,
	InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import type { Incident, IncidentMessage } from "./incident.types";

const client = new BedrockRuntimeClient({});
export const MODEL_ID = "openai.gpt-oss-safeguard-120b";

const buildPrompt = (
	incident: Incident,
	messages: readonly IncidentMessage[],
): string => {
	const messageLog = messages
		.map((m) => `[${m.recordedAt}] ${m.userName}: ${m.text}`)
		.join("\n");

	return `以下はインシデント「${incident.title}」の対応中に交わされたチャットログです。
これをもとにポストモーテム（振り返り文書）をMarkdown形式で生成してください。

## 含めるべきセクション
- 概要（何が起きたか）
- タイムライン（時系列での主要イベント）
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
  "content": "## 概要\\n...\\n## 手順\\n1. ...\\n2. ...",
  "tags": ["障害カテゴリ", "関連サービス"]
}

## ランブックに含めるべきセクション
- 概要（どんな障害か、いつ発生しうるか）
- 検知方法（どうやって気づくか）
- 対応手順（ステップバイステップ）
- エスカレーション基準（いつ誰に連絡するか）
- 復旧確認（どうやって正常に戻ったことを確認するか）

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
): Promise<string> => {
	const requestBody = {
		messages: [
			{
				role: "system",
				content:
					"あなたは SRE チームのポストモーテム作成を支援するアシスタントです。簡潔で実用的な文書を生成してください。",
			},
			{ role: "user", content: buildPrompt(incident, messages) },
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
	return responseBody.choices[0].message.content;
};
