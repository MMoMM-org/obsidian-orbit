/**
 * Context snippet extractor for backlink display.
 *
 * PURE functions: no imports from 'obsidian' or any module with side effects.
 * Builds ONE windowed snippet per link line, centred on the first link
 * occurrence. Offsets stay on the same physical line — newlines are not crossed.
 *
 * Domain rule reference: docs/ai/memory/domain.md
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Character offsets [start, end) into document content. */
export interface LinkOffset {
	start: number;
	end: number;
}

/** A windowed context snippet for one line containing at least one link. */
export interface ContextSnippet {
	/** 0-based line index of this snippet's source line. */
	lineIndex: number;
	/** Text before the first link, trimmed to windowChars; '…' prefixed if truncated. */
	before: string;
	/** The matched link text: content.slice(firstLink.start, firstLink.end). */
	match: string;
	/** Text after the first link, trimmed to windowChars; '…' suffixed if truncated. */
	after: string;
	/** Number of links whose start falls on this line. */
	matchCount: number;
}

// ---------------------------------------------------------------------------
// extractContext
// ---------------------------------------------------------------------------

/**
 * Build ONE windowed snippet per link line (deduped by line index).
 * Window centred on the FIRST link occurrence on that line.
 */
export function extractContext(
	content: string,
	links: LinkOffset[],
	windowChars: number,
): ContextSnippet[] {
	if (links.length === 0) return [];

	const lineStarts = buildLineStarts(content);
	const byLine = groupByLine(links, lineStarts);

	return Array.from(byLine.entries())
		.sort(([a], [b]) => a - b)
		.map(([lineIndex, lineLinks]) =>
			buildSnippet(content, lineIndex, lineLinks, lineStarts, windowChars),
		);
}

// ---------------------------------------------------------------------------
// Internal helpers — line index arithmetic
// ---------------------------------------------------------------------------

/** Return an array of character offsets where each line starts (0-based). */
function buildLineStarts(content: string): number[] {
	const starts = [0];
	for (let i = 0; i < content.length; i++) {
		if (content[i] === "\n") starts.push(i + 1);
	}
	return starts;
}

/**
 * Binary search: return the 0-based line index for a character offset.
 * Always returns a valid index in [0, lineStarts.length - 1].
 */
function lineIndexOf(offset: number, lineStarts: number[]): number {
	let lo = 0;
	let hi = lineStarts.length - 1;
	while (lo < hi) {
		const mid = (lo + hi + 1) >> 1;
		if (lineStarts[mid]! <= offset) lo = mid;
		else hi = mid - 1;
	}
	return lo;
}

/** Group links by line index; entries within each line are sorted by start offset. */
function groupByLine(
	links: LinkOffset[],
	lineStarts: number[],
): Map<number, LinkOffset[]> {
	const map = new Map<number, LinkOffset[]>();
	for (const link of links) {
		const idx = lineIndexOf(link.start, lineStarts);
		const group = map.get(idx);
		if (group === undefined) map.set(idx, [link]);
		else group.push(link);
	}
	for (const group of map.values()) group.sort((a, b) => a.start - b.start);
	return map;
}

// ---------------------------------------------------------------------------
// Internal helpers — snippet construction
// ---------------------------------------------------------------------------

/** Build a single ContextSnippet for one line given its sorted links. */
function buildSnippet(
	content: string,
	lineIndex: number,
	lineLinks: LinkOffset[],
	lineStarts: number[],
	windowChars: number,
): ContextSnippet {
	const lineStart = lineStarts[lineIndex]!;
	const lineEnd =
		lineIndex + 1 < lineStarts.length
			? lineStarts[lineIndex + 1]! - 1 // up to but not including the '\n'
			: content.length;

	const firstLink = lineLinks[0]!;
	const match = content.slice(firstLink.start, firstLink.end);
	const lineBeforeLink = content.slice(lineStart, firstLink.start);
	const lineAfterLink = content.slice(firstLink.end, lineEnd);

	return {
		lineIndex,
		before: truncateBefore(lineBeforeLink, windowChars),
		match,
		after: truncateAfter(lineAfterLink, windowChars),
		matchCount: lineLinks.length,
	};
}

/**
 * Trim the text immediately before a link to at most windowChars characters.
 * Takes the rightmost windowChars chars; if that window starts mid-word, snaps
 * forward to the next whitespace. Prefixes '…' when truncation occurred.
 */
function truncateBefore(text: string, windowChars: number): string {
	if (text.length <= windowChars) return text;

	const start = text.length - windowChars;
	const prevChar = text[start - 1] ?? "";
	const window = text.slice(start);
	const firstChar = window[0] ?? "";
	const isMidWord = prevChar !== "" && !/\s/.test(prevChar) && !/\s/.test(firstChar);
	const result = isMidWord ? snapForward(window) : window;
	return "…" + result;
}

/**
 * Trim the text immediately after a link to at most windowChars characters.
 * Takes the leftmost windowChars chars; if that window ends mid-word, snaps
 * backward to the last whitespace. Appends '…' when truncation occurred.
 */
function truncateAfter(text: string, windowChars: number): string {
	if (text.length <= windowChars) return text;

	const window = text.slice(0, windowChars);
	const lastChar = window[windowChars - 1] ?? "";
	const nextChar = text[windowChars] ?? "";
	const isMidWord = nextChar !== "" && !/\s/.test(nextChar) && !/\s/.test(lastChar);
	const result = isMidWord ? snapBackward(window) : window;
	return result + "…";
}

/** Slice from the first whitespace in text (avoids showing a partial leading word). */
function snapForward(text: string): string {
	for (let i = 0; i < text.length; i++) {
		if (/\s/.test(text[i]!)) return text.slice(i);
	}
	return text;
}

/** Slice up to and including the last whitespace (avoids showing a partial trailing word). */
function snapBackward(text: string): string {
	for (let i = text.length - 1; i >= 0; i--) {
		if (/\s/.test(text[i]!)) return text.slice(0, i + 1);
	}
	return text;
}
