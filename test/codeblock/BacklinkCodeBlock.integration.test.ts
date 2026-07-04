/**
 * BacklinkCodeBlock — T3.1 End-to-end integration test
 *
 * Exercises the feature through the REGISTERED processor + plugin wiring.
 * The block is NOT created via `new BacklinkCodeBlock(...)` directly; instead
 * it is produced by the handler captured from OrbitalPlugin's
 * registerMarkdownCodeBlockProcessor and then mounted by calling onload().
 *
 * Integration delta over the unit tests (BacklinkCodeBlock.test.ts):
 *   - Uses the plugin's _buildBacklinkDeps() factory (real _index, isExcluded).
 *   - The LinkGraphIndex is built from app.metadataCache.resolvedLinks at
 *     plugin.onload() time, exercising the full plugin→index→block wiring.
 *   - Both plugin and block event handlers are registered; tests identify the
 *     block's own debounced trigger as the last handler for each event name.
 *   - Live-refresh tests mutate the index directly before advancing timers,
 *     proving the block re-renders with the updated graph state.
 *   - Cleanup tests verify the debouncer is cancelled (block.register(cancel)).
 *
 * Note: no mock extension was required; all necessary obsidian mock capabilities
 * (metadataCache.on, vault.on, getFileByPath, cachedRead, getAllTags, etc.)
 * already exist in test/__mocks__/obsidian.ts.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import {
	App,
	augmentEl,
	getAllTags,
	createMockTFile,
} from "../__mocks__/obsidian";
import type { TFile, CachedMetadata, ReferenceCache } from "../__mocks__/obsidian";
import { BacklinkCodeBlock } from "codeblock/BacklinkCodeBlock";
import { DEFAULT_SETTINGS } from "types/index";

// ---------------------------------------------------------------------------
// Local helpers (self-contained; duplicated names from unit tests are
// intentionally kept separate to preserve independence)
// ---------------------------------------------------------------------------

function baseName(path: string): string {
	return (path.split("/").pop() ?? path).replace(/\.md$/, "");
}

function makeFile(path: string): TFile {
	return createMockTFile({ path, basename: baseName(path), extension: "md" });
}

/** Build a ReferenceCache entry for `matchText` in `content`. */
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

/**
 * Return the LAST handler registered for `event` on a vi.fn() event `on` spy.
 *
 * After plugin.onload(), the plugin registers its own handlers. After
 * block.onload(), the block registers its own handlers. Since block.onload()
 * happens after plugin.onload(), the block's handlers are always the most
 * recently registered ones — so "last" reliably isolates the block's trigger.
 */
function lastHandler(
	onFn: App["metadataCache"]["on"] | App["vault"]["on"],
	event: string,
): () => void {
	const calls = vi.mocked(onFn).mock.calls;
	for (let i = calls.length - 1; i >= 0; i--) {
		if (calls[i]?.[0] === event) {
			return calls[i]![1] as () => void;
		}
	}
	throw new Error(`No handler registered for event "${event}"`);
}

/** Flush async microtask chains (needed for context-mode renders with cachedRead). */
function flush(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

// ---------------------------------------------------------------------------
// Integration setup
// ---------------------------------------------------------------------------

interface SetupOpts {
	rawSource?: string;
	subjectPath?: string;
	resolved?: Record<string, Record<string, number>>;
	contents?: Record<string, string>;
	linkCaches?: Record<string, ReferenceCache[]>;
	tagsByPath?: Record<string, string[]>;
	resolvesToSubject?: boolean;
}

interface SetupResult {
	app: App;
	el: HTMLElement;
	child: BacklinkCodeBlock;
	/** The plugin instance — exposes _index for index mutations in live-refresh tests. */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	plugin: any;
	/** The shared resolvedLinks map (mutate then call plugin._index.updateFile / buildFull). */
	resolvedLinks: Record<string, Record<string, number>>;
}

/**
 * Full-stack integration fixture:
 * 1. Wires a mock App with the vault described by `opts`.
 * 2. Instantiates OrbitalPlugin, runs onload() (builds LinkGraphIndex + wires events).
 * 3. Captures the "orbital-backlinks" handler from registerMarkdownCodeBlockProcessor.
 * 4. Invokes the handler with a synthetic ctx (sourcePath + addChild vi.fn()).
 * 5. Calls child.onload() to simulate Obsidian's addChild lifecycle.
 *
 * The LinkGraphIndex is shared between the plugin and the block through
 * _buildBacklinkDeps(), so mutations to resolvedLinks + index.updateFile/
 * buildFull are immediately visible to the block's next render.
 */
async function integrationSetup(opts: SetupOpts = {}): Promise<SetupResult> {
	const subjectPath = opts.subjectPath ?? "Subject.md";
	const resolvedLinks = { ...(opts.resolved ?? {}) };

	const app = new App();
	app.metadataCache.resolvedLinks = resolvedLinks;
	app.metadataCache.unresolvedLinks = {};

	// Build file registry from all referenced paths
	const files = new Map<string, TFile>();
	const reg = (p: string): void => {
		if (!files.has(p)) files.set(p, makeFile(p));
	};
	reg(subjectPath);
	for (const [src, dests] of Object.entries(resolvedLinks)) {
		reg(src);
		for (const dest of Object.keys(dests)) reg(dest);
	}
	for (const p of Object.keys(opts.contents ?? {})) reg(p);
	for (const p of Object.keys(opts.linkCaches ?? {})) reg(p);

	vi.mocked(app.vault.getFileByPath).mockImplementation(
		(p: string) => files.get(p) ?? null,
	);
	// getAbstractFileByPath is called by _isExcluded; return TFile so the path
	// matcher is used (excludePathPatterns defaults to [] → no exclusions).
	vi.mocked(app.vault.getAbstractFileByPath).mockImplementation(
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

	// Instantiate OrbitalPlugin and run onload (builds the real LinkGraphIndex)
	const { default: OrbitalPlugin } = await import("main");
	const plugin = new OrbitalPlugin(
		app as unknown as Parameters<typeof OrbitalPlugin>[0],
	);
	await plugin.onload();

	// Capture the orbital-backlinks processor handler
	const entry = vi
		.mocked(plugin.registerMarkdownCodeBlockProcessor)
		.mock.calls.find((c: string[]) => c[0] === "orbital-backlinks");
	if (!entry) throw new Error("orbital-backlinks processor was not registered");

	const handler = entry[1] as (
		source: string,
		el: HTMLElement,
		ctx: { sourcePath: string; addChild: (c: unknown) => void },
	) => void;

	const el = augmentEl(document.createElement("div"));
	const addChild = vi.fn();
	handler(opts.rawSource ?? "", el, { sourcePath: subjectPath, addChild });

	if (!addChild.mock.calls[0]?.[0]) {
		throw new Error("addChild was not called by the orbital-backlinks handler");
	}
	const child = addChild.mock.calls[0][0] as BacklinkCodeBlock;

	// Simulate Obsidian calling onload() after addChild
	child.onload();

	return { app, el, child, plugin, resolvedLinks };
}

// ---------------------------------------------------------------------------
// Shared teardown
// ---------------------------------------------------------------------------

afterEach(() => {
	vi.mocked(getAllTags).mockReset();
	vi.mocked(getAllTags).mockReturnValue(null);
	vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Compact render through the registered handler
// ---------------------------------------------------------------------------

describe("BacklinkCodeBlock integration — compact render", () => {
	it("unfiltered block shows 'Backlinks: N' header and one row per source", async () => {
		const { el } = await integrationSetup({
			resolved: { "a.md": { "Subject.md": 1 }, "b.md": { "Subject.md": 1 } },
		});

		expect(el.querySelector(".orbital-backlink-count")?.textContent).toBe("Backlinks: 2");
		const items = el.querySelectorAll(".orbital-backlink-item");
		expect(items).toHaveLength(2);
		const labels = [...items].map(
			(item) => item.querySelector(".orbital-backlink-item-label")?.textContent,
		);
		expect(labels).toContain("a");
		expect(labels).toContain("b");
	});

	it("folder-include filter hides sources outside the specified folder", async () => {
		const { el } = await integrationSetup({
			rawSource: "folder: Research",
			resolved: {
				"Research/note.md": { "Subject.md": 1 },
				"Archive/old.md": { "Subject.md": 1 },
			},
		});

		const items = el.querySelectorAll(".orbital-backlink-item");
		expect(items).toHaveLength(1);
		expect(items[0]?.getAttribute("data-path")).toBe("Research/note.md");
	});

	it("folder-exclude wins over folder-include (exclude precedence)", async () => {
		// Include Research but also exclude Research → exclude wins.
		const { el } = await integrationSetup({
			rawSource: "folder: Research\nfolder-exclude: Research",
			resolved: { "Research/note.md": { "Subject.md": 1 } },
		});

		expect(el.querySelector(".orbital-backlink-count")?.textContent).toBe("Backlinks: 0");
		expect(el.querySelector(".orbital-backlink-empty")?.textContent).toBe(
			"No backlinks matching filters.",
		);
	});

	it("tag-exclude wins over tag-include (exclude across categories)", async () => {
		const { el } = await integrationSetup({
			rawSource: "tag: #active\ntag-exclude: #active",
			resolved: { "a.md": { "Subject.md": 1 } },
			tagsByPath: { "a.md": ["#active"] },
		});

		expect(el.querySelector(".orbital-backlink-empty")?.textContent).toBe(
			"No backlinks matching filters.",
		);
	});
});

// ---------------------------------------------------------------------------
// Context render through the registered handler
// ---------------------------------------------------------------------------

describe("BacklinkCodeBlock integration — context render", () => {
	it("display: context renders highlighted snippets via cachedRead", async () => {
		const content = "See [[Subject]] here.";
		const { el } = await integrationSetup({
			rawSource: "display: context",
			resolved: { "a.md": { "Subject.md": 1 } },
			contents: { "a.md": content },
			linkCaches: { "a.md": [refAt(content, "[[Subject]]", "Subject")] },
			resolvesToSubject: true,
		});
		// cachedRead is async — flush microtask chain before asserting
		await flush();

		expect(el.querySelectorAll(".orbital-backlink-group")).toHaveLength(1);
		const highlights = el.querySelectorAll(".search-result-file-matched-text");
		expect(highlights.length).toBeGreaterThan(0);
		expect(highlights[0]?.textContent).toBe("[[Subject]]");
	});
});

// ---------------------------------------------------------------------------
// Live refresh through the registered event handlers
// ---------------------------------------------------------------------------

describe("BacklinkCodeBlock integration — live refresh", () => {
	it("re-renders after metadataCache 'changed' fires and debounce flushes", async () => {
		vi.useFakeTimers();
		const { el, app, plugin, resolvedLinks } = await integrationSetup({
			resolved: { "a.md": { "Subject.md": 1 } },
		});

		expect(el.querySelector(".orbital-backlink-count")?.textContent).toBe("Backlinks: 1");

		// Simulate a second source linking to Subject.md
		resolvedLinks["c.md"] = { "Subject.md": 1 };
		const cFile = makeFile("c.md");
		const origImpl = vi.mocked(app.vault.getFileByPath).getMockImplementation();
		vi.mocked(app.vault.getFileByPath).mockImplementation((p: string) => {
			if (p === "c.md") return cFile;
			return origImpl?.(p) ?? null;
		});
		// Update the plugin-scoped index (mirrors what plugin's 'changed' handler does)
		// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
		plugin._index.updateFile("c.md");

		// Fire the block's own debounced trigger (last "changed" handler registered)
		const changedTrigger = lastHandler(app.metadataCache.on, "changed");
		changedTrigger();

		// Debounce hasn't fired yet
		expect(el.querySelector(".orbital-backlink-count")?.textContent).toBe("Backlinks: 1");

		vi.advanceTimersByTime(DEFAULT_SETTINGS.refreshDebounceMs);

		// Render with updated index
		expect(el.querySelector(".orbital-backlink-count")?.textContent).toBe("Backlinks: 2");
	});

	it("re-renders after vault 'rename' with updated source label", async () => {
		vi.useFakeTimers();
		const { el, app, plugin } = await integrationSetup({
			resolved: { "old-name.md": { "Subject.md": 1 } },
		});

		const oldLabel = el.querySelector(".orbital-backlink-item-label")?.textContent;
		expect(oldLabel).toBe("old-name");

		// Rename the source in the index and vault mock
		const newFile = makeFile("new-name.md");
		vi.mocked(app.vault.getFileByPath).mockImplementation((p: string) => {
			if (p === "Subject.md") return makeFile("Subject.md");
			if (p === "new-name.md") return newFile;
			return null;
		});
		// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
		plugin._index.renameFile("old-name.md", "new-name.md");

		// Fire the block's rename trigger
		const renameTrigger = lastHandler(app.vault.on, "rename");
		renameTrigger();

		vi.advanceTimersByTime(DEFAULT_SETTINGS.refreshDebounceMs);

		expect(el.querySelector(".orbital-backlink-item-label")?.textContent).toBe("new-name");
	});

	it("re-renders after vault 'delete', removing the deleted source", async () => {
		vi.useFakeTimers();
		const { el, app, plugin } = await integrationSetup({
			resolved: {
				"a.md": { "Subject.md": 1 },
				"b.md": { "Subject.md": 1 },
			},
		});

		expect(el.querySelector(".orbital-backlink-count")?.textContent).toBe("Backlinks: 2");

		// Remove b.md from the index (mirrors plugin's delete handler)
		// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
		plugin._index.removeFile("b.md");
		vi.mocked(app.vault.getFileByPath).mockImplementation((p: string) => {
			if (p === "Subject.md" || p === "a.md") return makeFile(p);
			return null;
		});

		const deleteTrigger = lastHandler(app.vault.on, "delete");
		deleteTrigger();

		vi.advanceTimersByTime(DEFAULT_SETTINGS.refreshDebounceMs);

		expect(el.querySelector(".orbital-backlink-count")?.textContent).toBe("Backlinks: 1");
	});
});

// ---------------------------------------------------------------------------
// Cleanup: unload cancels pending debounce
// ---------------------------------------------------------------------------

describe("BacklinkCodeBlock integration — cleanup", () => {
	it("cancels the pending debounce on unload — no re-render fires after cleanup", async () => {
		vi.useFakeTimers();
		const { el, app, child } = await integrationSetup({
			resolved: { "a.md": { "Subject.md": 1 } },
		});

		expect(el.querySelector(".orbital-backlink-count")?.textContent).toBe("Backlinks: 1");
		vi.mocked(app.vault.getFileByPath).mockClear();

		// Queue a debounced re-render
		const changedTrigger = lastHandler(app.metadataCache.on, "changed");
		changedTrigger();

		// Unload before the timer fires (cancels the debouncer via register())
		child._runCleanup();

		vi.advanceTimersByTime(1000);

		// render() was NOT called — getFileByPath stays uncalled
		expect(app.vault.getFileByPath).not.toHaveBeenCalled();
	});

	it("each load→unload cycle adds exactly one listener per event (no accumulation)", async () => {
		const app = new App();
		app.metadataCache.resolvedLinks = { "a.md": { "Subject.md": 1 } };
		app.metadataCache.unresolvedLinks = {};
		vi.mocked(app.vault.getFileByPath).mockImplementation((p: string) => {
			if (p === "Subject.md" || p === "a.md") return makeFile(p);
			return null;
		});
		vi.mocked(app.vault.getAbstractFileByPath).mockImplementation((p: string) => {
			if (p === "Subject.md" || p === "a.md") return makeFile(p);
			return null;
		});

		const { default: OrbitalPlugin } = await import("main");
		const plugin = new OrbitalPlugin(
			app as unknown as Parameters<typeof OrbitalPlugin>[0],
		);
		await plugin.onload();

		const getHandler = (): ((
			source: string,
			el: HTMLElement,
			ctx: { sourcePath: string; addChild: (c: unknown) => void },
		) => void) => {
			const entry = vi
				.mocked(plugin.registerMarkdownCodeBlockProcessor)
				.mock.calls.find((c: string[]) => c[0] === "orbital-backlinks");
			return entry![1] as (
				source: string,
				el: HTMLElement,
				ctx: { sourcePath: string; addChild: (c: unknown) => void },
			) => void;
		};

		const handler = getHandler();

		const mountChild = (): BacklinkCodeBlock => {
			const elN = augmentEl(document.createElement("div"));
			const addChildN = vi.fn();
			handler("", elN, { sourcePath: "Subject.md", addChild: addChildN });
			const childN = addChildN.mock.calls[0]![0] as BacklinkCodeBlock;
			childN.onload();
			return childN;
		};

		// First mount
		const child1 = mountChild();
		const changedCountAfterFirst = vi
			.mocked(app.metadataCache.on)
			.mock.calls.filter((c) => c[0] === "changed").length;

		// Unload first block, mount second
		child1._runCleanup();
		mountChild();
		const changedCountAfterSecond = vi
			.mocked(app.metadataCache.on)
			.mock.calls.filter((c) => c[0] === "changed").length;

		// Second mount added exactly ONE more "changed" listener (not two or more)
		expect(changedCountAfterSecond - changedCountAfterFirst).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// Empty and warning states through the registered handler
// ---------------------------------------------------------------------------

describe("BacklinkCodeBlock integration — empty and warning states", () => {
	it("filtered-empty shows 'No backlinks matching filters.'", async () => {
		const { el } = await integrationSetup({
			rawSource: "folder: NonExistent",
			resolved: { "a.md": { "Subject.md": 1 } },
		});

		expect(el.querySelector(".orbital-backlink-count")?.textContent).toBe("Backlinks: 0");
		expect(el.querySelector(".orbital-backlink-empty")?.textContent).toBe(
			"No backlinks matching filters.",
		);
	});

	it("unknown config key renders an inline warning notice", async () => {
		const { el } = await integrationSetup({
			rawSource: "sort: name\n",
			resolved: { "a.md": { "Subject.md": 1 } },
		});

		const notice = el.querySelector(".orbital-backlink-notice");
		expect(notice).not.toBeNull();
		expect(notice?.textContent).toContain("unknown key 'sort'");
	});
});
