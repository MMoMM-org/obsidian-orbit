/**
 * ContextPanel — the Context sidebar tab.
 *
 * Shows the ACTIVE note's backlinks with surrounding context (the same dense /
 * cards rendering as the code block and footer, via the shared
 * renderContextGroups), so you can see at a glance where the note you're reading
 * is referenced. A toolbar mirrors Obsidian's Linked-mentions: collapse-all,
 * sort, dense/cards toggle, and a search box.
 *
 * Pure render: `render(container, activePath)` rebuilds the subtree each call.
 * Toolbar state (style / sort / search / collapsed-all) is view-owned and passed
 * in; changing it calls requestRefresh() to re-render. The "context amount" (how
 * much surrounding text) comes from settings.
 */

import { Keymap, setIcon } from "obsidian";
import type { App } from "obsidian";
import type { LinkGraphIndex } from "graph/LinkGraphIndex";
import { windowCharsFor, includesSurroundingLines } from "graph/backlinkContext";
import { renderContextGroups } from "codeblock/backlinkContextRender";
import type { ContextStyle, ContextSort, OrbitalSettings } from "types/index";

/** Max sources rendered before a "… and N more" node (parity with the code block). */
const CONTEXT_CAP = 50;
/** hover-link event source tag (parity with the code block / RelationsPanel). */
const HOVER_SOURCE = "orbit";

interface AugmentedEl {
	createEl(
		tag: string,
		opts?: { text?: string; cls?: string; attr?: Record<string, string> },
	): HTMLElement;
	createDiv(opts?: {
		cls?: string;
		text?: string;
		attr?: Record<string, string>;
	}): HTMLElement;
	createSpan(opts?: {
		cls?: string;
		text?: string;
		attr?: Record<string, string>;
	}): HTMLElement;
}

export interface ContextPanelDeps {
	index: LinkGraphIndex;
	app: App;
	getSettings: () => OrbitalSettings;
	isExcluded: (path: string) => boolean;
	registerDomEvent: <K extends keyof HTMLElementEventMap>(
		el: HTMLElement,
		type: K,
		handler: (ev: HTMLElementEventMap[K]) => void,
	) => void;
	/** View-owned toolbar state (defaults seeded from settings). */
	getStyle: () => ContextStyle;
	setStyle: (style: ContextStyle) => void;
	getSort: () => ContextSort;
	setSort: (sort: ContextSort) => void;
	getSearchQuery: () => string;
	setSearchQuery: (query: string) => void;
	getCollapsedAll: () => boolean;
	setCollapsedAll: (collapsed: boolean) => void;
	/** Re-render the panel (after a toolbar change). */
	requestRefresh: () => void;
}

/** Sort modes cycle in this order when the sort button is clicked. */
const SORT_CYCLE: ContextSort[] = ["recent", "mentions", "name"];
const SORT_ICON: Record<ContextSort, string> = {
	recent: "clock",
	mentions: "hash",
	name: "case-sensitive",
};
const SORT_LABEL: Record<ContextSort, string> = {
	recent: "Sort: recently modified",
	mentions: "Sort: mention count",
	name: "Sort: name",
};

export class ContextPanel {
	constructor(private readonly deps: ContextPanelDeps) {}

	render(container: HTMLElement, activePath: string | null): void {
		const el = container as unknown as AugmentedEl;

		if (activePath === null) {
			this.renderEmpty(el, "Open a note to see where it's referenced.");
			return;
		}
		const subject = this.deps.app.vault.getFileByPath(activePath);
		if (!subject || this.deps.isExcluded(activePath)) {
			this.renderEmpty(el, "Open a note to see where it's referenced.");
			return;
		}

		const query = this.deps.getSearchQuery().trim().toLowerCase();
		const sources = this.deps.index
			.backlinksOf(activePath)
			.filter((p) => !this.deps.isExcluded(p));
		const sorted = this.sortSources(sources, activePath);
		const survivors = query
			? sorted.filter((p) => this.basename(p).toLowerCase().includes(query))
			: sorted;

		this.renderToolbar(el, survivors.length);

		if (survivors.length === 0) {
			this.renderEmpty(
				el,
				query ? "No backlinks match your search." : "No backlinks.",
			);
			return;
		}

		const settings = this.deps.getSettings();
		const amount = settings.contextTabAmount;
		// Fire-and-forget: the container is already mounted; groups fill in as the
		// sources are read. Errors are contained to a single skipped source.
		void renderContextGroups(el, survivors, {
			app: this.deps.app,
			sourcePath: activePath,
			subject,
			style: this.deps.getStyle(),
			collapsed: this.deps.getCollapsedAll(),
			windowChars: windowCharsFor(amount),
			surroundingLines: includesSurroundingLines(amount),
			cap: CONTEXT_CAP,
			register: (target, type, handler) => this.deps.registerDomEvent(target, type, handler),
			open: (path, evt, line) => this.openPath(path, activePath, evt, line),
			hover: (target, path) => this.wireHover(target, path, activePath),
		});
	}

	// -------------------------------------------------------------------------
	// Toolbar
	// -------------------------------------------------------------------------

	private renderToolbar(el: AugmentedEl, count: number): void {
		const header = el.createDiv({ cls: "orbital-context-header" });
		const headerEl = header as unknown as AugmentedEl;
		headerEl.createSpan({ cls: "orbital-context-title", text: "Backlinks" });
		headerEl.createSpan({ cls: "orbital-context-count", text: String(count) });

		const tools = headerEl.createDiv({ cls: "orbital-context-tools" });
		const toolsEl = tools as unknown as AugmentedEl;

		this.toolButton(toolsEl, "list-collapse", "Collapse all", () => {
			this.deps.setCollapsedAll(!this.deps.getCollapsedAll());
			this.deps.requestRefresh();
		});

		const sort = this.deps.getSort();
		this.toolButton(toolsEl, SORT_ICON[sort], SORT_LABEL[sort], () => {
			const next = SORT_CYCLE[(SORT_CYCLE.indexOf(sort) + 1) % SORT_CYCLE.length]!;
			this.deps.setSort(next);
			this.deps.requestRefresh();
		});

		const style = this.deps.getStyle();
		const styleIcon = style === "cards" ? "layout-grid" : "list";
		this.toolButton(toolsEl, styleIcon, `Style: ${style}`, () => {
			this.deps.setStyle(style === "cards" ? "dense" : "cards");
			this.deps.requestRefresh();
		});

		this.renderSearch(headerEl);
	}

	private toolButton(
		tools: AugmentedEl,
		icon: string,
		label: string,
		onClick: () => void,
	): void {
		const btn = tools.createEl("button", {
			cls: "orbital-context-tool clickable-icon",
			attr: { "aria-label": label },
		});
		setIcon(btn, icon);
		this.deps.registerDomEvent(btn, "click", () => onClick());
	}

	private renderSearch(header: AugmentedEl): void {
		const wrap = header.createDiv({ cls: "orbital-context-search" });
		const input = (wrap as unknown as AugmentedEl).createEl("input", {
			cls: "orbital-context-search-input",
			attr: { type: "text", placeholder: "Filter by note name…", value: this.deps.getSearchQuery() },
		}) as HTMLInputElement;
		this.deps.registerDomEvent(input, "input", () => {
			this.deps.setSearchQuery(input.value);
			this.deps.requestRefresh();
		});
	}

	private renderEmpty(el: AugmentedEl, text: string): void {
		el.createDiv({ cls: "orbital-context-empty orbital-panel-placeholder", text });
	}

	// -------------------------------------------------------------------------
	// Sorting
	// -------------------------------------------------------------------------

	private sortSources(sources: string[], subjectPath: string): string[] {
		const sort = this.deps.getSort();
		const copy = [...sources];
		if (sort === "name") {
			copy.sort((a, b) => this.basename(a).localeCompare(this.basename(b)));
		} else if (sort === "mentions") {
			copy.sort((a, b) => this.mentionCount(b, subjectPath) - this.mentionCount(a, subjectPath));
		} else {
			copy.sort((a, b) => this.mtime(b) - this.mtime(a)); // recent first
		}
		return copy;
	}

	private mentionCount(source: string, subjectPath: string): number {
		return this.deps.app.metadataCache.resolvedLinks?.[source]?.[subjectPath] ?? 0;
	}

	private mtime(path: string): number {
		return this.deps.app.vault.getFileByPath(path)?.stat.mtime ?? 0;
	}

	private basename(path: string): string {
		const file = this.deps.app.vault.getFileByPath(path);
		if (file) return file.basename;
		return (path.split("/").pop() ?? path).replace(/\.md$/, "");
	}

	// -------------------------------------------------------------------------
	// Interaction
	// -------------------------------------------------------------------------

	private openPath(path: string, sourcePath: string, evt: MouseEvent, line?: number): void {
		const leaf = this.deps.app.workspace.getLeaf(Keymap.isModEvent(evt)) as unknown as {
			openLinkText(
				linktext: string,
				sourcePath: string,
				openViewState?: { eState?: { line: number } },
			): void | Promise<void>;
		};
		if (line === undefined) {
			void leaf.openLinkText(path, sourcePath);
		} else {
			void leaf.openLinkText(path, sourcePath, { eState: { line } });
		}
	}

	private wireHover(el: HTMLElement, path: string, sourcePath: string): void {
		this.deps.registerDomEvent(el, "mouseover", (evt) => {
			this.deps.app.workspace.trigger("hover-link", {
				event: evt,
				source: HOVER_SOURCE,
				hoverParent: this,
				targetEl: el,
				linktext: path,
				sourcePath,
			});
		});
	}
}
