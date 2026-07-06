/**
 * BacklinkFooterManager — v1.2 auto-footer
 *
 * Unit tests for the reading-view post-processor path and the footer registry.
 * The live-preview CodeMirror block widget needs a real EditorView and is
 * verified live (see Hub.md) — here we cover the mode-agnostic logic: last-block
 * placement, gating, dedupe, in-place content refresh, and teardown.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { App, createMockTFile } from "../__mocks__/obsidian";
import type { TFile, ReferenceCache, CachedMetadata } from "../__mocks__/obsidian";
import { LinkGraphIndex } from "graph/LinkGraphIndex";
import type { MetadataCache as IndexMetadataCache } from "graph/LinkGraphIndex";
import { BacklinkFooterManager } from "footer/BacklinkFooterManager";
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
	manager: BacklinkFooterManager;
	app: App;
	settings: OrbitalSettings;
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
	return { manager: new BacklinkFooterManager(deps), app, settings, files };
}

/** Synthetic post-processor context: `lastBlock` decides if this el ends the note. */
function makeCtx(sourcePath: string, lastBlock: boolean): {
	sourcePath: string;
	getSectionInfo: () => { text: string; lineStart: number; lineEnd: number };
	addChild: (child: { load(): void }) => void;
} {
	// Doc has 3 lines; the "last" block ends on line 2, a non-last block on line 0.
	const text = "line a\nline b\nline c";
	const lineEnd = lastBlock ? 2 : 0;
	return {
		sourcePath,
		getSectionInfo: () => ({ text, lineStart: 0, lineEnd }),
		addChild: (child) => child.load(),
	};
}

/** Section element mounted in a parent, mirroring a preview sizer child. */
function makeSection(): { el: HTMLElement; parent: HTMLElement } {
	const parent = document.createElement("div");
	const el = document.createElement("div");
	parent.appendChild(el);
	return { el, parent };
}

function footerIn(parent: HTMLElement): HTMLElement | null {
	return parent.querySelector(":scope > .orbital-backlink-footer");
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("BacklinkFooterManager — reading-view post-processor", () => {
	it("appends a footer after the last content block", async () => {
		const { manager } = setup({ resolved: { "a.md": { "Subject.md": 1 } } });
		const { el, parent } = makeSection();

		manager.readingPostProcessor(el, makeCtx(SUBJECT, true) as never);
		await flush();

		const footer = footerIn(parent);
		expect(footer).not.toBeNull();
		expect(footer?.previousElementSibling).toBe(el); // sits right after the block
		expect(footer?.querySelector(".orbital-backlink-count")?.textContent).toBe("Backlinks: 1");
	});

	it("does not append on a non-last block", () => {
		const { manager } = setup({ resolved: { "a.md": { "Subject.md": 1 } } });
		const { el, parent } = makeSection();

		manager.readingPostProcessor(el, makeCtx(SUBJECT, false) as never);

		expect(footerIn(parent)).toBeNull();
	});

	it("shows 'No backlinks.' when the note has none", async () => {
		const { manager } = setup({ resolved: {} });
		const { el, parent } = makeSection();

		manager.readingPostProcessor(el, makeCtx(SUBJECT, true) as never);
		await flush();

		expect(footerIn(parent)?.querySelector(".orbital-backlink-count")?.textContent).toBe(
			"Backlinks: 0",
		);
		expect(footerIn(parent)?.querySelector(".orbital-backlink-empty")?.textContent).toBe(
			"No backlinks.",
		);
	});

	it("renders a context group with the surrounding snippet", async () => {
		const content = "See [[Subject]] here.";
		const { manager } = setup({
			resolved: { "a.md": { "Subject.md": 1 } },
			contents: { "a.md": content },
			linkCaches: { "a.md": [refAt(content, "[[Subject]]", "Subject")] },
			resolvesToSubject: true,
		});
		const { el, parent } = makeSection();

		manager.readingPostProcessor(el, makeCtx(SUBJECT, true) as never);
		await flush();

		expect(footerIn(parent)?.querySelectorAll(".orbital-backlink-group")).toHaveLength(1);
		expect(footerIn(parent)?.querySelector(".search-result-file-matched-text")?.textContent).toBe(
			"[[Subject]]",
		);
	});

	it("no-ops when the setting is off", () => {
		const { manager } = setup({
			resolved: { "a.md": { "Subject.md": 1 } },
			settings: { backlinkFooterEnabled: false },
		});
		const { el, parent } = makeSection();

		manager.readingPostProcessor(el, makeCtx(SUBJECT, true) as never);

		expect(footerIn(parent)).toBeNull();
	});

	it("skips globally excluded notes", () => {
		const { manager } = setup({
			resolved: { "a.md": { "Subject.md": 1 } },
			isExcluded: (p) => p === SUBJECT,
		});
		const { el, parent } = makeSection();

		manager.readingPostProcessor(el, makeCtx(SUBJECT, true) as never);

		expect(footerIn(parent)).toBeNull();
	});

	it("dedupes: a re-render of the last block leaves exactly one footer", async () => {
		const { manager } = setup({ resolved: { "a.md": { "Subject.md": 1 } } });
		const { el, parent } = makeSection();

		manager.readingPostProcessor(el, makeCtx(SUBJECT, true) as never);
		manager.readingPostProcessor(el, makeCtx(SUBJECT, true) as never);
		await flush();

		expect(parent.querySelectorAll(".orbital-backlink-footer")).toHaveLength(1);
	});
});

describe("BacklinkFooterManager — registry", () => {
	it("refreshAll() re-renders live footers after their backlinks change", async () => {
		const { manager, app, files } = setup({ resolved: { "a.md": { "Subject.md": 1 } } });
		const { el, parent } = makeSection();
		manager.readingPostProcessor(el, makeCtx(SUBJECT, true) as never);
		await flush();
		expect(footerIn(parent)?.querySelector(".orbital-backlink-count")?.textContent).toBe(
			"Backlinks: 1",
		);

		app.metadataCache.resolvedLinks = {
			"a.md": { "Subject.md": 1 },
			"b.md": { "Subject.md": 1 },
		};
		files.set("b.md", makeFile("b.md"));
		manager["deps"].index.buildFull();
		manager.refreshAll();
		await flush();

		expect(footerIn(parent)?.querySelector(".orbital-backlink-count")?.textContent).toBe(
			"Backlinks: 2",
		);
	});

	it("destroy() unloads live footers and removes their elements", async () => {
		const { manager } = setup({ resolved: { "a.md": { "Subject.md": 1 } } });
		const { el, parent } = makeSection();
		manager.readingPostProcessor(el, makeCtx(SUBJECT, true) as never);
		await flush();
		expect(footerIn(parent)).not.toBeNull();

		manager.destroy();

		expect(footerIn(parent)).toBeNull();
	});
});
