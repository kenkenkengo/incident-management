import { Resource } from "sst";
import { getBacklogConfig } from "./incident.repository";

// Backlog 連携（P1-3）。インシデント起票時に Backlog(snsnap) の設定プロジェクトへ
// 課題を自動作成する。認証は API キーをクエリに付与する方式。
// 起票の有効/無効・起票先プロジェクトは DynamoDB の設定で切替（モード切替）。
const SPACE = "snsnap.backlog.jp";
const BASE = `https://${SPACE}/api/v2`;

interface RequiredField {
	readonly id: number;
	readonly typeId: number;
	readonly items: readonly { readonly id: number; readonly name: string }[];
}
interface ResolvedProject {
	readonly projectId: number;
	readonly issueTypeId: number;
	readonly requiredFields: readonly RequiredField[];
}

// Warm な Lambda 実行間で解決結果を再利用する（projectKey 単位でキャッシュ）
const projectCache = new Map<string, ResolvedProject>();

const apiKey = (): string => Resource.BacklogApiKey.value;
const norm = (s: string): string => s.toLowerCase().replace(/[\s_-]/g, "");

// biome-ignore lint/suspicious/noExplicitAny: Backlog API レスポンスは動的
const getJson = async (path: string): Promise<any> => {
	const sep = path.includes("?") ? "&" : "?";
	const res = await fetch(
		`${BASE}${path}${sep}apiKey=${encodeURIComponent(apiKey())}`,
	);
	if (!res.ok) {
		throw new Error(`Backlog GET ${path} -> ${res.status}`);
	}
	return res.json();
};

// projectKey（例 "TR"）から projectId・使用する issueTypeId・必須カスタムフィールドを解決する。
const resolveProject = async (projectKey: string): Promise<ResolvedProject> => {
	const cached = projectCache.get(projectKey);
	if (cached) {
		return cached;
	}
	const target = norm(projectKey);
	const projects = await getJson("/projects");
	const match = projects.find(
		// biome-ignore lint/suspicious/noExplicitAny: 動的
		(p: any) => norm(p.projectKey) === target || norm(p.name) === target,
	);
	if (!match) {
		throw new Error(`Backlog project '${projectKey}' not found`);
	}
	const projectId = match.id as number;

	const types = await getJson(`/projects/${projectId}/issueTypes`);
	const preferred =
		// biome-ignore lint/suspicious/noExplicitAny: 動的
		types.find((t: any) =>
			/トラブル|障害|インシデント|incident|trouble/i.test(t.name),
		) ?? types[0];
	if (!preferred) {
		throw new Error("Backlog issue type not found");
	}
	const issueTypeId = preferred.id as number;

	// 必須カスタムフィールド（起票時に値が無いと 400 になる）を収集
	let requiredFields: RequiredField[] = [];
	try {
		const fields = await getJson(`/projects/${projectId}/customFields`);
		requiredFields = fields
			// biome-ignore lint/suspicious/noExplicitAny: 動的
			.filter((f: any) => {
				const applicable =
					!f.applicableIssueTypes ||
					f.applicableIssueTypes.length === 0 ||
					f.applicableIssueTypes.includes(issueTypeId);
				return f.required === true && applicable;
			})
			// biome-ignore lint/suspicious/noExplicitAny: 動的
			.map((f: any) => ({
				id: f.id as number,
				typeId: f.typeId as number,
				// biome-ignore lint/suspicious/noExplicitAny: 動的
				items: (f.items ?? []).map((i: any) => ({
					id: i.id as number,
					name: i.name as string,
				})),
			}));
	} catch {
		// カスタムフィールド取得失敗時は空扱い（起票を試行）
	}

	const resolved: ResolvedProject = { projectId, issueTypeId, requiredFields };
	projectCache.set(projectKey, resolved);
	return resolved;
};

// リスト系カスタムフィールドの選択肢から、案件テキストに一致 → フォールバック名 → 先頭、で1件選ぶ
const pickListItem = (
	field: RequiredField,
	hint: string | undefined,
): number | undefined => {
	if (field.items.length === 0) {
		return undefined;
	}
	if (hint) {
		const h = norm(hint);
		const matched = field.items.find(
			(i) => norm(i.name).includes(h) || h.includes(norm(i.name)),
		);
		if (matched) {
			return matched.id;
		}
	}
	const fallback = field.items.find((i) =>
		/その他|共通|未分類|該当なし|なし|不明|other/i.test(i.name),
	);
	return (fallback ?? field.items[0]).id;
};

// 必須カスタムフィールドを URLSearchParams に補完する
const appendRequiredFields = (
	body: URLSearchParams,
	fields: readonly RequiredField[],
	hint: string | undefined,
): void => {
	for (const f of fields) {
		const key = `customField_${f.id}`;
		switch (f.typeId) {
			case 5: // 単一選択リスト
			case 6: // 複数選択リスト
			case 7: // チェックボックス
			case 8: {
				// ラジオ
				const itemId = pickListItem(f, hint);
				if (itemId !== undefined) {
					body.append(key, String(itemId));
				}
				break;
			}
			case 3: // 数値
				body.append(key, "0");
				break;
			case 4: // 日付
				body.append(key, new Date().toISOString().slice(0, 10));
				break;
			default: // 1:文字列 / 2:文章 など
				body.append(key, hint ?? "-");
		}
	}
};

export interface BacklogIssueInput {
	readonly title: string;
	readonly severity: "SEV1" | "SEV2" | "SEV3";
	readonly impact?: string;
	readonly project?: string;
	readonly externalImpact?: boolean;
	readonly incidentUrl?: string;
	// リアクション起票の元メッセージ（本文・パーマリンク）
	readonly sourceText?: string;
	readonly sourceLink?: string;
}

// SEV → Backlog 優先度ID（high=2 / medium=3 / low=4）
const priorityForSeverity = (severity: string): number =>
	severity === "SEV1" ? 2 : severity === "SEV2" ? 3 : 4;

/**
 * インシデント起票時に Backlog 課題を作成する。モード無効なら起票しない。
 * 失敗しても null を返すだけで起票フロー自体は止めない。
 */
export const createIncidentBacklogIssue = async (
	input: BacklogIssueInput,
): Promise<{ readonly issueKey: string; readonly url: string } | null> => {
	try {
		// モード確認: 無効なら起票しない（テスト時など）。設定は DynamoDB で切替可能。
		const config = await getBacklogConfig();
		if (!config.enabled) {
			return null;
		}

		const { projectId, issueTypeId, requiredFields } = await resolveProject(
			config.projectKey,
		);
		const summary = `[${input.severity}] ${input.title}`.slice(0, 255);
		const description =
			`インシデント自動起票（generosity-incident-management）\n` +
			`重要度: ${input.severity}\n` +
			(input.project ? `案件・顧客: ${input.project}\n` : "") +
			(input.externalImpact ? `対外影響: あり\n` : "") +
			(input.impact ? `影響範囲: ${input.impact}\n` : "") +
			(input.incidentUrl ? `詳細: ${input.incidentUrl}\n` : "") +
			(input.sourceText ? `\n元メッセージ:\n${input.sourceText}\n` : "") +
			(input.sourceLink ? `${input.sourceLink}\n` : "");

		const body = new URLSearchParams({
			projectId: String(projectId),
			summary,
			issueTypeId: String(issueTypeId),
			priorityId: String(priorityForSeverity(input.severity)),
			description,
		});
		// 必須カスタムフィールド（例: TR の「プロダクト名」）を自動補完
		appendRequiredFields(body, requiredFields, input.project ?? input.title);

		const res = await fetch(
			`${BASE}/issues?apiKey=${encodeURIComponent(apiKey())}`,
			{
				method: "POST",
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
				body: body.toString(),
			},
		);
		if (!res.ok) {
			console.error(
				"Backlog create issue failed",
				res.status,
				await res.text(),
			);
			return null;
		}
		const issue = await res.json();
		return {
			issueKey: issue.issueKey,
			url: `https://${SPACE}/view/${issue.issueKey}`,
		};
	} catch (error) {
		console.error("Backlog issue creation error", error);
		return null;
	}
};

/**
 * 既存の Backlog 課題にコメントを追記する（:memo: 追記に使用）。
 * Backlog モードが無効なら追記しない。成否を返す。
 */
export const addBacklogComment = async (
	issueKey: string,
	content: string,
): Promise<boolean> => {
	try {
		const config = await getBacklogConfig();
		if (!config.enabled) {
			return false;
		}
		const body = new URLSearchParams({ content: content.slice(0, 10000) });
		const res = await fetch(
			`${BASE}/issues/${encodeURIComponent(issueKey)}/comments?apiKey=${encodeURIComponent(apiKey())}`,
			{
				method: "POST",
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
				body: body.toString(),
			},
		);
		if (!res.ok) {
			console.error("Backlog add comment failed", res.status, await res.text());
			return false;
		}
		return true;
	} catch (error) {
		console.error("Backlog add comment error", error);
		return false;
	}
};
