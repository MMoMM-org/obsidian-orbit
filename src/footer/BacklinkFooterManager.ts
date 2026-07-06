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
import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import type { DecorationSet } from "@codemirror/view";
import { StateEffect, StateField } from "@codemirror/state";
import type { EditorState, Extension } from "@codemirror/state";
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
		if (!file || !this.eligible(file.path)) {
			this.debug("skip: not eligible", path);
			return;
		}

		const info = ctx.getSectionInfo(el);
		if (!info) {
			this.debug("skip: no sectionInfo", el.tagName, el.className);
			return;
		}
		const lines = info.text.split("\n");
		const after = lines.slice(info.lineEnd + 1).join("\n").trim();
		this.debug("block", {
			tag: el.tagName,
			lineEnd: info.lineEnd,
			total: lines.length,
			lastBlock: after === "",
			attached: el.isConnected,
		});
		if (after !== "") return; // not the last content block

		const footerEl = el.ownerDocument.createElement("div");
		footerEl.classList.add(FOOTER_CLASS);

		const parent = el.parentElement;
		if (parent) {
			// Clean: place the footer as a sibling right after the last block.
			parent
				.querySelectorAll(`:scope > .${FOOTER_CLASS}`)
				.forEach((node) => node.remove());
			el.insertAdjacentElement("afterend", footerEl);
		} else {
			// A section can be post-processed before it is attached; append into
			// the section wrapper so it travels with it when Obsidian attaches it.
			el.querySelectorAll(`:scope > .${FOOTER_CLASS}`).forEach((node) => node.remove());
			el.appendChild(footerEl);
		}

		const footer = new BacklinkFooter(footerEl, file.path, this.deps, this);
		ctx.addChild(footer);
		this.debug("footer appended", { path: file.path, viaParent: parent !== null });
	};

	/** Gated diagnostics — enable Settings → Orbital → Advanced → Debug logging. */
	private debug(...args: unknown[]): void {
		if (this.deps.getSettings().debugLogging) {
			console.debug("[Orbital footer]", ...args);
		}
	}

	// -------------------------------------------------------------------------
	// Live preview / source — CodeMirror block widget
	// -------------------------------------------------------------------------

	/** The editor extension: one block widget at the end of the document. */
	editorExtension(): Extension {
		return createFooterEditorExtension(this);
	}
}

// ---------------------------------------------------------------------------
// Live preview / source — CodeMirror block widget.
//
// Block decorations MUST be provided by a StateField (not a ViewPlugin) —
// CodeMirror computes block heights before plugins run and throws otherwise.
// Module scope keeps the manager a parameter, not a captured `this` alias.
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

	const build = (state: EditorState): DecorationSet => {
		if (!mgr.enabled()) return Decoration.none;
		const file = state.field(editorInfoField, false)?.file ?? null;
		if (!file || !mgr.eligible(file.path)) return Decoration.none;
		const deco = Decoration.widget({
			widget: new FooterWidget(file.path),
			block: true,
			side: 1,
		});
		// Block widget at the document end — inside the content flow, above the
		// editor's scroll-past-end padding, so it hugs the last line.
		return Decoration.set([deco.range(state.doc.length)]);
	};

	return StateField.define<DecorationSet>({
		create: (state) => build(state),
		update: (value, tr) => {
			const forced = tr.effects.some((e) => e.is(refreshFooterEffect));
			const prev = tr.startState.field(editorInfoField, false)?.file ?? null;
			const cur = tr.state.field(editorInfoField, false)?.file ?? null;
			// Only the doc end position or eligibility can change what we render;
			// a non-doc transaction leaves the widget where it is.
			if (tr.docChanged || forced || prev !== cur) return build(tr.state);
			return value;
		},
		provide: (field) => EditorView.decorations.from(field),
	});
}
