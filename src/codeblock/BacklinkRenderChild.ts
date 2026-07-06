/**
 * BacklinkRenderChild — shared render core (v1.2)
 *
 * Base MarkdownRenderChild holding the entire backlinks render + interaction
 * pipeline, driven by a resolved BacklinkBlockConfig. Two subclasses feed it a
 * config from different sources:
 *   - BacklinkCodeBlock  — parses config from the `orbital-backlinks` codeblock.
 *   - BacklinkFooter     — builds a settings-derived config for the auto-footer.
 *
 * The base is source-agnostic: it never parses text and never subscribes to
 * events. Config assignment and live-refresh wiring belong to the subclass /
 * owning controller. This keeps one render path shared by codeblock and footer.
 *
 * See docs/XDD/specs/002-backlink-codeblock/solution.md (Runtime View).
 */

import { MarkdownRenderChild, Keymap, getAllTags } from "obsidian";
import type { App, TFile } from "obsidian";
import type { BacklinkBlockConfig } from "codeblock/BacklinkBlockConfig";
import { filterBacklinks } from "codeblock/backlinkFilter";
import { renderContextGroups } from "codeblock/backlinkContextRender";
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
// BacklinkRenderChild
// ---------------------------------------------------------------------------

export abstract class BacklinkRenderChild extends MarkdownRenderChild {
	protected readonly sourcePath: string;
	protected readonly deps: BacklinkDeps;
	/** Resolved config the render pipeline consumes; set by the subclass. */
	protected config!: BacklinkBlockConfig;

	constructor(containerEl: HTMLElement, sourcePath: string, deps: BacklinkDeps) {
		super(containerEl);
		this.sourcePath = sourcePath;
		this.deps = deps;
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
		// Delegate to the shared context renderer; the code block / footer always
		// use the compact window with no surrounding lines (the Context tab varies
		// these). Interaction is wired to this MarkdownRenderChild's lifecycle.
		await renderContextGroups(el, survivors, {
			app: this.deps.app,
			sourcePath: this.sourcePath,
			subject,
			style: this.effectiveStyle(),
			collapsed: this.effectiveCollapsed(),
			windowChars: CONTEXT_WINDOW,
			surroundingLines: false,
			cap: CONTEXT_CAP,
			register: (target, type, handler) => this.registerDomEvent(target, type, handler),
			open: (path, evt, line) => this.openPath(path, evt, line),
			hover: (target, path) => this.wireHover(target, path),
		});
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
