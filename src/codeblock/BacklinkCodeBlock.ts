/**
 * BacklinkCodeBlock — T2.1 / T2.2
 *
 * MarkdownRenderChild orchestrator for the `orbital-backlinks` codeblock. Parses
 * the block config from its source text once, then delegates the entire render +
 * interaction pipeline to the shared BacklinkRenderChild base. Owns its own
 * live-refresh wiring: a single per-instance trailing debouncer driven by
 * metadata/vault change events, cancelled on unload.
 *
 * Lifecycle:
 *   - onload(): parse config ONCE, do the first render, subscribe to change
 *     events through this.registerEvent, and drive re-renders through a single
 *     per-instance trailing debouncer (cancelled via this.register on unload).
 *
 * See docs/XDD/specs/002-backlink-codeblock/solution.md (Runtime View).
 */

import { debounce } from "obsidian";
import { parseBacklinkBlockConfig } from "codeblock/BacklinkBlockConfig";
import { BacklinkRenderChild } from "codeblock/BacklinkRenderChild";
import type { BacklinkDeps } from "codeblock/BacklinkRenderChild";

// Re-exported so existing importers (main.ts, tests) keep their import site.
export type { BacklinkDeps } from "codeblock/BacklinkRenderChild";

export class BacklinkCodeBlock extends BacklinkRenderChild {
	private readonly rawSource: string;

	constructor(
		containerEl: HTMLElement,
		rawSource: string,
		sourcePath: string,
		deps: BacklinkDeps,
	) {
		super(containerEl, sourcePath, deps);
		this.rawSource = rawSource;
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
}
