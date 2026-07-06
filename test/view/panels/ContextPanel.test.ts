/**
 * ContextPanel — the Context sidebar tab.
 *
 * jsdom + obsidian-mock tests for the active-note backlinks-with-context panel:
 * empty states, the toolbar (collapse-all / sort / style / search), sorting,
 * search filtering, and the surrounding-lines context amount. Rendering itself
 * is shared with the code block (covered there); here we verify the panel's
 * wiring and options.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import {
	App,
	Keymap,
	augmentEl,
	createMockTFile,
} from "../../__mocks__/obsidian";
import type { TFile, ReferenceCache, CachedMetadata } from "../../__mocks__/obsidian";
import { LinkGraphIndex } from "graph/LinkGraphIndex";
import type { MetadataCache as IndexMetadataCache } from "graph/LinkGraphIndex";
import { ContextPanel } from "view/panels/ContextPanel";
import type { ContextPanelDeps } from "view/panels/ContextPanel";
import { DEFAULT_SETTINGS } from "types/index";
import type { OrbitalSettings, ContextStyle, ContextSort } from "types/index";

const SUBJECT = "Subject.md";

function baseName(path: string): string {
	return (path.split("/").pop() ?? path).replace(/\.md$/, "");
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
	mtimes?: Record<string, number>;
	settings?: Partial<OrbitalSettings>;
	resolvesToSubject?: boolean;
	sort?: ContextSort;
	style?: ContextStyle;
	search?: string;
	collapsedAll?: boolean;
}

function setup(opts: SetupOptions = {}) {
	const app = new App();
	const resolved = opts.resolved ?? {};
	app.metadataCache.resolvedLinks = resolved;
	app.metadataCache.unresolvedLinks = {};

	const index = new LinkGraphIndex(app.metadataCache as unknown as IndexMetadataCache);
	index.buildFull();

	const files = new Map<string, TFile>();
	const register = (path: string): void => {
		if (!files.has(path)) {
			files.set(path, createMockTFile({
				path,
				basename: baseName(path),
				extension: "md",
				stat: { mtime: opts.mtimes?.[path] ?? 1000 },
			}));
		}
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

	const settings: OrbitalSettings = { ...DEFAULT_SETTINGS, ...opts.settings };
	const state = {
		style: opts.style ?? settings.contextTabStyle,
		sort: opts.sort ?? settings.contextTabSort,
		search: opts.search ?? "",
		collapsedAll: opts.collapsedAll ?? settings.contextTabCollapse,
	};
	const refresh = vi.fn();

	const deps: ContextPanelDeps = {
		index,
		app,
		getSettings: () => settings,
		isExcluded: () => false,
		registerDomEvent: (el, type, handler) => el.addEventListener(type, handler as EventListener),
		getStyle: () => state.style,
		setStyle: (s) => { state.style = s; },
		getSort: () => state.sort,
		setSort: (s) => { state.sort = s; },
		getSearchQuery: () => state.search,
		setSearchQuery: (q) => { state.search = q; },
		getCollapsedAll: () => state.collapsedAll,
		setCollapsedAll: (c) => { state.collapsedAll = c; },
		requestRefresh: refresh,
	};

	const container = augmentEl(document.createElement("div"));
	const panel = new ContextPanel(deps);
	return { panel, container, app, deps, state, refresh, files };
}

/** One-line context fixture: source `path` links to Subject once. */
function ctxFixture(paths: string[], opts: Partial<SetupOptions> = {}) {
	const resolved: Record<string, Record<string, number>> = {};
	const contents: Record<string, string> = {};
	const linkCaches: Record<string, ReferenceCache[]> = {};
	for (const p of paths) {
		const content = `See [[Subject]] in ${baseName(p)}.`;
		resolved[p] = { "Subject.md": 1 };
		contents[p] = content;
		linkCaches[p] = [refAt(content, "[[Subject]]", "Subject")];
	}
	return setup({ resolved, contents, linkCaches, resolvesToSubject: true, ...opts });
}

afterEach(() => {
	vi.mocked(Keymap.isModEvent).mockReturnValue(false);
});

describe("ContextPanel — empty states", () => {
	it("prompts to open a note when there is no active file", () => {
		const { panel, container } = setup();
		panel.render(container, null);
		expect(container.querySelector(".orbital-context-empty")?.textContent).toContain(
			"Open a note",
		);
	});

	it("shows 'No backlinks.' when the active note has none", () => {
		const { panel, container } = setup({ resolved: {} });
		panel.render(container, SUBJECT);
		expect(container.querySelector(".orbital-context-empty")?.textContent).toBe("No backlinks.");
	});
});

describe("ContextPanel — rendering", () => {
	it("renders the toolbar with the backlink count and a group per source", async () => {
		const { panel, container } = ctxFixture(["a.md", "b.md"]);
		panel.render(container, SUBJECT);
		await flush();

		expect(container.querySelector(".orbital-context-count")?.textContent).toBe("2");
		expect(container.querySelectorAll(".orbital-backlink-group")).toHaveLength(2);
		expect(container.querySelector(".search-result-file-matched-text")?.textContent).toBe(
			"[[Subject]]",
		);
	});

	it("uses the toolbar style (cards default) for the context wrapper", async () => {
		const { panel, container } = ctxFixture(["a.md"]);
		panel.render(container, SUBJECT);
		await flush();
		expect(container.querySelector(".orbital-backlink-context--cards")).not.toBeNull();
	});

	it("starts groups collapsed when collapsed-all is on", async () => {
		const { panel, container } = ctxFixture(["a.md"], { collapsedAll: true });
		panel.render(container, SUBJECT);
		await flush();
		expect(
			container.querySelector(".orbital-backlink-group")?.classList.contains("is-collapsed"),
		).toBe(true);
	});

	it("renders dimmed surrounding lines when the amount is 'surroundingLines'", async () => {
		const content = "Lead line here.\nSee [[Subject]] now.\nTrail line here.";
		const { panel, container } = setup({
			resolved: { "a.md": { "Subject.md": 1 } },
			contents: { "a.md": content },
			linkCaches: { "a.md": [refAt(content, "[[Subject]]", "Subject")] },
			resolvesToSubject: true,
			settings: { contextTabAmount: "surroundingLines" },
		});
		panel.render(container, SUBJECT);
		await flush();

		const lines = container.querySelectorAll(".orbital-backlink-context-line");
		expect(Array.from(lines).map((l) => l.textContent)).toEqual([
			"Lead line here.",
			"Trail line here.",
		]);
	});
});

describe("ContextPanel — sorting", () => {
	it("sorts by most recently modified by default", async () => {
		const { panel, container } = ctxFixture(["old.md", "new.md"], {
			mtimes: { "old.md": 100, "new.md": 900 },
		});
		panel.render(container, SUBJECT);
		await flush();

		const groups = container.querySelectorAll(".orbital-backlink-group");
		expect(groups[0]?.getAttribute("data-path")).toBe("new.md");
		expect(groups[1]?.getAttribute("data-path")).toBe("old.md");
	});

	it("sorts alphabetically by name when sort=name", async () => {
		const { panel, container } = ctxFixture(["zebra.md", "apple.md"], { sort: "name" });
		panel.render(container, SUBJECT);
		await flush();

		const groups = container.querySelectorAll(".orbital-backlink-group");
		expect(groups[0]?.getAttribute("data-path")).toBe("apple.md");
		expect(groups[1]?.getAttribute("data-path")).toBe("zebra.md");
	});

	it("sorts by mention count when sort=mentions", async () => {
		const content = "[[Subject]] and [[Subject]] twice";
		const { panel, container } = setup({
			resolved: { "one.md": { "Subject.md": 1 }, "two.md": { "Subject.md": 2 } },
			contents: { "one.md": "[[Subject]] once", "two.md": content },
			linkCaches: {
				"one.md": [refAt("[[Subject]] once", "[[Subject]]", "Subject")],
				"two.md": [
					{ link: "Subject", position: { start: { offset: 0 }, end: { offset: 11 } } },
					{ link: "Subject", position: { start: { offset: 16 }, end: { offset: 27 } } },
				],
			},
			resolvesToSubject: true,
			sort: "mentions",
		});
		panel.render(container, SUBJECT);
		await flush();

		const groups = container.querySelectorAll(".orbital-backlink-group");
		expect(groups[0]?.getAttribute("data-path")).toBe("two.md"); // 2 mentions first
	});
});

describe("ContextPanel — toolbar interactions", () => {
	it("collapse-all button flips the collapsed-all state and refreshes", () => {
		const { panel, container, state, refresh } = ctxFixture(["a.md"]);
		panel.render(container, SUBJECT);

		const btn = container.querySelector("[aria-label='Collapse all']") as HTMLElement;
		btn.click();

		expect(state.collapsedAll).toBe(true);
		expect(refresh).toHaveBeenCalled();
	});

	it("sort button cycles recent → mentions → name", () => {
		const { panel, container, state } = ctxFixture(["a.md"]);
		panel.render(container, SUBJECT);
		(container.querySelector("[aria-label^='Sort']") as HTMLElement).click();
		expect(state.sort).toBe("mentions");
	});

	it("style button toggles cards ↔ dense", () => {
		const { panel, container, state } = ctxFixture(["a.md"], { style: "cards" });
		panel.render(container, SUBJECT);
		(container.querySelector("[aria-label^='Style']") as HTMLElement).click();
		expect(state.style).toBe("dense");
	});

	it("search input filters sources by note name", async () => {
		const { panel, container } = ctxFixture(["alpha.md", "beta.md"], { search: "alph" });
		panel.render(container, SUBJECT);
		await flush();

		const groups = container.querySelectorAll(".orbital-backlink-group");
		expect(groups).toHaveLength(1);
		expect(groups[0]?.getAttribute("data-path")).toBe("alpha.md");
	});
});

describe("ContextPanel — navigation", () => {
	it("opens the source note at the clicked line", async () => {
		const { panel, container, app } = ctxFixture(["a.md"]);
		panel.render(container, SUBJECT);
		await flush();

		(container.querySelector(".orbital-backlink-snippet") as HTMLElement).click();
		const leaf = vi.mocked(app.workspace.getLeaf).mock.results[0]?.value;
		expect(leaf.openLinkText).toHaveBeenCalledWith("a.md", SUBJECT, { eState: { line: 0 } });
	});
});
