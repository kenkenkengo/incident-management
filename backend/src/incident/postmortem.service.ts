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
