/**
 * BacklinkFooterController — v1.2 auto-footer
 *
 * jsdom + obsidian-mock tests for the footer reconciliation controller. Verifies
 * that footers are injected into the correct mode sizer (reading vs live
 * preview), gated by the setting and global exclusions, kept idempotent across
 * repeated reconciles, replaced on file/mode change, and fully torn down on
 * disable / leaf-close / destroy.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import {
	App,
	WorkspaceLeaf,
	createMockTFile,
	createMockMarkdownView,
} from "../__mocks__/obsidian";
import type { TFile, ReferenceCache, CachedMetadata } from "../__mocks__/obsidian";
import { LinkGraphIndex } from "graph/LinkGraphIndex";
import type { MetadataCache as IndexMetadataCache } from "graph/LinkGraphIndex";
import { BacklinkFooterController } from "footer/BacklinkFooterController";
import type { BacklinkDeps } from "codeblock/BacklinkRenderChild";
import { DEFAULT_SETTINGS } from "types/index";
import type { OrbitalSettings } from "types/index";

const SUBJECT = "Subject.md";

function baseName(path: string): string {
	return (path.split("/").pop() ?? path).replace(/\.md$/, "");
}

function makeFile(path: string, extension = "md"): TFile {
	return createMockTFile({ path, basename: baseName(path), extension });
}

function refAt(content: string, matchText: string, linkPath: string): ReferenceCache {
	const start = content.indexOf(matchText);
	return {
		link: linkPath,
		position: { start: { offset: start }, end: { offset: start + matchText.length } },
	};
}

function flush(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

interface SetupOptions {
	resolved?: Record<string, Record<string, number>>;
	contents?: Record<string, string>;
	linkCaches?: Record<string, ReferenceCache[]>;
	isExcluded?: (path: string) => boolean;
	settings?: Partial<OrbitalSettings>;
	resolvesToSubject?: boolean;
}

function setup(opts: SetupOptions = {}): {
	controller: BacklinkFooterController;
	app: App;
	settings: OrbitalSettings;
	deps: BacklinkDeps;
	files: Map<string, TFile>;
} {
	const app = new App();
	const resolved = opts.resolved ?? {};
	app.metadataCache.resolvedLinks = resolved;
	app.metadataCache.unresolvedLinks = {};

	const index = new LinkGraphIndex(app.metadataCache as unknown as IndexMetadataCache);
	index.buildFull();

	const files = new Map<string, TFile>();
	const register = (path: string): void => {
		if (!files.has(path)) files.set(path, makeFile(path));
	};
	register(SUBJECT);
	for (const [src, dests] of Object.entries(resolved)) {
		register(src);
		for (const dest of Object.keys(dests)) register(dest);
	}
	for (const p of Object.keys(opts.contents ?? {})) register(p);

	vi.mocked(app.vault.getFileByPath).mockImplementation((p: string) => files.get(p) ?? null);

	const contents = opts.contents ?? {};
	vi.mocked(app.vault.cachedRead).mockImplementation(
		async (file: TFile) => contents[file.path] ?? "",
	);

	const linkCaches = opts.linkCaches ?? {};
	vi.mocked(app.metadataCache.getFileCache).mockImplementation(
		(file: TFile): CachedMetadata | null => {
			const links = linkCaches[file.path];
			return links ? { links } : null;
		},
	);

	if (opts.resolvesToSubject) {
		const subjectFile = files.get(SUBJECT) as TFile;
		vi.mocked(app.metadataCache.getFirstLinkpathDest).mockImplementation(() => subjectFile);
	}

	const settings: OrbitalSettings = {
		...DEFAULT_SETTINGS,
		backlinkFooterEnabled: true,
		...opts.settings,
	};
	const deps: BacklinkDeps = {
		index,
		app,
		getSettings: () => settings,
		isExcluded: opts.isExcluded ?? ((): boolean => false),
	};

	return { controller: new BacklinkFooterController(deps), app, settings, deps, files };
}

/** Build a workspace leaf holding a markdown view for `subjectPath`. */
function leafFor(
	files: Map<string, TFile>,
	subjectPath = SUBJECT,
	mode: "source" | "preview" = "preview",
): WorkspaceLeaf {
	const leaf = new WorkspaceLeaf();
	leaf.view = createMockMarkdownView({ file: files.get(subjectPath) ?? null, mode });
	return leaf;
}

function mountLeaves(app: App, leaves: WorkspaceLeaf[]): void {
	vi.mocked(app.workspace.getLeavesOfType).mockReturnValue(leaves);
}

function footerIn(leaf: WorkspaceLeaf, sizerSel: string): HTMLElement | null {
	const view = leaf.view as unknown as { contentEl: HTMLElement };
	return view.contentEl.querySelector(`${sizerSel} > .orbital-backlink-footer`);
}

afterEach(() => {
	vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------

describe("BacklinkFooterController — injection", () => {
	it("injects a footer into the reading-view sizer in preview mode", async () => {
		const { controller, app, files } = setup({
			resolved: { "a.md": { "Subject.md": 1 } },
		});
		const leaf = leafFor(files, SUBJECT, "preview");
		mountLeaves(app, [leaf]);

		controller.reconcile();
		await flush();

		const footer = footerIn(leaf, ".markdown-preview-sizer");
		expect(footer).not.toBeNull();
		expect(footer?.querySelector(".orbital-backlink-count")?.textContent).toBe("Backlinks: 1");
		expect(footerIn(leaf, ".cm-sizer")).toBeNull();
	});

	it("injects into the CodeMirror sizer in source / live-preview mode", () => {
		const { controller, app, files } = setup({ resolved: { "a.md": { "Subject.md": 1 } } });
		const leaf = leafFor(files, SUBJECT, "source");
		mountLeaves(app, [leaf]);

		controller.reconcile();

		expect(footerIn(leaf, ".cm-sizer")).not.toBeNull();
		expect(footerIn(leaf, ".markdown-preview-sizer")).toBeNull();
	});

	it("shows 'No backlinks.' when the note has none (so the footer is visibly working)", async () => {
		const { controller, app, files } = setup({ resolved: {} });
		const leaf = leafFor(files);
		mountLeaves(app, [leaf]);

		controller.reconcile();
		await flush();

		const footer = footerIn(leaf, ".markdown-preview-sizer");
		expect(footer?.querySelector(".orbital-backlink-count")?.textContent).toBe("Backlinks: 0");
		expect(footer?.querySelector(".orbital-backlink-empty")?.textContent).toBe("No backlinks.");
	});

	it("renders a context group with the surrounding snippet", async () => {
		const content = "See [[Subject]] here.";
		const { controller, app, files } = setup({
			resolved: { "a.md": { "Subject.md": 1 } },
			contents: { "a.md": content },
			linkCaches: { "a.md": [refAt(content, "[[Subject]]", "Subject")] },
			resolvesToSubject: true,
		});
		const leaf = leafFor(files);
		mountLeaves(app, [leaf]);

		controller.reconcile();
		await flush();

		const footer = footerIn(leaf, ".markdown-preview-sizer");
		expect(footer?.querySelectorAll(".orbital-backlink-group")).toHaveLength(1);
		expect(footer?.querySelector(".search-result-file-matched-text")?.textContent).toBe(
			"[[Subject]]",
		);
	});
});

describe("BacklinkFooterController — gating", () => {
	it("injects nothing when the setting is off", () => {
		const { controller, app, files } = setup({
			resolved: { "a.md": { "Subject.md": 1 } },
			settings: { backlinkFooterEnabled: false },
		});
		const leaf = leafFor(files);
		mountLeaves(app, [leaf]);

		controller.reconcile();

		expect(footerIn(leaf, ".markdown-preview-sizer")).toBeNull();
	});

	it("removes existing footers when the setting is turned off and reconciled", () => {
		const { controller, app, files, settings } = setup({
			resolved: { "a.md": { "Subject.md": 1 } },
		});
		const leaf = leafFor(files);
		mountLeaves(app, [leaf]);
		controller.reconcile();
		expect(footerIn(leaf, ".markdown-preview-sizer")).not.toBeNull();

		settings.backlinkFooterEnabled = false;
		controller.reconcile();

		expect(footerIn(leaf, ".markdown-preview-sizer")).toBeNull();
	});

	it("skips globally excluded notes", () => {
		const { controller, app, files } = setup({
			resolved: { "a.md": { "Subject.md": 1 } },
			isExcluded: (p) => p === SUBJECT,
		});
		const leaf = leafFor(files);
		mountLeaves(app, [leaf]);

		controller.reconcile();

		expect(footerIn(leaf, ".markdown-preview-sizer")).toBeNull();
	});

	it("skips a view with no file", () => {
		const { controller, app } = setup({ resolved: { "a.md": { "Subject.md": 1 } } });
		const leaf = new WorkspaceLeaf();
		leaf.view = createMockMarkdownView({ file: null });
		mountLeaves(app, [leaf]);

		controller.reconcile();

		expect(footerIn(leaf, ".markdown-preview-sizer")).toBeNull();
	});
});

describe("BacklinkFooterController — reconciliation", () => {
	it("is idempotent — reconciling twice keeps exactly one footer", () => {
		const { controller, app, files } = setup({ resolved: { "a.md": { "Subject.md": 1 } } });
		const leaf = leafFor(files);
		mountLeaves(app, [leaf]);

		controller.reconcile();
		controller.reconcile();

		const view = leaf.view as unknown as { contentEl: HTMLElement };
		expect(view.contentEl.querySelectorAll(".orbital-backlink-footer")).toHaveLength(1);
	});

	it("replaces the footer when the leaf's file changes", async () => {
		const { controller, app, files } = setup({
			resolved: { "a.md": { "Subject.md": 1 }, "b.md": { "Other.md": 1 } },
		});
		files.set("Other.md", makeFile("Other.md"));
		const leaf = leafFor(files, SUBJECT);
		mountLeaves(app, [leaf]);
		controller.reconcile();
		await flush();
		expect(footerIn(leaf, ".markdown-preview-sizer")?.querySelector(".orbital-backlink-count")?.textContent).toBe("Backlinks: 1");

		// Same leaf now shows a different note.
		(leaf.view as unknown as { file: TFile }).file = files.get("Other.md") as TFile;
		controller.reconcile();
		await flush();

		const view = leaf.view as unknown as { contentEl: HTMLElement };
		expect(view.contentEl.querySelectorAll(".orbital-backlink-footer")).toHaveLength(1);
		expect(footerIn(leaf, ".markdown-preview-sizer")?.querySelector(".orbital-backlink-count")?.textContent).toBe("Backlinks: 1");
	});

	it("moves the footer to the other sizer when the view mode switches", () => {
		const { controller, app, files } = setup({ resolved: { "a.md": { "Subject.md": 1 } } });
		const leaf = leafFor(files, SUBJECT, "preview");
		mountLeaves(app, [leaf]);
		controller.reconcile();
		expect(footerIn(leaf, ".markdown-preview-sizer")).not.toBeNull();

		(leaf.view as unknown as { _mode: string })._mode = "source";
		controller.reconcile();

		expect(footerIn(leaf, ".markdown-preview-sizer")).toBeNull();
		expect(footerIn(leaf, ".cm-sizer")).not.toBeNull();
	});

	it("removes a footer when its leaf is closed", () => {
		const { controller, app, files } = setup({ resolved: { "a.md": { "Subject.md": 1 } } });
		const leaf = leafFor(files);
		mountLeaves(app, [leaf]);
		controller.reconcile();
		const view = leaf.view as unknown as { contentEl: HTMLElement };
		expect(view.contentEl.querySelector(".orbital-backlink-footer")).not.toBeNull();

		mountLeaves(app, []); // leaf gone
		controller.reconcile();

		expect(view.contentEl.querySelector(".orbital-backlink-footer")).toBeNull();
	});

	it("re-injects the footer if the sizer was rebuilt and dropped it", () => {
		const { controller, app, files } = setup({ resolved: { "a.md": { "Subject.md": 1 } } });
		const leaf = leafFor(files);
		mountLeaves(app, [leaf]);
		controller.reconcile();

		// Simulate Obsidian rebuilding the preview: the footer element is detached.
		footerIn(leaf, ".markdown-preview-sizer")?.remove();
		controller.reconcile();

		expect(footerIn(leaf, ".markdown-preview-sizer")).not.toBeNull();
	});
});

describe("BacklinkFooterController — content refresh & teardown", () => {
	it("rerender() re-renders live footers after their backlinks change", async () => {
		const { controller, app, files } = setup({ resolved: { "a.md": { "Subject.md": 1 } } });
		const leaf = leafFor(files);
		mountLeaves(app, [leaf]);
		controller.reconcile();
		await flush();
		expect(footerIn(leaf, ".markdown-preview-sizer")?.querySelector(".orbital-backlink-count")?.textContent).toBe("Backlinks: 1");

		// A second note now links to the subject; rebuild the index and refresh.
		app.metadataCache.resolvedLinks = {
			"a.md": { "Subject.md": 1 },
			"b.md": { "Subject.md": 1 },
		};
		files.set("b.md", makeFile("b.md"));
		controller["deps"].index.buildFull();
		controller.rerender();
		await flush();

		expect(footerIn(leaf, ".markdown-preview-sizer")?.querySelector(".orbital-backlink-count")?.textContent).toBe("Backlinks: 2");
	});

	it("destroy() removes every footer and unloads its child", () => {
		const { controller, app, files } = setup({ resolved: { "a.md": { "Subject.md": 1 } } });
		const leaf = leafFor(files);
		mountLeaves(app, [leaf]);
		controller.reconcile();
		const view = leaf.view as unknown as { contentEl: HTMLElement };
		expect(view.contentEl.querySelector(".orbital-backlink-footer")).not.toBeNull();

		controller.destroy();

		expect(view.contentEl.querySelector(".orbital-backlink-footer")).toBeNull();
	});
});
