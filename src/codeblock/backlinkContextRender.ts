/**
 * backlinkContextRender — shared context-group DOM builder.
 *
 * The dense/cards "source → highlighted snippet" rendering used by BOTH the
 * in-note code block / footer (BacklinkRenderChild) and the Context sidebar tab
 * (ContextPanel). Interaction (open / hover) and DOM-listener registration are
 * injected so each host wires them to its own lifecycle. Pure of Obsidian
 * globals beyond the App handle passed in.
 *
 * Emits the same `.orbital-backlink-*` / native search-result classes as before,
 * so all existing CSS applies unchanged. Surrounding-lines mode (Context tab)
 * additionally renders dimmed lead/trail lines around the matched line.
 */

import type { App, TFile } from "obsidian";
import { extractContext } from "graph/backlinkContext";
import type { ContextSnippet, LinkOffset } from "graph/backlinkContext";
import type { ContextStyle } from "types/index";

/** Minimal Obsidian-augmented element surface used here. */
interface AugmentedEl {
	createEl(
		tag: string,
		opts?: { text?: string; cls?: string; attr?: Record<string, string> },
	): HTMLElement;
	createDiv(opts?: { cls?: string; text?: string }): HTMLElement;
	createSpan(opts?: { cls?: string; text?: string }): HTMLElement;
}

/** Everything the group renderer needs from its host. */
export interface ContextRenderContext {
	app: App;
	/** Path of the note whose backlinks are shown (for link resolution). */
	sourcePath: string;
	/** The subject note; link offsets are those resolving to this file. */
	subject: TFile;
	style: ContextStyle;
	collapsed: boolean;
	/** Per-side character window (see windowCharsFor). */
	windowChars: number;
	/** Whether to render neighbouring lead/trail lines. */
	surroundingLines: boolean;
	/** Max sources rendered before a "… and N more" node. */
	cap: number;
	/** Register a DOM listener tied to the host's cleanup (registerDomEvent). */
	register: <K extends keyof HTMLElementEventMap>(
		el: HTMLElement,
		type: K,
		handler: (ev: HTMLElementEventMap[K]) => void,
	) => void;
	/** Open the source note (optionally scrolled to a line). */
	open: (path: string, evt: MouseEvent, line?: number) => void;
	/** Fire a hover-link preview for `path` anchored on `el`. */
	hover: (el: HTMLElement, path: string) => void;
}

/**
 * Render the context wrapper (one group per survivor) into `container`.
 * Reads each source via cachedRead; a single unreadable/empty source is skipped.
 */
export async function renderContextGroups(
	container: AugmentedEl,
	survivors: string[],
	ctx: ContextRenderContext,
): Promise<void> {
	const wrap = container.createDiv({
		cls: `orbital-backlink-context orbital-backlink-context--${ctx.style}`,
	}) as unknown as AugmentedEl;

	const capped = survivors.slice(0, ctx.cap);
	for (const path of capped) {
		await renderContextSource(wrap, path, ctx);
	}
	if (survivors.length > ctx.cap) {
		wrap.createDiv({
			cls: "orbital-backlink-more",
			text: `… and ${survivors.length - ctx.cap} more`,
		});
	}
}

async function renderContextSource(
	wrap: AugmentedEl,
	path: string,
	ctx: ContextRenderContext,
): Promise<void> {
	const file = ctx.app.vault.getFileByPath(path);
	if (!file) return;

	let content: string;
	try {
		content = await ctx.app.vault.cachedRead(file);
	} catch {
		return; // one unreadable source is skipped; the rest continue
	}

	const offsets = subjectLinkOffsets(file, path, ctx);
	if (offsets.length === 0) return;

	const snippets = extractContext(content, offsets, ctx.windowChars, {
		surroundingLines: ctx.surroundingLines,
	});
	if (snippets.length === 0) return;

	renderGroup(wrap, path, file, snippets, ctx);
}

/** Link offsets in `file` whose link resolves to the subject note. */
function subjectLinkOffsets(
	file: TFile,
	sourcePath: string,
	ctx: ContextRenderContext,
): LinkOffset[] {
	const links = ctx.app.metadataCache.getFileCache(file)?.links ?? [];
	const offsets: LinkOffset[] = [];
	for (const link of links) {
		if (!link.link) continue;
		const dest = ctx.app.metadataCache.getFirstLinkpathDest(link.link, sourcePath);
		if (dest && dest.path === ctx.subject.path) {
			offsets.push({
				start: link.position.start.offset,
				end: link.position.end.offset,
			});
		}
	}
	return offsets;
}

function renderGroup(
	wrap: AugmentedEl,
	path: string,
	file: TFile,
	snippets: ContextSnippet[],
	ctx: ContextRenderContext,
): void {
	const group = wrap.createEl("div", {
		cls: "search-result orbital-backlink-group"
			+ (ctx.collapsed ? " is-collapsed" : ""),
		attr: { "data-path": path },
	});
	const groupEl = group as unknown as AugmentedEl;

	const title = groupEl.createEl("div", {
		cls: "search-result-file-title is-clickable orbital-backlink-group-title",
	});
	const titleEl = title as unknown as AugmentedEl;
	titleEl.createSpan({ cls: "orbital-backlink-chevron" });
	titleEl.createSpan({
		cls: "orbital-backlink-item-label",
		text: displayName(path, file),
	});
	const occurrences = snippets.reduce((n, s) => n + s.matchCount, 0);
	titleEl.createSpan({
		cls: "orbital-backlink-group-count",
		text: String(occurrences),
	});
	// Title click folds the group (does not open the note).
	ctx.register(title, "click", () => group.classList.toggle("is-collapsed"));
	ctx.hover(title, path);

	const matches = groupEl.createEl("div", { cls: "search-result-file-matches" });
	for (const snippet of snippets) {
		renderSnippet(matches, snippet, path, ctx);
	}
}

function renderSnippet(
	container: HTMLElement,
	snippet: ContextSnippet,
	path: string,
	ctx: ContextRenderContext,
): void {
	const row = (container as unknown as AugmentedEl).createEl("div", {
		cls: "search-result-file-match is-clickable orbital-backlink-snippet",
	});
	const rowEl = row as unknown as AugmentedEl;
	ctx.register(row, "click", (evt) => ctx.open(path, evt, snippet.lineIndex));

	// Optional dimmed lead line (surrounding-lines mode) above the matched line.
	if (snippet.leadLine !== undefined) {
		rowEl.createDiv({ cls: "orbital-backlink-context-line", text: snippet.leadLine });
	}

	// Matched line: spans appended directly to the row (identical to the code
	// block / footer when there are no surrounding lines).
	const highlightRepeats = snippet.matchCount > 1;
	appendText(rowEl, snippet.before, snippet.match, highlightRepeats);
	appendMatch(rowEl, snippet.match);
	appendText(rowEl, snippet.after, snippet.match, highlightRepeats);

	// Optional dimmed trail line below the matched line.
	if (snippet.trailLine !== undefined) {
		rowEl.createDiv({ cls: "orbital-backlink-context-line", text: snippet.trailLine });
	}
}

function appendMatch(rowEl: AugmentedEl, match: string): void {
	if (match === "") return;
	rowEl.createSpan({
		cls: "search-result-file-matched-text orbital-backlink-match",
		text: match,
	});
}

/** Append `text`, highlighting occurrences of `match` when `highlight`. */
function appendText(
	rowEl: AugmentedEl,
	text: string,
	match: string,
	highlight: boolean,
): void {
	if (text === "") return;
	if (!highlight || match === "") {
		rowEl.createSpan({ text });
		return;
	}
	let idx = 0;
	while (idx < text.length) {
		const found = text.indexOf(match, idx);
		if (found === -1) {
			rowEl.createSpan({ text: text.slice(idx) });
			break;
		}
		if (found > idx) rowEl.createSpan({ text: text.slice(idx, found) });
		rowEl.createSpan({
			cls: "search-result-file-matched-text orbital-backlink-match",
			text: match,
		});
		idx = found + match.length;
	}
}

function displayName(path: string, file: TFile | null): string {
	if (file) return file.basename;
	const base = path.split("/").pop() ?? path;
	return base.replace(/\.md$/, "");
}
