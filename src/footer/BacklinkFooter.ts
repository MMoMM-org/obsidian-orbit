/**
 * BacklinkFooter — v1.2 auto-footer
 *
 * A BacklinkRenderChild whose config is derived from plugin settings rather than
 * parsed from codeblock source. Renders the context view (dense/cards) at the
 * end of a note. Unlike BacklinkCodeBlock it never subscribes to events — the
 * BacklinkFooterController owns its lifecycle and drives re-renders.
 */

import { BacklinkRenderChild } from "codeblock/BacklinkRenderChild";
import type { BacklinkDeps } from "codeblock/BacklinkRenderChild";
import type { BacklinkBlockConfig } from "codeblock/BacklinkBlockConfig";

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
	constructor(containerEl: HTMLElement, sourcePath: string, deps: BacklinkDeps) {
		super(containerEl, sourcePath, deps);
		this.config = buildFooterConfig();
	}

	onload(): void {
		void this.render();
	}
}
