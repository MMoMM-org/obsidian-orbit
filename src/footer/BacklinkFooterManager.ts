/**
 * BacklinkFooterManager — v1.2 auto-footer
 *
 * Renders the auto-footer through the two mode-native Obsidian mechanisms, so it
 * always hugs the note's content (no scroll-past-end gap) and survives
 * re-renders:
 *   - Reading view → a markdown post-processor appends the footer after the last
 *     content block of the note.
 *   - Live preview / source → a CodeMirror block widget placed at the end of the
 *     document (inside the editor content flow, above the editor's bottom
 *     padding).
 *
 * The manager is also the footer registry: each live BacklinkFooter registers on
 * load and unregisters on unload, so refreshAll() can re-render them in place
 * when backlinks change anywhere in the vault (no widget/DOM rebuild needed).
 *
 * Lifecycle is owned by the hosts (post-processor addChild / CM widget destroy);
 * destroy() is a backstop that unloads any stragglers on plugin unload.
 */

import { editorInfoField } from "obsidian";
import type { MarkdownPostProcessorContext } from "obsidian";
import { Decoration, ViewPlugin, WidgetType } from "@codemirror/view";
import type { DecorationSet, EditorView, ViewUpdate } from "@codemirror/view";
import { StateEffect } from "@codemirror/state";
import type { Extension } from "@codemirror/state";
import { BacklinkFooter } from "footer/BacklinkFooter";
import type { FooterRegistry } from "footer/BacklinkFooter";
import type { BacklinkDeps } from "codeblock/BacklinkRenderChild";

/** Wrapper class on every footer element (styling + reading-view dedupe marker). */
const FOOTER_CLASS = "orbital-backlink-footer";

/** Dispatched to editors to force the decoration to rebuild (e.g. setting toggle). */
const refreshFooterEffect = StateEffect.define<null>();

/** Structural view surface the manager pokes for the settings-toggle refresh. */
interface MarkdownViewLike {
	editor?: { cm?: EditorView };
	previewMode?: { rerender(full?: boolean): void };
}

export class BacklinkFooterManager implements FooterRegistry {
	readonly deps: BacklinkDeps;
	private readonly footers = new Set<BacklinkFooter>();

	constructor(deps: BacklinkDeps) {
		this.deps = deps;
	}

	// -------------------------------------------------------------------------
	// Registry
	// -------------------------------------------------------------------------

	add(footer: BacklinkFooter): void {
		this.footers.add(footer);
	}

	remove(footer: BacklinkFooter): void {
		this.footers.delete(footer);
	}

	/** Re-render every live footer in place (backlinks may have changed). */
	refreshAll(): void {
		for (const footer of this.footers) void footer.render();
	}

	/**
	 * Rebuild footers across all open notes after the setting toggles: editors
	 * recompute their decoration; reading views re-run the post-processor.
	 */
	refreshHosts(): void {
		for (const leaf of this.deps.app.workspace.getLeavesOfType("markdown")) {
			const view = leaf.view as unknown as MarkdownViewLike;
			view.editor?.cm?.dispatch({ effects: refreshFooterEffect.of(null) });
			view.previewMode?.rerender(true);
		}
	}

	/** Unload any footers still registered (backstop for plugin unload). */
	destroy(): void {
		for (const footer of [...this.footers]) footer.unload();
		this.footers.clear();
	}

	/** Public for the module-level editor extension; the setting gate. */
	enabled(): boolean {
		return this.deps.getSettings().backlinkFooterEnabled;
	}

	/** Public for the module-level editor extension; markdown + not-excluded gate. */
	eligible(path: string | undefined | null): path is string {
		return (
			typeof path === "string" &&
			path.endsWith(".md") &&
			!this.deps.isExcluded(path)
		);
	}

	// -------------------------------------------------------------------------
	// Reading view — markdown post-processor
	// -------------------------------------------------------------------------

	/**
	 * Append the footer after the note's LAST content block. Obsidian calls this
	 * per rendered section; we act only on the section that nothing but blank
	 * lines follow, dedupe against a prior render, and tie the footer's lifecycle
	 * to the section via ctx.addChild.
	 */
	readonly readingPostProcessor = (
		el: HTMLElement,
		ctx: MarkdownPostProcessorContext,
	): void => {
		if (!this.enabled()) return;
		const path = ctx.sourcePath;
		const file = this.deps.app.vault.getFileByPath(path);
		if (!file || !this.eligible(file.path)) return;

		const info = ctx.getSectionInfo(el);
		if (!info) return;
		const after = info.text.split("\n").slice(info.lineEnd + 1).join("\n").trim();
		if (after !== "") return; // not the last content block

		const parent = el.parentElement;
		if (!parent) return;
		parent
			.querySelectorAll(`:scope > .${FOOTER_CLASS}`)
			.forEach((node) => node.remove());

		// ownerDocument keeps this correct in popout windows (and is test-safe).
		const footerEl = el.ownerDocument.createElement("div");
		footerEl.classList.add(FOOTER_CLASS);
		el.insertAdjacentElement("afterend", footerEl);

		const footer = new BacklinkFooter(footerEl, file.path, this.deps, this);
		ctx.addChild(footer);
	};

	// -------------------------------------------------------------------------
	// Live preview / source — CodeMirror block widget
	// -------------------------------------------------------------------------

	/** The editor extension: one block widget at the end of the document. */
	editorExtension(): Extension {
		return createFooterEditorExtension(this);
	}
}

// ---------------------------------------------------------------------------
// Live preview / source — CodeMirror block widget (module scope so the manager
// is a parameter, not a `this` alias captured inside nested classes)
// ---------------------------------------------------------------------------

function createFooterEditorExtension(mgr: BacklinkFooterManager): Extension {
	const footerByEl = new WeakMap<HTMLElement, BacklinkFooter>();

	class FooterWidget extends WidgetType {
		constructor(readonly sourcePath: string) {
			super();
		}

		eq(other: FooterWidget): boolean {
			return other.sourcePath === this.sourcePath;
		}

		toDOM(view: EditorView): HTMLElement {
			const el = view.dom.ownerDocument.createElement("div");
			el.classList.add(FOOTER_CLASS);
			const footer = new BacklinkFooter(el, this.sourcePath, mgr.deps, mgr);
			footerByEl.set(el, footer);
			footer.load();
			return el;
		}

		destroy(dom: HTMLElement): void {
			const footer = footerByEl.get(dom);
			if (footer) {
				footerByEl.delete(dom);
				footer.unload();
			}
		}

		// Let clicks/hovers reach the footer's own handlers, not the editor.
		ignoreEvent(): boolean {
			return true;
		}
	}

	const build = (view: EditorView): DecorationSet => {
		if (!mgr.enabled()) return Decoration.none;
		const file = view.state.field(editorInfoField, false)?.file ?? null;
		if (!file || !mgr.eligible(file.path)) return Decoration.none;
		const deco = Decoration.widget({
			widget: new FooterWidget(file.path),
			block: true,
			side: 1,
		});
		return Decoration.set([deco.range(view.state.doc.length)]);
	};

	return ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;

			constructor(view: EditorView) {
				this.decorations = build(view);
			}

			update(update: ViewUpdate): void {
				const forced = update.transactions.some((tr) =>
					tr.effects.some((e) => e.is(refreshFooterEffect)),
				);
				const prev = update.startState.field(editorInfoField, false)?.file ?? null;
				const cur = update.state.field(editorInfoField, false)?.file ?? null;
				if (update.docChanged || forced || prev !== cur) {
					this.decorations = build(update.view);
				}
			}
		},
		{ decorations: (value) => value.decorations },
	);
}
