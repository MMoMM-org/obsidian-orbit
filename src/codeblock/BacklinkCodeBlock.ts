/**
 * BacklinkCodeBlock — T2.1 / T2.2
 *
 * MarkdownRenderChild orchestrator for the `orbital-backlinks` codeblock. Wires
 * the Obsidian runtime (link index, metadata cache, vault, workspace) into the
 * three pure core modules (parse / filter / context) and renders XSS-safe DOM.
 *
 * Lifecycle:
 *   - onload(): parse config ONCE, do the first render, subscribe to change
 *     events through this.registerEvent, and drive re-renders through a single
 *     per-instance trailing debouncer (cancelled via this.register on unload).
 *   - render(): resolve subject → backlinks → filter → compact or context DOM;
 *     any thrown error is caught and shown as a contained inline error node.
 *
 * See docs/XDD/specs/002-backlink-codeblock/solution.md (Runtime View).
 */

import { MarkdownRenderChild, Keymap, debounce, getAllTags } from "obsidian";
import type { App, TFile } from "obsidian";
import { parseBacklinkBlockConfig } from "codeblock/BacklinkBlockConfig";
import type { BacklinkBlockConfig } from "codeblock/BacklinkBlockConfig";
import { filterBacklinks } from "codeblock/backlinkFilter";
import { extractContext } from "graph/backlinkContext";
import type { ContextSnippet, LinkOffset } from "graph/backlinkContext";
import type { LinkGraphIndex } from "graph/LinkGraphIndex";
import type { ContextStyle, OrbitalSettings } from "types/index";

// ---------------------------------------------------------------------------
// Deps
// ---------------------------------------------------------------------------

/** Runtime dependencies injected by main.ts (mirrors the Relations deps shape). */
export interface BacklinkDeps {
	/** Plugin-scoped reverse link index (source of truth for backlinks). */
	index: LinkGraphIndex;
	/** Obsidian App — provides metadataCache, vault, workspace. */
	app: App;
	/** Returns current plugin settings (read live on each render/debounce). */
	getSettings: () => OrbitalSettings;
	/** Returns true for paths globally excluded by Orbital settings. */
	isExcluded: (path: string) => boolean;
}

/** Max sources read in context mode before a "… and N more" node is shown. */
const CONTEXT_CAP = 50;
/** Context snippet window (chars per side). */
const CONTEXT_WINDOW = 90;
/** hover-link event source tag (parity with RelationsPanel). */
const HOVER_SOURCE = "orbit";

// ---------------------------------------------------------------------------
// Augmented element helper — same cast pattern as RelationsPanel/TabBar
// ---------------------------------------------------------------------------

/**
 * Minimal shape for Obsidian's augmented HTMLElement helpers. Declared as a
 * standalone interface (not extending HTMLElement) to avoid conflicting
 * overload signatures in lib.dom.d.ts. Cast sites use `el as unknown as El`.
 */
interface AugmentedEl {
	createEl(
		tag: string,
		opts?: { text?: string; cls?: string; attr?: Record<string, string> },
	): HTMLElement;
	createDiv(opts?: { cls?: string; text?: string }): HTMLElement;
	createSpan(opts?: { cls?: string; text?: string }): HTMLElement;
	empty(): void;
}

// ---------------------------------------------------------------------------
// BacklinkCodeBlock
// ---------------------------------------------------------------------------

export class BacklinkCodeBlock extends MarkdownRenderChild {
	private readonly rawSource: string;
	private readonly sourcePath: string;
	private readonly deps: BacklinkDeps;
	/** Parsed once in onload(); never re-parsed on refresh. */
	private config!: BacklinkBlockConfig;

	constructor(
		containerEl: HTMLElement,
		rawSource: string,
		sourcePath: string,
		deps: BacklinkDeps,
	) {
		super(containerEl);
		this.rawSource = rawSource;
		this.sourcePath = sourcePath;
		this.deps = deps;
	}

	onload(): void {
		this.config = parseBacklinkBlockConfig(this.rawSource);

		const debouncer = debounce(
			(): void => {
				void this.render();
			},
			this.deps.getSettings().refreshDebounceMs,
			true,
		);
		this.register(() => debouncer.cancel());

		const { app } = this.deps;
		const trigger = (): void => {
			debouncer();
		};
		this.registerEvent(app.metadataCache.on("changed", trigger));
		this.registerEvent(app.vault.on("create", trigger));
		this.registerEvent(app.vault.on("delete", trigger));
		this.registerEvent(app.vault.on("rename", trigger));

		void this.render();
	}

	// -------------------------------------------------------------------------
	// Render
	// -------------------------------------------------------------------------

	/**
	 * (Re)build the whole block into containerEl. Any thrown error is contained
	 * as an inline error node so the rest of the note is unaffected.
	 */
	async render(): Promise<void> {
		const el = this.containerEl as unknown as AugmentedEl;
		el.empty();
		try {
			await this.renderBody(el);
		} catch (err) {
			el.empty();
			this.renderError(el, err);
		}
	}

	private async renderBody(el: AugmentedEl): Promise<void> {
		const { app, index, isExcluded } = this.deps;

		const subject = app.vault.getFileByPath(this.sourcePath);
		if (!subject) {
			this.renderEmpty(el, false);
			this.renderWarnings(el);
			return;
		}

		const sources = index.backlinksOf(this.sourcePath);
		const survivors = filterBacklinks(sources, this.sourcePath, this.config, {
			tagsOf: (path) => this.tagsOf(path),
			isExcluded,
		});

		this.renderHeader(el, survivors.length);

		if (survivors.length === 0) {
			this.renderEmpty(el, this.hasFilters());
		} else if (this.config.display === "context") {
			await this.renderContext(el, survivors, subject);
		} else {
			for (const path of survivors) this.renderCompactRow(el, path);
		}

		this.renderWarnings(el);
	}

	// -------------------------------------------------------------------------
	// Filter wiring
	// -------------------------------------------------------------------------

	/** Source tags WITH '#', lowercased — wired to getAllTags(getFileCache()). */
	private tagsOf(path: string): string[] {
		const { app } = this.deps;
		const file = app.vault.getFileByPath(path);
		if (!file) return [];
		const cache = app.metadataCache.getFileCache(file);
		if (!cache) return [];
		return (getAllTags(cache) ?? []).map((t) => t.toLowerCase());
	}

	private hasFilters(): boolean {
		const c = this.config;
		return (
			c.folderInclude.length > 0 ||
			c.folderExclude.length > 0 ||
			c.tagInclude.length > 0 ||
			c.tagExclude.length > 0
		);
	}

	/** Context style: block `style:` key overrides the plugin setting. */
	private effectiveStyle(): ContextStyle {
		return this.config.style ?? this.deps.getSettings().backlinkContextStyle;
	}

	/** Initial fold state: block `collapse:` key overrides the plugin setting. */
	private effectiveCollapsed(): boolean {
		return this.config.collapse ?? this.deps.getSettings().backlinkContextCollapse;
	}

	// -------------------------------------------------------------------------
	// Compact rendering
	// -------------------------------------------------------------------------

	private renderHeader(el: AugmentedEl, count: number): void {
		el.createDiv({ cls: "orbital-backlink-count", text: `Backlinks: ${count}` });
	}

	private renderEmpty(el: AugmentedEl, filtered: boolean): void {
		el.createDiv({
			cls: "orbital-backlink-empty",
			text: filtered ? "No backlinks matching filters." : "No backlinks.",
		});
	}

	private renderWarnings(el: AugmentedEl): void {
		if (this.config.warnings.length === 0) return;
		const notice = el.createEl("div", { cls: "orbital-backlink-notice" });
		for (const warning of this.config.warnings) {
			(notice as unknown as AugmentedEl).createDiv({
				cls: "orbital-backlink-notice-line",
				text: warning.message,
			});
		}
	}

	private renderCompactRow(el: AugmentedEl, path: string): void {
		const file = this.deps.app.vault.getFileByPath(path);
		const row = el.createEl("div", {
			cls: "tree-item nav-file-title is-clickable orbital-backlink-item",
			attr: { "data-path": path },
		});
		(row as unknown as AugmentedEl).createSpan({
			cls: "orbital-backlink-item-label",
			text: this.displayName(path, file),
		});
		this.wireOpen(row, path);
		this.wireHover(row, path);
	}

	// -------------------------------------------------------------------------
	// Context rendering
	// -------------------------------------------------------------------------

	private async renderContext(
		el: AugmentedEl,
		survivors: string[],
		subject: TFile,
	): Promise<void> {
		const style = this.effectiveStyle();
		const collapsed = this.effectiveCollapsed();
		const wrap = el.createDiv({
			cls: `orbital-backlink-context orbital-backlink-context--${style}`,
		}) as unknown as AugmentedEl;
		const capped = survivors.slice(0, CONTEXT_CAP);
		for (const path of capped) {
			await this.renderContextSource(wrap, path, subject, collapsed);
		}
		if (survivors.length > CONTEXT_CAP) {
			wrap.createDiv({
				cls: "orbital-backlink-more",
				text: `… and ${survivors.length - CONTEXT_CAP} more`,
			});
		}
	}

	private async renderContextSource(
		el: AugmentedEl,
		path: string,
		subject: TFile,
		collapsed: boolean,
	): Promise<void> {
		const { app } = this.deps;
		const file = app.vault.getFileByPath(path);
		if (!file) return;

		let content: string;
		try {
			content = await app.vault.cachedRead(file);
		} catch {
			// A single unreadable source is skipped; the block continues.
			return;
		}

		const offsets = this.subjectLinkOffsets(file, path, subject);
		if (offsets.length === 0) return;

		const snippets = extractContext(content, offsets, CONTEXT_WINDOW);
		if (snippets.length === 0) return;

		this.renderGroup(el, path, file, snippets, collapsed);
	}

	/** Link offsets in `file` whose link resolves to the subject note. */
	private subjectLinkOffsets(
		file: TFile,
		sourcePath: string,
		subject: TFile,
	): LinkOffset[] {
		const { app } = this.deps;
		const links = app.metadataCache.getFileCache(file)?.links ?? [];
		const offsets: LinkOffset[] = [];
		for (const link of links) {
			if (!link.link) continue;
			const dest = app.metadataCache.getFirstLinkpathDest(link.link, sourcePath);
			if (dest && dest.path === subject.path) {
				offsets.push({
					start: link.position.start.offset,
					end: link.position.end.offset,
				});
			}
		}
		return offsets;
	}

	private renderGroup(
		el: AugmentedEl,
		path: string,
		file: TFile,
		snippets: ContextSnippet[],
		collapsed: boolean,
	): void {
		const group = el.createEl("div", {
			cls: "search-result orbital-backlink-group"
				+ (collapsed ? " is-collapsed" : ""),
			attr: { "data-path": path },
		});
		const groupEl = group as unknown as AugmentedEl;

		// Title row: chevron + name. Clicking the title (or chevron) folds this
		// group — it does NOT open the note; opening is done from a context line.
		const title = groupEl.createEl("div", {
			cls: "search-result-file-title is-clickable orbital-backlink-group-title",
		});
		const titleEl = title as unknown as AugmentedEl;
		titleEl.createSpan({ cls: "orbital-backlink-chevron" });
		titleEl.createSpan({
			cls: "orbital-backlink-item-label",
			text: this.displayName(path, file),
		});
		// Occurrence count for this source (matches native Linked-mentions): the
		// number of links to the subject in this note = sum of per-line matchCount.
		const occurrences = snippets.reduce((n, s) => n + s.matchCount, 0);
		titleEl.createSpan({
			cls: "orbital-backlink-group-count",
			text: String(occurrences),
		});
		this.wireFold(title, group);
		this.wireHover(title, path);

		const matches = groupEl.createEl("div", { cls: "search-result-file-matches" });
		for (const snippet of snippets) {
			this.renderSnippet(matches, snippet, path);
		}
	}

	private renderSnippet(
		container: HTMLElement,
		snippet: ContextSnippet,
		path: string,
	): void {
		const row = (container as unknown as AugmentedEl).createEl("div", {
			cls: "search-result-file-match is-clickable orbital-backlink-snippet",
		});
		const rowEl = row as unknown as AugmentedEl;
		// Clicking a context line opens the source note scrolled to that line.
		this.registerDomEvent(row, "click", (evt) =>
			this.openPath(path, evt, snippet.lineIndex),
		);
		// The window centre (the link itself) is always highlighted. Repeated
		// occurrences in before/after are highlighted only when the line holds
		// more than one link to the subject (matchCount > 1).
		const highlightRepeats = snippet.matchCount > 1;
		this.appendText(rowEl, snippet.before, snippet.match, highlightRepeats);
		this.appendMatch(rowEl, snippet.match);
		this.appendText(rowEl, snippet.after, snippet.match, highlightRepeats);
	}

	private appendMatch(rowEl: AugmentedEl, match: string): void {
		if (match === "") return;
		rowEl.createSpan({
			cls: "search-result-file-matched-text orbital-backlink-match",
			text: match,
		});
	}

	/** Append `text`, highlighting occurrences of `match` when `highlight`. */
	private appendText(
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

	private renderError(el: AugmentedEl, err: unknown): void {
		const message = err instanceof Error ? err.message : String(err);
		el.createDiv({
			cls: "orbital-backlink-error",
			text: `Backlinks unavailable — ${message}`,
		});
	}

	// -------------------------------------------------------------------------
	// Shared interaction wiring
	// -------------------------------------------------------------------------

	private wireOpen(el: HTMLElement, path: string): void {
		this.registerDomEvent(el, "click", (evt) => this.openPath(path, evt));
	}

	/** Toggle a context group's folded state (pure DOM; not persisted). */
	private wireFold(titleEl: HTMLElement, group: HTMLElement): void {
		this.registerDomEvent(titleEl, "click", () => {
			group.classList.toggle("is-collapsed");
		});
	}

	private wireHover(el: HTMLElement, path: string): void {
		this.registerDomEvent(el, "mouseover", (evt) => {
			this.deps.app.workspace.trigger("hover-link", {
				event: evt,
				source: HOVER_SOURCE,
				hoverParent: this,
				targetEl: el,
				linktext: path,
				sourcePath: this.sourcePath,
			});
		});
	}

	private openPath(path: string, evt: MouseEvent, line?: number): void {
		// getLeaf picks the leaf; openLinkText takes no newLeaf arg (its 3rd param
		// is openViewState — passing a truthy newLeaf there throws). Mirrors
		// RelationsPanel.renderResolvedItem. leaf.openLinkText is not on the public
		// WorkspaceLeaf type, so it is accessed through a structural cast. When a
		// line is given (context-line click) it is passed via eState so the note
		// scrolls to the link; if the runtime ignores eState the note still opens.
		const leaf = this.deps.app.workspace.getLeaf(
			Keymap.isModEvent(evt),
		) as unknown as {
			openLinkText(
				linktext: string,
				sourcePath: string,
				openViewState?: { eState?: { line: number } },
			): void | Promise<void>;
		};
		if (line === undefined) {
			void leaf.openLinkText(path, this.sourcePath);
		} else {
			void leaf.openLinkText(path, this.sourcePath, { eState: { line } });
		}
	}

	private displayName(path: string, file: TFile | null): string {
		if (file) return file.basename;
		const base = path.split("/").pop() ?? path;
		return base.replace(/\.md$/, "");
	}
}
