/**
 * BacklinkCodeBlock — T2.1 / T2.2 / T2.3
 *
 * jsdom + obsidian-mock tests for the codeblock orchestrator. Behaviour is
 * asserted through the rendered DOM and the injected Obsidian mocks (workspace
 * open/hover, vault/metadata events). The three pure core modules are trusted
 * (covered by their own unit tests); here we verify the wiring, both display
 * modes, live refresh, error containment, and plugin registration.
 *
 * TDD: written before the orchestrator implementation (RED phase).
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import {
	App,
	Keymap,
	augmentEl,
	getAllTags,
	createMockTFile,
} from "../__mocks__/obsidian";
import type {
	TFile,
	CachedMetadata,
	ReferenceCache,
} from "../__mocks__/obsidian";
import { LinkGraphIndex } from "graph/LinkGraphIndex";
import type { MetadataCache as IndexMetadataCache } from "graph/LinkGraphIndex";
import { BacklinkCodeBlock } from "codeblock/BacklinkCodeBlock";
import type { BacklinkDeps } from "codeblock/BacklinkCodeBlock";
import * as ConfigMod from "codeblock/BacklinkBlockConfig";
import { DEFAULT_SETTINGS } from "types/index";
import type { OrbitalSettings } from "types/index";

// ---------------------------------------------------------------------------
// Fixtures / helpers
// ---------------------------------------------------------------------------

const SUBJECT = "Subject.md";

function baseName(path: string): string {
	return (path.split("/").pop() ?? path).replace(/\.md$/, "");
}

function makeFile(path: string): TFile {
	return createMockTFile({ path, basename: baseName(path), extension: "md" });
}

/** Build a ReferenceCache for `matchText` in `content` (first hit at/after `from`). */
function refAt(
	content: string,
	matchText: string,
	linkPath: string,
	from = 0,
): ReferenceCache {
	const start = content.indexOf(matchText, from);
	return {
		link: linkPath,
		position: {
			start: { offset: start },
			end: { offset: start + matchText.length },
		},
	};
}

function flush(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

function eventHandler(
	onFn: App["metadataCache"]["on"] | App["vault"]["on"],
	event: string,
): () => void {
	const call = vi.mocked(onFn).mock.calls.find((c) => c[0] === event);
	return call?.[1] as () => void;
}

interface SetupOptions {
	rawSource?: string;
	subjectPath?: string;
	/** resolvedLinks feeding the LinkGraphIndex (source → { dest: count }). */
	resolved?: Record<string, Record<string, number>>;
	/** cachedRead content per path (context mode). */
	contents?: Record<string, string>;
	/** metadataCache.getFileCache().links per path (context mode). */
	linkCaches?: Record<string, ReferenceCache[]>;
	/** getAllTags() output per path (tag filtering). */
	tagsByPath?: Record<string, string[]>;
	isExcluded?: (path: string) => boolean;
	settings?: Partial<OrbitalSettings>;
	/** When true, getFirstLinkpathDest resolves every link to the subject. */
	resolvesToSubject?: boolean;
}

function setup(opts: SetupOptions = {}): {
	block: BacklinkCodeBlock;
	container: HTMLElement;
	app: App;
	subjectFile: TFile;
	deps: BacklinkDeps;
} {
	const subjectPath = opts.subjectPath ?? SUBJECT;
	const app = new App();
	const resolved = opts.resolved ?? {};
	app.metadataCache.resolvedLinks = resolved;
	app.metadataCache.unresolvedLinks = {};

	const index = new LinkGraphIndex(
		app.metadataCache as unknown as IndexMetadataCache,
	);
	index.buildFull();

	const files = new Map<string, TFile>();
	const register = (path: string): void => {
		if (!files.has(path)) files.set(path, makeFile(path));
	};
	register(subjectPath);
	for (const [src, dests] of Object.entries(resolved)) {
		register(src);
		for (const dest of Object.keys(dests)) register(dest);
	}
	for (const p of Object.keys(opts.contents ?? {})) register(p);
	for (const p of Object.keys(opts.linkCaches ?? {})) register(p);

	vi.mocked(app.vault.getFileByPath).mockImplementation(
		(p: string) => files.get(p) ?? null,
	);

	const contents = opts.contents ?? {};
	vi.mocked(app.vault.cachedRead).mockImplementation(
		async (file: TFile) => contents[file.path] ?? "",
	);

	const linkCaches = opts.linkCaches ?? {};
	const tagsByPath = opts.tagsByPath ?? {};
	vi.mocked(app.metadataCache.getFileCache).mockImplementation(
		(file: TFile): CachedMetadata | null => {
			const links = linkCaches[file.path];
			const tags = tagsByPath[file.path];
			if (!links && !tags) return null;
			return { links, tags: tags?.map((t) => ({ tag: t })) };
		},
	);

	const subjectFile = files.get(subjectPath) as TFile;
	if (opts.resolvesToSubject) {
		vi.mocked(app.metadataCache.getFirstLinkpathDest).mockImplementation(
			() => subjectFile,
		);
	}

	if (Object.keys(tagsByPath).length > 0) {
		vi.mocked(getAllTags).mockImplementation(
			(cache: CachedMetadata) => cache?.tags?.map((t) => t.tag) ?? null,
		);
	}

	const settings: OrbitalSettings = { ...DEFAULT_SETTINGS, ...opts.settings };
	const deps: BacklinkDeps = {
		index,
		app,
		getSettings: () => settings,
		isExcluded: opts.isExcluded ?? ((): boolean => false),
	};

	const container = augmentEl(document.createElement("div"));
	const block = new BacklinkCodeBlock(
		container,
		opts.rawSource ?? "",
		subjectPath,
		deps,
	);
	return { block, container, app, subjectFile, deps };
}

afterEach(() => {
	vi.mocked(Keymap.isModEvent).mockReturnValue(false);
	vi.mocked(getAllTags).mockReset();
	vi.mocked(getAllTags).mockReturnValue(null);
});

// ---------------------------------------------------------------------------
// T2.1 — compact render + live refresh
// ---------------------------------------------------------------------------

describe("BacklinkCodeBlock — compact render", () => {
	it("renders the 'Backlinks: N' header and one clickable row per source", () => {
		const { block, container } = setup({
			resolved: { "a.md": { "Subject.md": 1 }, "b.md": { "Subject.md": 1 } },
		});
		block.onload();

		expect(container.querySelector(".orbital-backlink-count")?.textContent).toBe(
			"Backlinks: 2",
		);
		const items = container.querySelectorAll(".orbital-backlink-item");
		expect(items).toHaveLength(2);
		expect(
			items[0]?.querySelector(".orbital-backlink-item-label")?.textContent,
		).toBe("a");
		expect(items[0]?.getAttribute("data-path")).toBe("a.md");
	});

	it("opens the note in the current tab on a plain click", () => {
		const { block, container, app } = setup({
			resolved: { "a.md": { "Subject.md": 1 } },
		});
		block.onload();

		(container.querySelector(".orbital-backlink-item") as HTMLElement).click();

		expect(app.workspace.getLeaf).toHaveBeenCalledWith(false);
		const leaf = vi.mocked(app.workspace.getLeaf).mock.results[0]?.value;
		expect(leaf.openLinkText).toHaveBeenCalledWith("a.md", "Subject.md");
	});

	it("opens the note in a new tab on a mod-click", () => {
		vi.mocked(Keymap.isModEvent).mockReturnValue("tab");
		const { block, container, app } = setup({
			resolved: { "a.md": { "Subject.md": 1 } },
		});
		block.onload();

		(container.querySelector(".orbital-backlink-item") as HTMLElement).click();

		expect(app.workspace.getLeaf).toHaveBeenCalledWith("tab");
	});

	it("fires a hover-link event on mouseover", () => {
		const { block, container, app } = setup({
			resolved: { "a.md": { "Subject.md": 1 } },
		});
		block.onload();

		(container.querySelector(".orbital-backlink-item") as HTMLElement).dispatchEvent(
			new MouseEvent("mouseover"),
		);

		expect(app.workspace.trigger).toHaveBeenCalledWith(
			"hover-link",
			expect.objectContaining({
				source: "orbit",
				linktext: "a.md",
				sourcePath: "Subject.md",
			}),
		);
	});

	it("honors the global isExcluded predicate", () => {
		const { block, container } = setup({
			resolved: { "a.md": { "Subject.md": 1 }, "b.md": { "Subject.md": 1 } },
			isExcluded: (p) => p === "b.md",
		});
		block.onload();

		const items = container.querySelectorAll(".orbital-backlink-item");
		expect(items).toHaveLength(1);
		expect(items[0]?.getAttribute("data-path")).toBe("a.md");
	});

	it("applies tag include filters via getAllTags", () => {
		const { block, container } = setup({
			rawSource: "tag: #active",
			resolved: { "a.md": { "Subject.md": 1 }, "b.md": { "Subject.md": 1 } },
			tagsByPath: { "a.md": ["#active"], "b.md": ["#draft"] },
		});
		block.onload();

		const items = container.querySelectorAll(".orbital-backlink-item");
		expect(items).toHaveLength(1);
		expect(items[0]?.getAttribute("data-path")).toBe("a.md");
	});
});

describe("BacklinkCodeBlock — empty states & warnings", () => {
	it("shows 'No backlinks.' when there are no backlinks and no filters", () => {
		const { block, container } = setup({ resolved: {} });
		block.onload();

		expect(container.querySelector(".orbital-backlink-count")?.textContent).toBe(
			"Backlinks: 0",
		);
		expect(container.querySelector(".orbital-backlink-empty")?.textContent).toBe(
			"No backlinks.",
		);
	});

	it("shows 'No backlinks matching filters.' when filters remove every source", () => {
		const { block, container } = setup({
			rawSource: "folder: Deep",
			resolved: { "a.md": { "Subject.md": 1 } },
		});
		block.onload();

		expect(container.querySelector(".orbital-backlink-empty")?.textContent).toBe(
			"No backlinks matching filters.",
		);
	});

	it("renders parser warnings as a subtle inline notice", () => {
		const { block, container } = setup({
			rawSource: "sort: name\n",
			resolved: { "a.md": { "Subject.md": 1 } },
		});
		block.onload();

		const notice = container.querySelector(".orbital-backlink-notice");
		expect(notice).not.toBeNull();
		expect(notice?.textContent).toContain("unknown key 'sort'");
	});
});

describe("BacklinkCodeBlock — lifecycle & live refresh", () => {
	it("parses the config once, not on every re-render", () => {
		vi.useFakeTimers();
		const parseSpy = vi.spyOn(ConfigMod, "parseBacklinkBlockConfig");
		try {
			const { block, app } = setup({ resolved: { "a.md": { "Subject.md": 1 } } });
			block.onload();
			expect(parseSpy).toHaveBeenCalledTimes(1);

			eventHandler(app.metadataCache.on, "changed")();
			vi.advanceTimersByTime(DEFAULT_SETTINGS.refreshDebounceMs);
			expect(parseSpy).toHaveBeenCalledTimes(1);
		} finally {
			parseSpy.mockRestore();
			vi.useRealTimers();
		}
	});

	it("re-renders (debounced) when metadataCache fires 'changed'", () => {
		vi.useFakeTimers();
		try {
			const { block, app } = setup({ resolved: { "a.md": { "Subject.md": 1 } } });
			block.onload();

			vi.mocked(app.vault.getFileByPath).mockClear();
			eventHandler(app.metadataCache.on, "changed")();
			// Debounced: no immediate re-render.
			expect(app.vault.getFileByPath).not.toHaveBeenCalled();

			vi.advanceTimersByTime(DEFAULT_SETTINGS.refreshDebounceMs);
			expect(app.vault.getFileByPath).toHaveBeenCalled();
		} finally {
			vi.useRealTimers();
		}
	});

	it("subscribes to metadata + vault events via registerEvent and registers a debouncer canceller", () => {
		const { block, app } = setup({ resolved: { "a.md": { "Subject.md": 1 } } });
		block.onload();

		expect(block.registerEvent).toHaveBeenCalledTimes(4);
		expect(block.register).toHaveBeenCalled();
		expect(vi.mocked(app.vault.on).mock.calls.map((c) => c[0])).toEqual(
			expect.arrayContaining(["create", "delete", "rename"]),
		);
	});

	it("cancels the pending debounced render on unload (no leaked refresh)", () => {
		vi.useFakeTimers();
		try {
			const { block, app } = setup({ resolved: { "a.md": { "Subject.md": 1 } } });
			block.onload();

			vi.mocked(app.vault.getFileByPath).mockClear();
			eventHandler(app.metadataCache.on, "changed")();
			block._runCleanup();
			vi.advanceTimersByTime(1000);

			expect(app.vault.getFileByPath).not.toHaveBeenCalled();
		} finally {
			vi.useRealTimers();
		}
	});

	it("contains an unexpected render error as an inline node without throwing", async () => {
		const { block, container, app } = setup({
			resolved: { "a.md": { "Subject.md": 1 } },
		});
		vi.mocked(app.vault.getFileByPath).mockImplementation(() => {
			throw new Error("kaboom");
		});

		expect(() => block.onload()).not.toThrow();
		await flush();

		const error = container.querySelector(".orbital-backlink-error");
		expect(error).not.toBeNull();
		expect(error?.textContent).toContain("kaboom");
	});
});

// ---------------------------------------------------------------------------
// T2.2 — context render + soft cap
// ---------------------------------------------------------------------------

describe("BacklinkCodeBlock — context render", () => {
	it("renders a source group with one highlighted snippet per link line", async () => {
		const content = "See [[Subject]] here.";
		const { block, container } = setup({
			rawSource: "display: context",
			resolved: { "a.md": { "Subject.md": 1 } },
			contents: { "a.md": content },
			linkCaches: { "a.md": [refAt(content, "[[Subject]]", "Subject")] },
			resolvesToSubject: true,
		});
		block.onload();
		await flush();

		expect(container.querySelectorAll(".orbital-backlink-group")).toHaveLength(1);
		const highlights = container.querySelectorAll(".search-result-file-matched-text");
		expect(highlights).toHaveLength(1);
		expect(highlights[0]?.textContent).toBe("[[Subject]]");
	});

	it("renders one row with both occurrences highlighted for two links on one line", async () => {
		const content = "See [[Subject]] and [[Subject]] again.";
		const { block, container } = setup({
			rawSource: "display: context",
			resolved: { "a.md": { "Subject.md": 1 } },
			contents: { "a.md": content },
			linkCaches: {
				"a.md": [
					refAt(content, "[[Subject]]", "Subject", 0),
					refAt(content, "[[Subject]]", "Subject", content.indexOf("[[Subject]]") + 1),
				],
			},
			resolvesToSubject: true,
		});
		block.onload();
		await flush();

		expect(container.querySelectorAll(".orbital-backlink-snippet")).toHaveLength(1);
		expect(
			container.querySelectorAll(".search-result-file-matched-text"),
		).toHaveLength(2);
	});

	it("renders two snippet rows for links on two lines in one source", async () => {
		const content = "First [[Subject]] line.\nSecond [[Subject]] line.";
		const { block, container } = setup({
			rawSource: "display: context",
			resolved: { "a.md": { "Subject.md": 1 } },
			contents: { "a.md": content },
			linkCaches: {
				"a.md": [
					refAt(content, "[[Subject]]", "Subject", 0),
					refAt(content, "[[Subject]]", "Subject", content.indexOf("\n")),
				],
			},
			resolvesToSubject: true,
		});
		block.onload();
		await flush();

		expect(container.querySelectorAll(".orbital-backlink-group")).toHaveLength(1);
		expect(container.querySelectorAll(".orbital-backlink-snippet")).toHaveLength(2);
	});

	it("caps context at 50 sources and appends a '… and N more' node", async () => {
		const resolved: Record<string, Record<string, number>> = {};
		const contents: Record<string, string> = {};
		const linkCaches: Record<string, ReferenceCache[]> = {};
		for (let i = 0; i < 51; i++) {
			const p = `n${i}.md`;
			resolved[p] = { "Subject.md": 1 };
			contents[p] = "[[Subject]]";
			linkCaches[p] = [refAt("[[Subject]]", "[[Subject]]", "Subject")];
		}
		const { block, container } = setup({
			rawSource: "display: context",
			resolved,
			contents,
			linkCaches,
			resolvesToSubject: true,
		});
		block.onload();
		await flush();

		expect(container.querySelector(".orbital-backlink-count")?.textContent).toBe(
			"Backlinks: 51",
		);
		expect(container.querySelectorAll(".orbital-backlink-group")).toHaveLength(50);
		const more = container.querySelector(".orbital-backlink-more");
		expect(more?.textContent).toContain("1 more");
	});

	it("skips only the source whose cachedRead rejects, not the whole block", async () => {
		const content = "See [[Subject]] here.";
		const { block, container, app } = setup({
			rawSource: "display: context",
			resolved: { "a.md": { "Subject.md": 1 }, "b.md": { "Subject.md": 1 } },
			contents: { "b.md": content },
			linkCaches: {
				"a.md": [refAt(content, "[[Subject]]", "Subject")],
				"b.md": [refAt(content, "[[Subject]]", "Subject")],
			},
			resolvesToSubject: true,
		});
		vi.mocked(app.vault.cachedRead).mockImplementation(async (file: TFile) => {
			if (file.path === "a.md") throw new Error("unreadable");
			return content;
		});
		block.onload();
		await flush();

		const groups = container.querySelectorAll(".orbital-backlink-group");
		expect(groups).toHaveLength(1);
		expect(groups[0]?.getAttribute("data-path")).toBe("b.md");
		expect(container.querySelector(".orbital-backlink-error")).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// T2.3 — plugin registration
// ---------------------------------------------------------------------------

describe("BacklinkCodeBlock — plugin registration", () => {
	it("registers an 'orbital-backlinks' processor that mounts a BacklinkCodeBlock", async () => {
		const app = new App();
		const { default: OrbitalPlugin } = await import("main");
		const plugin = new OrbitalPlugin(
			app as unknown as Parameters<typeof OrbitalPlugin>[0],
		);
		await plugin.onload();

		const entry = vi
			.mocked(plugin.registerMarkdownCodeBlockProcessor)
			.mock.calls.find((c) => c[0] === "orbital-backlinks");
		expect(entry).toBeDefined();

		const handler = entry?.[1] as (
			source: string,
			el: HTMLElement,
			ctx: { sourcePath: string; addChild: (c: unknown) => void },
		) => void;
		const el = augmentEl(document.createElement("div"));
		const addChild = vi.fn();
		handler("", el, { sourcePath: "Note.md", addChild });

		expect(addChild).toHaveBeenCalledOnce();
		expect(addChild.mock.calls[0]?.[0]).toBeInstanceOf(BacklinkCodeBlock);
	});
});
