/**
 * Auto-footer — plugin integration (v1.2)
 *
 * Drives the real OrbitalPlugin.onload() wiring (not the controller in
 * isolation) to prove the footer appears end-to-end: layout-ready reconcile,
 * the settings gate, live-preview/reading sizer selection, and the layout-change
 * re-injection path. Mirrors the setup style of main.events.test.ts.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import {
	App,
	WorkspaceLeaf,
	createMockTFile,
	createMockMarkdownView,
} from "../__mocks__/obsidian";
import type { TFile } from "../__mocks__/obsidian";

const SUBJECT = "Subject.md";

async function makePlugin(app: App) {
	const { default: OrbitalPlugin } = await import("main");
	return new OrbitalPlugin(app as unknown as Parameters<typeof OrbitalPlugin>[0]);
}

/** App with one backlink (a.md → Subject.md) and a resolvable file table. */
function makeApp(): { app: App; files: Map<string, TFile> } {
	const app = new App();
	app.metadataCache.resolvedLinks = { "a.md": { "Subject.md": 1 } };
	app.metadataCache.unresolvedLinks = {};

	const files = new Map<string, TFile>([
		[SUBJECT, createMockTFile({ path: SUBJECT, basename: "Subject", extension: "md" })],
		["a.md", createMockTFile({ path: "a.md", basename: "a", extension: "md" })],
	]);
	vi.mocked(app.vault.getFileByPath).mockImplementation((p: string) => files.get(p) ?? null);
	vi.mocked(app.vault.cachedRead).mockResolvedValue("");
	return { app, files };
}

function leafFor(files: Map<string, TFile>, mode: "source" | "preview"): WorkspaceLeaf {
	const leaf = new WorkspaceLeaf();
	leaf.view = createMockMarkdownView({ file: files.get(SUBJECT) ?? null, mode });
	return leaf;
}

function footerIn(leaf: WorkspaceLeaf, sizerSel: string): HTMLElement | null {
	const view = leaf.view as unknown as { contentEl: HTMLElement };
	return view.contentEl.querySelector(`${sizerSel} > .orbital-backlink-footer`);
}

function handlerFor(onSpy: ReturnType<typeof vi.fn>, event: string): (() => void) | undefined {
	return onSpy.mock.calls.find((c) => c[0] === event)?.[1] as (() => void) | undefined;
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("auto-footer — plugin integration", () => {
	it("injects a footer into an open note at layout-ready when enabled", async () => {
		const { app, files } = makeApp();
		const leaf = leafFor(files, "preview");
		vi.mocked(app.workspace.getLeavesOfType).mockReturnValue([leaf]);

		const plugin = await makePlugin(app);
		vi.mocked(plugin.loadData).mockResolvedValue({ backlinkFooterEnabled: true });
		await plugin.onload();
		await Promise.resolve();

		const footer = footerIn(leaf, ".markdown-preview-sizer");
		expect(footer).not.toBeNull();
		expect(footer?.querySelector(".orbital-backlink-count")?.textContent).toBe("Backlinks: 1");
	});

	it("injects nothing when the footer setting is off (default)", async () => {
		const { app, files } = makeApp();
		const leaf = leafFor(files, "preview");
		vi.mocked(app.workspace.getLeavesOfType).mockReturnValue([leaf]);

		const plugin = await makePlugin(app);
		await plugin.onload();
		await Promise.resolve();

		expect(footerIn(leaf, ".markdown-preview-sizer")).toBeNull();
	});

	it("uses the CodeMirror sizer for a live-preview leaf", async () => {
		const { app, files } = makeApp();
		const leaf = leafFor(files, "source");
		vi.mocked(app.workspace.getLeavesOfType).mockReturnValue([leaf]);

		const plugin = await makePlugin(app);
		vi.mocked(plugin.loadData).mockResolvedValue({ backlinkFooterEnabled: true });
		await plugin.onload();
		await Promise.resolve();

		expect(footerIn(leaf, ".cm-sizer")).not.toBeNull();
		expect(footerIn(leaf, ".markdown-preview-sizer")).toBeNull();
	});

	it("re-injects on a layout-change event when a new leaf appears", async () => {
		const { app, files } = makeApp();
		vi.mocked(app.workspace.getLeavesOfType).mockReturnValue([]);

		const plugin = await makePlugin(app);
		vi.mocked(plugin.loadData).mockResolvedValue({ backlinkFooterEnabled: true });
		await plugin.onload();

		// A note opens after startup; the layout-change handler reconciles.
		const leaf = leafFor(files, "preview");
		vi.mocked(app.workspace.getLeavesOfType).mockReturnValue([leaf]);
		handlerFor(app.workspace.on, "layout-change")?.();
		await Promise.resolve();

		expect(footerIn(leaf, ".markdown-preview-sizer")).not.toBeNull();
	});

	it("tears every footer down on plugin unload", async () => {
		const { app, files } = makeApp();
		const leaf = leafFor(files, "preview");
		vi.mocked(app.workspace.getLeavesOfType).mockReturnValue([leaf]);

		const plugin = await makePlugin(app);
		vi.mocked(plugin.loadData).mockResolvedValue({ backlinkFooterEnabled: true });
		await plugin.onload();
		await Promise.resolve();
		expect(footerIn(leaf, ".markdown-preview-sizer")).not.toBeNull();

		plugin._runCleanup();

		expect(footerIn(leaf, ".markdown-preview-sizer")).toBeNull();
	});
});
