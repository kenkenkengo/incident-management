import { Resource } from "sst";
import { getBacklogConfig } from "./incident.repository";

// Backlog 連携（P1-3）。インシデント起票時に Backlog(snsnap) の設定プロジェクトへ
// 課題を自動作成する。認証は API キーをクエリに付与する方式。
// 起票の有効/無効・起票先プロジェクトは DynamoDB の設定で切替（モード切替）。
const SPACE = "snsnap.backlog.jp";
const BASE = `https://${SPACE}/api/v2`;

// Warm な Lambda 実行間で解決結果を再利用する（projectKey 単位でキャッシュ）
const projectCache = new Map<
	string,
	{ projectId: number; issueTypeId: number }
>();

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

// projectKey（例 "TR"）から projectId と使用する issueTypeId を解決する。
// projectKey か name を正規化して一致させ、issueType は障害/trouble/bug 等を優先。
const resolveProject = async (
	projectKey: string,
): Promise<{ projectId: number; issueTypeId: number }> => {
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
			/障害|trouble|インシデント|incident|bug/i.test(t.name),
		) ?? types[0];
	if (!preferred) {
		throw new Error("Backlog issue type not found");
	}

	const resolved = { projectId, issueTypeId: preferred.id as number };
	projectCache.set(projectKey, resolved);
	return resolved;
};

export interface BacklogIssueInput {
	readonly title: string;
	readonly severity: "SEV1" | "SEV2" | "SEV3";
	readonly impact?: string;
	readonly project?: string;
	readonly externalImpact?: boolean;
	readonly incidentUrl?: string;
}

// SEV → Backlog 優先度ID（high=2 / medium=3 / low=4）
const priorityForSeverity = (severity: string): number =>
	severity === "SEV1" ? 2 : severity === "SEV2" ? 3 : 4;

/**
 * インシデント起票時に Backlog 課題を作成する。失敗しても null を返すだけで
 * 起票フロー自体は止めない（Backlog 側の必須カスタムフィールド等で失敗しうるため）。
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

		const { projectId, issueTypeId } = await resolveProject(config.projectKey);
		const summary = `[${input.severity}] ${input.title}`.slice(0, 255);
		const description =
			`インシデント自動起票（generosity-incident-management）\n` +
			`重要度: ${input.severity}\n` +
			(input.project ? `案件・顧客: ${input.project}\n` : "") +
			(input.externalImpact ? `対外影響: あり\n` : "") +
			(input.impact ? `影響範囲: ${input.impact}\n` : "") +
			(input.incidentUrl ? `詳細: ${input.incidentUrl}\n` : "");

		const body = new URLSearchParams({
			projectId: String(projectId),
			summary,
			issueTypeId: String(issueTypeId),
			priorityId: String(priorityForSeverity(input.severity)),
			description,
		});

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
