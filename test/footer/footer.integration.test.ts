/**
 * Auto-footer — plugin integration (v1.2)
 *
 * Drives the real OrbitalPlugin.onload() to verify the footer is wired the
 * mode-native way: a markdown post-processor (reading view) and a CodeMirror
 * editor extension (live preview) are both registered, the post-processor
 * honours the setting gate, and footers are torn down on unload.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { App, createMockTFile } from "../__mocks__/obsidian";
import type { TFile } from "../__mocks__/obsidian";

const SUBJECT = "Subject.md";

async function makePlugin(app: App) {
	const { default: OrbitalPlugin } = await import("main");
	return new OrbitalPlugin(app as unknown as Parameters<typeof OrbitalPlugin>[0]);
}

function makeApp(): App {
	const app = new App();
	app.metadataCache.resolvedLinks = { "a.md": { "Subject.md": 1 } };
	app.metadataCache.unresolvedLinks = {};
	const files = new Map<string, TFile>([
		[SUBJECT, createMockTFile({ path: SUBJECT, basename: "Subject", extension: "md" })],
		["a.md", createMockTFile({ path: "a.md", basename: "a", extension: "md" })],
	]);
	vi.mocked(app.vault.getFileByPath).mockImplementation((p: string) => files.get(p) ?? null);
	vi.mocked(app.vault.cachedRead).mockResolvedValue("");
	return app;
}

/** A synthetic last-block post-processor context for SUBJECT. */
function lastBlockCtx() {
	return {
		sourcePath: SUBJECT,
		getSectionInfo: () => ({ text: "only line", lineStart: 0, lineEnd: 0 }),
		addChild: (child: { load(): void }) => child.load(),
	};
}

function flush(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("auto-footer — plugin integration", () => {
	it("registers a markdown post-processor and a CodeMirror editor extension", async () => {
		const plugin = await makePlugin(makeApp());
		await plugin.onload();

		expect(plugin.registerMarkdownPostProcessor).toHaveBeenCalledOnce();
		expect(plugin.registerEditorExtension).toHaveBeenCalledOnce();
	});

	it("the registered post-processor renders a footer when enabled", async () => {
		const plugin = await makePlugin(makeApp());
		vi.mocked(plugin.loadData).mockResolvedValue({ backlinkFooterEnabled: true });
		await plugin.onload();

		const handler = vi.mocked(plugin.registerMarkdownPostProcessor).mock.calls[0]?.[0];
		const parent = document.createElement("div");
		const el = document.createElement("div");
		parent.appendChild(el);
		handler?.(el, lastBlockCtx() as never);
		await flush();

		const footer = parent.querySelector(":scope > .orbital-backlink-footer");
		expect(footer).not.toBeNull();
		expect(footer?.querySelector(".orbital-backlink-count")?.textContent).toBe("Backlinks: 1");
	});

	it("the post-processor renders nothing when the setting is off (default)", async () => {
		const plugin = await makePlugin(makeApp());
		await plugin.onload();

		const handler = vi.mocked(plugin.registerMarkdownPostProcessor).mock.calls[0]?.[0];
		const parent = document.createElement("div");
		const el = document.createElement("div");
		parent.appendChild(el);
		handler?.(el, lastBlockCtx() as never);
		await flush();

		expect(parent.querySelector(".orbital-backlink-footer")).toBeNull();
	});

	it("tears every footer down on plugin unload", async () => {
		const plugin = await makePlugin(makeApp());
		vi.mocked(plugin.loadData).mockResolvedValue({ backlinkFooterEnabled: true });
		await plugin.onload();

		const handler = vi.mocked(plugin.registerMarkdownPostProcessor).mock.calls[0]?.[0];
		const parent = document.createElement("div");
		const el = document.createElement("div");
		parent.appendChild(el);
		handler?.(el, lastBlockCtx() as never);
		await flush();
		expect(parent.querySelector(".orbital-backlink-footer")).not.toBeNull();

		plugin._runCleanup();

		expect(parent.querySelector(".orbital-backlink-footer")).toBeNull();
	});
});
