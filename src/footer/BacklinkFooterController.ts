/**
 * BacklinkFooterController — v1.2 auto-footer
 *
 * Owns the lifecycle of auto-appended backlink footers across all open markdown
 * leaves, for BOTH reading view and live preview. Mirrors Obsidian's native
 * "Backlinks in document": the footer is injected into the mode's content
 * sizer — `.markdown-preview-sizer` (reading) or `.cm-sizer` (source/live
 * preview) — so it scrolls with the note.
 *
 * Reconciliation is idempotent and event-driven (no polling):
 *   - reconcile(): ensure exactly one footer per eligible leaf, in the right
 *     sizer for its current mode. Wired to file-open / active-leaf-change /
 *     layout-change and the settings toggle. Cheap when nothing changed.
 *   - rerender(): re-render existing footers' contents (backlinks changed).
 *     Wired (debounced) to metadata/vault change events.
 *   - destroy(): tear every footer down. Registered via plugin.register so it
 *     runs on plugin unload — nothing leaks, the vault is left untouched.
 *
 * A leaf is ineligible (and its footer removed) when the setting is off, the
 * view has no markdown file, or the file is globally excluded.
 */

import { MarkdownView } from "obsidian";
import type { TFile, WorkspaceLeaf } from "obsidian";
import { BacklinkFooter } from "footer/BacklinkFooter";
import type { BacklinkDeps } from "codeblock/BacklinkRenderChild";

/** Wrapper class on the injected footer element (styling + reconcile marker). */
const FOOTER_CLASS = "orbital-backlink-footer";

/** One live footer, keyed by the leaf it decorates. */
interface FooterRecord {
	leaf: WorkspaceLeaf;
	sizer: HTMLElement;
	footerEl: HTMLElement;
	child: BacklinkFooter;
	path: string;
	mode: string;
}

/** Minimal augmented-element surface used to build the footer wrapper. */
interface AugmentedEl {
	createDiv(opts?: { cls?: string }): HTMLElement;
}

export class BacklinkFooterController {
	private readonly deps: BacklinkDeps;
	private records: FooterRecord[] = [];

	constructor(deps: BacklinkDeps) {
		this.deps = deps;
	}

	// -------------------------------------------------------------------------
	// Public API
	// -------------------------------------------------------------------------

	/**
	 * Ensure the set of footers matches the current workspace + setting: create
	 * missing ones, replace stale ones (file/mode/sizer changed or detached),
	 * and remove footers for leaves that are gone or no longer eligible.
	 */
	reconcile(): void {
		if (!this.deps.getSettings().backlinkFooterEnabled) {
			this.destroy();
			return;
		}

		const leaves = this.markdownLeaves();
		const kept = new Set<FooterRecord>();

		for (const leaf of leaves) {
			const view = leaf.view;
			if (!(view instanceof MarkdownView)) continue;

			const file = view.file;
			const mode = view.getMode();
			const sizer = file ? this.sizerFor(view, mode) : null;

			if (!file || file.extension !== "md" || this.deps.isExcluded(file.path) || !sizer) {
				this.removeForLeaf(leaf);
				continue;
			}

			let rec = this.records.find((r) => r.leaf === leaf);
			if (rec && !this.recordValid(rec, file.path, mode, sizer)) {
				this.destroyRecord(rec);
				rec = undefined;
			}
			if (!rec) {
				rec = this.createRecord(leaf, sizer, file, mode);
			}
			kept.add(rec);
		}

		// Drop footers whose leaf vanished or turned ineligible above.
		for (const rec of [...this.records]) {
			if (!kept.has(rec)) this.destroyRecord(rec);
		}
	}

	/** Re-render every live footer's contents (its backlinks may have changed). */
	rerender(): void {
		for (const rec of this.records) void rec.child.render();
	}

	/** Remove and unload every footer. Idempotent; safe on plugin unload. */
	destroy(): void {
		for (const rec of [...this.records]) this.destroyRecord(rec);
	}

	// -------------------------------------------------------------------------
	// Private — record lifecycle
	// -------------------------------------------------------------------------

	private createRecord(
		leaf: WorkspaceLeaf,
		sizer: HTMLElement,
		file: TFile,
		mode: string,
	): FooterRecord {
		// Clear any orphan footer left behind by a wiped-and-rebuilt sizer.
		sizer.querySelectorAll(`:scope > .${FOOTER_CLASS}`).forEach((el) => el.remove());

		const footerEl = (sizer as unknown as AugmentedEl).createDiv({ cls: FOOTER_CLASS });
		const child = new BacklinkFooter(footerEl, file.path, this.deps);
		child.load();

		const rec: FooterRecord = { leaf, sizer, footerEl, child, path: file.path, mode };
		this.records.push(rec);
		return rec;
	}

	private destroyRecord(rec: FooterRecord): void {
		rec.child.unload();
		rec.footerEl.remove();
		this.records = this.records.filter((r) => r !== rec);
	}

	private removeForLeaf(leaf: WorkspaceLeaf): void {
		const rec = this.records.find((r) => r.leaf === leaf);
		if (rec) this.destroyRecord(rec);
	}

	/** A record is still valid iff its file, mode, and sizer are unchanged and its element is still mounted. */
	private recordValid(
		rec: FooterRecord,
		path: string,
		mode: string,
		sizer: HTMLElement,
	): boolean {
		return (
			rec.path === path &&
			rec.mode === mode &&
			rec.sizer === sizer &&
			sizer.contains(rec.footerEl)
		);
	}

	// -------------------------------------------------------------------------
	// Private — workspace/DOM lookup
	// -------------------------------------------------------------------------

	private markdownLeaves(): WorkspaceLeaf[] {
		return this.deps.app.workspace.getLeavesOfType("markdown");
	}

	/**
	 * The content sizer to inject the footer into for a view's current mode:
	 * reading view → `.markdown-preview-sizer`; source / live preview →
	 * `.cm-sizer`. Returns null when the sizer isn't in the DOM yet.
	 */
	private sizerFor(view: MarkdownView, mode: string): HTMLElement | null {
		const selector = mode === "preview" ? ".markdown-preview-sizer" : ".cm-sizer";
		return view.contentEl.querySelector<HTMLElement>(selector);
	}
}
