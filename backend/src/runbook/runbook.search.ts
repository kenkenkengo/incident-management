import type { Runbook } from "./runbook.types";

interface ScoredRunbook {
	readonly runbook: Runbook;
	readonly score: number;
}

const normalizeText = (text: string): string =>
	text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ");

const extractKeywords = (title: string): readonly string[] => {
	const stopWords = new Set([
		"の",
		"が",
		"を",
		"に",
		"は",
		"で",
		"と",
		"から",
		"まで",
		"a",
		"an",
		"the",
		"is",
		"are",
		"in",
		"on",
		"of",
		"for",
	]);
	return normalizeText(title)
		.split(/\s+/)
		.filter((w) => w.length > 1 && !stopWords.has(w));
};

const countMatches = (text: string, keywords: readonly string[]): number => {
	const normalized = normalizeText(text);
	return keywords.reduce(
		(count, kw) => (normalized.includes(kw) ? count + 1 : count),
		0,
	);
};

const scoreRunbook = (
	runbook: Runbook,
	keywords: readonly string[],
): number => {
	const tagText = runbook.tags.join(" ");
	const titleMatches = countMatches(runbook.title, keywords);
	const tagMatches = countMatches(tagText, keywords);
	const contentMatches = countMatches(runbook.content, keywords);

	return tagMatches * 3 + titleMatches * 2 + contentMatches;
};

export const searchRunbooks = (
	runbooks: readonly Runbook[],
	incidentTitle: string,
	maxResults = 3,
): readonly Runbook[] => {
	const keywords = extractKeywords(incidentTitle);
	if (keywords.length === 0) {
		return [];
	}

	const scored: readonly ScoredRunbook[] = runbooks
		.map((runbook) => ({
			runbook,
			score: scoreRunbook(runbook, keywords),
		}))
		.filter((s) => s.score > 0);

	return [...scored]
		.sort((a, b) => b.score - a.score)
		.slice(0, maxResults)
		.map((s) => s.runbook);
};
