import type { WebClient } from "@slack/web-api";
import {
	type ChecklistState,
	getChecklist,
	saveChecklist,
} from "./incident.repository";

// 初動チェックリストのステップ（障害時運用ルール）
export const STEP_DEFS = [
	{ key: "s1", label: "営業へ一次連絡（事象確認・調査中を伝える）" },
	{ key: "s2", label: "案件関係者・上長へ報告" },
	{ key: "s3", label: "役割を立ち上げる（調査役／営業連絡役を分ける）" },
	{ key: "s4", label: "影響範囲を特定" },
] as const;

// 役割（コマンダーは無し。調査役／営業連絡役の2役）
export const ROLE_DEFS = [
	{ key: "investigator", label: "調査役" },
	{ key: "salesContact", label: "営業連絡役" },
] as const;

export const ACTION_STEP = "checklist_step";
export const ACTION_ROLE = "checklist_role";

const timeLabel = (iso?: string): string => {
	if (!iso) return "";
	const d = new Date(iso);
	const hh = String(d.getHours()).padStart(2, "0");
	const mm = String(d.getMinutes()).padStart(2, "0");
	return `${hh}:${mm}`;
};

// チェックリスト状態から Block Kit ブロックを生成する
export const renderChecklistBlocks = (
	state: ChecklistState,
): Record<string, unknown>[] => {
	const blocks: Record<string, unknown>[] = [
		{
			type: "section",
			text: {
				type: "mrkdwn",
				text: "📋 *初動チェックリスト*（上から順に。完了したらボタンを押す）",
			},
		},
	];

	for (const step of STEP_DEFS) {
		const s = state.steps[step.key];
		const done = s?.done === true;
		const suffix = done && s?.by ? ` — <@${s.by}> ${timeLabel(s.at)}` : "";
		blocks.push({
			type: "section",
			text: {
				type: "mrkdwn",
				text: `${done ? "✅" : "⬜"} ${step.label}${suffix}`,
			},
			accessory: {
				type: "button",
				text: {
					type: "plain_text",
					text: done ? "↩︎ 取り消す" : "完了にする",
				},
				action_id: ACTION_STEP,
				value: `${state.incidentId}:${step.key}`,
			},
		});
	}

	const roleLine = ROLE_DEFS.map((r) => {
		const uid = state.roles[r.key];
		return `・${r.label}: ${uid ? `<@${uid}>` : "未定"}`;
	}).join("\n");

	blocks.push({ type: "divider" });
	blocks.push({
		type: "section",
		text: { type: "mrkdwn", text: `👥 *役割*\n${roleLine}` },
	});
	blocks.push({
		type: "actions",
		elements: ROLE_DEFS.map((r) => ({
			type: "button",
			text: { type: "plain_text", text: `${r.label}に立候補` },
			// 同一 actions ブロック内で action_id は重複不可のため役割ごとにユニーク化
			action_id: `${ACTION_ROLE}_${r.key}`,
			value: `${state.incidentId}:${r.key}`,
		})),
	});

	// このチャンネルでの操作案内（常時表示・ピン留めされる）
	blocks.push({
		type: "context",
		elements: [
			{
				type: "mrkdwn",
				text: "💡 残したい発言に :memo: を付けると Backlog 課題に追記されます。",
			},
		],
	});

	return blocks;
};

// 起票時に初動チェックリスト（ボタン式）を投稿・ピン留めし、状態を保存する
export const postInitialChecklist = async (
	client: WebClient,
	incidentId: string,
	channelId: string,
): Promise<void> => {
	const state: ChecklistState = {
		incidentId,
		channelId,
		createdAt: new Date().toISOString(),
		steps: Object.fromEntries(STEP_DEFS.map((s) => [s.key, { done: false }])),
		roles: {},
	};

	try {
		const posted = await client.chat.postMessage({
			channel: channelId,
			text: "📋 初動チェックリスト",
			blocks: renderChecklistBlocks(state),
		});
		if (posted.ts) {
			state.messageTs = posted.ts;
			try {
				await client.pins.add({ channel: channelId, timestamp: posted.ts });
			} catch {
				// ピン留め失敗は無視
			}
		}
		await saveChecklist(state);
	} catch {
		// 投稿失敗は無視（再配信暴走を防ぐ）
	}
};

// ステップ完了ボタン押下の処理（トグル）
export const applyStepToggle = async (
	client: WebClient,
	incidentId: string,
	stepKey: string,
	userId: string,
	channel: string,
	messageTs: string,
): Promise<void> => {
	const state = await getChecklist(incidentId);
	if (!state) return;
	const cur = state.steps[stepKey];
	const nextSteps = {
		...state.steps,
		[stepKey]: cur?.done
			? { done: false }
			: { done: true, by: userId, at: new Date().toISOString() },
	};
	const next: ChecklistState = { ...state, steps: nextSteps };
	await saveChecklist(next);
	await client.chat.update({
		channel,
		ts: messageTs,
		text: "初動チェックリスト",
		blocks: renderChecklistBlocks(next),
	});
};

// 役割立候補ボタン押下の処理（トグル＋1人2役の警告）
export const applyRoleToggle = async (
	client: WebClient,
	incidentId: string,
	roleKey: string,
	userId: string,
	channel: string,
	messageTs: string,
): Promise<void> => {
	const state = await getChecklist(incidentId);
	if (!state) return;

	const roles: Record<string, string> = { ...state.roles };
	if (roles[roleKey] === userId) {
		delete roles[roleKey];
	} else {
		roles[roleKey] = userId;
		// 同一ユーザーが両役を持つ場合は非推奨を警告（エフェメラル）
		const other = ROLE_DEFS.find((r) => r.key !== roleKey);
		if (other && roles[other.key] === userId) {
			try {
				await client.chat.postEphemeral({
					channel,
					user: userId,
					text: "⚠️ 1人で2役（調査役と営業連絡役）は非推奨です。可能なら分担してください。",
				});
			} catch {
				// 無視
			}
		}
	}

	const next: ChecklistState = { ...state, roles };
	await saveChecklist(next);
	await client.chat.update({
		channel,
		ts: messageTs,
		text: "初動チェックリスト",
		blocks: renderChecklistBlocks(next),
	});
};
