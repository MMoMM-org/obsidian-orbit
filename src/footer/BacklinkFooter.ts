/**
 * BacklinkFooter — v1.2 auto-footer
 *
 * A BacklinkRenderChild whose config is derived from plugin settings rather than
 * parsed from codeblock source. Renders the context view (dense/cards) at the
 * end of a note. It renders through two mode-native hosts:
 *   - reading view  → a markdown post-processor appends it after the last block.
 *   - live preview  → a CodeMirror block widget places it at the document end.
 * Both hosts load/unload this child; on load it registers with the manager so
 * the manager can re-render it when backlinks change, and on unload it
 * unregisters and removes its own element.
 */

import { BacklinkRenderChild } from "codeblock/BacklinkRenderChild";
import type { BacklinkDeps } from "codeblock/BacklinkRenderChild";
import type { BacklinkBlockConfig } from "codeblock/BacklinkBlockConfig";

/** Registry the footer joins on load so the manager can drive re-renders. */
export interface FooterRegistry {
	add(footer: BacklinkFooter): void;
	remove(footer: BacklinkFooter): void;
}

/**
 * Config for the auto-footer: always context mode, no filters, no warnings.
 * `style` and `collapse` are left undefined so the base's effectiveStyle /
 * effectiveCollapsed fall back to the live plugin settings.
 */
export function buildFooterConfig(): BacklinkBlockConfig {
	return {
		display: "context",
		folderInclude: [],
		folderExclude: [],
		tagInclude: [],
		tagExclude: [],
		warnings: [],
	};
}

export class BacklinkFooter extends BacklinkRenderChild {
	private readonly registry: FooterRegistry;

	constructor(
		containerEl: HTMLElement,
		sourcePath: string,
		deps: BacklinkDeps,
		registry: FooterRegistry,
	) {
		super(containerEl, sourcePath, deps);
		this.config = buildFooterConfig();
		this.registry = registry;
	}

	onload(): void {
		this.registry.add(this);
		void this.render();
	}

	onunload(): void {
		this.registry.remove(this);
		// Reading-view footers are siblings we inserted; live-preview widget DOM is
		// owned by CodeMirror. Removing here is correct for the former and a no-op
		// double-remove for the latter.
		this.containerEl.remove();
	}
}
