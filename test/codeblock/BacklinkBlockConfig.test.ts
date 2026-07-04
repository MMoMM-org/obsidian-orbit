/**
 * BacklinkBlockConfig parser — T1.1
 *
 * Tests exercise parseBacklinkBlockConfig() through its observable outputs only.
 * No implementation details are tested — only the public contract values.
 *
 * TDD: these tests were written BEFORE the implementation.
 */

import { describe, it, expect } from "vitest";
import { parseBacklinkBlockConfig } from "codeblock/BacklinkBlockConfig";
import type { BacklinkBlockConfig } from "codeblock/BacklinkBlockConfig";

// ---------------------------------------------------------------------------
// Default result used as a baseline for assertions
// ---------------------------------------------------------------------------

const DEFAULTS: BacklinkBlockConfig = {
	display: "compact",
	folderInclude: [],
	folderExclude: [],
	tagInclude: [],
	tagExclude: [],
	warnings: [],
};

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

describe("parseBacklinkBlockConfig — defaults", () => {
	it("empty string returns all defaults", () => {
		expect(parseBacklinkBlockConfig("")).toEqual(DEFAULTS);
	});

	it("whitespace-only string returns all defaults", () => {
		expect(parseBacklinkBlockConfig("   \n  \n  ")).toEqual(DEFAULTS);
	});
});

// ---------------------------------------------------------------------------
// display
// ---------------------------------------------------------------------------

describe("parseBacklinkBlockConfig — display", () => {
	it("parses display: context", () => {
		const config = parseBacklinkBlockConfig("display: context");
		expect(config.display).toBe("context");
		expect(config.warnings).toEqual([]);
	});

	it("parses display: compact", () => {
		const config = parseBacklinkBlockConfig("display: compact");
		expect(config.display).toBe("compact");
		expect(config.warnings).toEqual([]);
	});

	it("tolerates whitespace around colon — 'display : context'", () => {
		const config = parseBacklinkBlockConfig("display : context");
		expect(config.display).toBe("context");
		expect(config.warnings).toEqual([]);
	});

	it("invalid display value defaults to compact and adds warning", () => {
		const config = parseBacklinkBlockConfig("display: fancy");
		expect(config.display).toBe("compact");
		expect(config.warnings).toContainEqual({
			message: "invalid display value 'fancy' (defaulted to compact)",
		});
	});

	it("duplicate display key — later value wins", () => {
		const config = parseBacklinkBlockConfig("display: context\ndisplay: compact");
		expect(config.display).toBe("compact");
	});

	it("duplicate display key — later invalid value resets display to compact", () => {
		const config = parseBacklinkBlockConfig("display: context\ndisplay: bad");
		expect(config.display).toBe("compact");
		expect(config.warnings).toHaveLength(1);
	});
});

// ---------------------------------------------------------------------------
// folder
// ---------------------------------------------------------------------------

describe("parseBacklinkBlockConfig — folder", () => {
	it("parses single folder include", () => {
		const config = parseBacklinkBlockConfig("folder: notes");
		expect(config.folderInclude).toEqual(["notes"]);
		expect(config.warnings).toEqual([]);
	});

	it("parses comma-separated folder includes", () => {
		const config = parseBacklinkBlockConfig("folder: notes, projects, daily");
		expect(config.folderInclude).toEqual(["notes", "projects", "daily"]);
	});

	it("parses folder-exclude", () => {
		const config = parseBacklinkBlockConfig("folder-exclude: archive");
		expect(config.folderExclude).toEqual(["archive"]);
		expect(config.folderInclude).toEqual([]);
	});

	it("strips leading slash from folder path", () => {
		const config = parseBacklinkBlockConfig("folder: /notes");
		expect(config.folderInclude).toEqual(["notes"]);
	});

	it("strips trailing slash from folder path", () => {
		const config = parseBacklinkBlockConfig("folder: notes/");
		expect(config.folderInclude).toEqual(["notes"]);
	});

	it("strips both leading and trailing slashes", () => {
		const config = parseBacklinkBlockConfig("folder: /notes/");
		expect(config.folderInclude).toEqual(["notes"]);
	});

	it("collapses duplicate slashes inside folder path", () => {
		const config = parseBacklinkBlockConfig("folder: projects//2024");
		expect(config.folderInclude).toEqual(["projects/2024"]);
	});

	it("slash-only folder normalizes to vault root (empty string)", () => {
		const config = parseBacklinkBlockConfig("folder: /");
		expect(config.folderInclude).toEqual([""]);
	});

	it("preserves dot-dot path components verbatim (no resolution)", () => {
		const config = parseBacklinkBlockConfig("folder: ../other");
		expect(config.folderInclude).toEqual(["../other"]);
	});

	it("drops empty items produced by leading/trailing/consecutive commas", () => {
		const config = parseBacklinkBlockConfig("folder: ,notes,,");
		expect(config.folderInclude).toEqual(["notes"]);
	});

	it("de-duplicates folder values and preserves first-seen order", () => {
		const config = parseBacklinkBlockConfig("folder: notes, daily, notes");
		expect(config.folderInclude).toEqual(["notes", "daily"]);
	});

	it("duplicate folder key — concatenates across lines then de-dupes", () => {
		const config = parseBacklinkBlockConfig("folder: notes\nfolder: daily, notes");
		expect(config.folderInclude).toEqual(["notes", "daily"]);
	});

	it("preserves folder case", () => {
		const config = parseBacklinkBlockConfig("folder: MyVault/Projects");
		expect(config.folderInclude).toEqual(["MyVault/Projects"]);
	});
});

// ---------------------------------------------------------------------------
// tag
// ---------------------------------------------------------------------------

describe("parseBacklinkBlockConfig — tag", () => {
	it("parses tag with leading # prefix", () => {
		const config = parseBacklinkBlockConfig("tag: #active");
		expect(config.tagInclude).toEqual(["#active"]);
		expect(config.warnings).toEqual([]);
	});

	it("parses tag without leading # and adds # prefix", () => {
		const config = parseBacklinkBlockConfig("tag: active");
		expect(config.tagInclude).toEqual(["#active"]);
	});

	it("parses comma-separated tag includes", () => {
		const config = parseBacklinkBlockConfig("tag: #active, work, #project");
		expect(config.tagInclude).toEqual(["#active", "#work", "#project"]);
	});

	it("parses tag-exclude", () => {
		const config = parseBacklinkBlockConfig("tag-exclude: #archived");
		expect(config.tagExclude).toEqual(["#archived"]);
		expect(config.tagInclude).toEqual([]);
	});

	it("lowercases tag values", () => {
		const config = parseBacklinkBlockConfig("tag: #Active");
		expect(config.tagInclude).toEqual(["#active"]);
	});

	it("normalizes nested tag with mixed case — #Active/Now becomes #active/now", () => {
		const config = parseBacklinkBlockConfig("tag: #Active/Now");
		expect(config.tagInclude).toEqual(["#active/now"]);
	});

	it("value starting with # after colon is NOT treated as a comment", () => {
		const config = parseBacklinkBlockConfig("tag: #active");
		expect(config.tagInclude).toEqual(["#active"]);
		expect(config.warnings).toEqual([]);
	});

	it("de-duplicates tag values and preserves first-seen order", () => {
		const config = parseBacklinkBlockConfig("tag: #active, #work, #active");
		expect(config.tagInclude).toEqual(["#active", "#work"]);
	});

	it("duplicate tag key — concatenates across lines then de-dupes", () => {
		const config = parseBacklinkBlockConfig("tag: #active\ntag: #work, #active");
		expect(config.tagInclude).toEqual(["#active", "#work"]);
	});

	it("'active' and '#active' both normalize to '#active' and de-dupe", () => {
		const config = parseBacklinkBlockConfig("tag: active, #active");
		expect(config.tagInclude).toEqual(["#active"]);
	});
});

// ---------------------------------------------------------------------------
// Line handling
// ---------------------------------------------------------------------------

describe("parseBacklinkBlockConfig — line handling", () => {
	it("blank lines are silently ignored", () => {
		const config = parseBacklinkBlockConfig("\n\n\ndisplay: context\n\n");
		expect(config.display).toBe("context");
		expect(config.warnings).toEqual([]);
	});

	it("whole-line comment starting with # is silently ignored", () => {
		const config = parseBacklinkBlockConfig("# This is a comment\ndisplay: context");
		expect(config.display).toBe("context");
		expect(config.warnings).toEqual([]);
	});

	it("indented comment (trimmed starts with #, no colon) is silently ignored", () => {
		const config = parseBacklinkBlockConfig("  # indented comment\ndisplay: context");
		expect(config.display).toBe("context");
		expect(config.warnings).toEqual([]);
	});

	it("non-empty line with no colon and not a comment produces invalid line warning", () => {
		const config = parseBacklinkBlockConfig("just some text");
		expect(config.warnings).toContainEqual({ message: "invalid line 'just some text'" });
	});

	it("invalid line warning uses the trimmed content of the line", () => {
		const config = parseBacklinkBlockConfig("  bad line  ");
		expect(config.warnings).toContainEqual({ message: "invalid line 'bad line'" });
	});

	it("colons in the value part do not split the key — only the first colon delimits", () => {
		const config = parseBacklinkBlockConfig("folder: a:b");
		// key is "folder", value is " a:b" — after trim: "a:b", normalize → "a:b"
		expect(config.folderInclude).toEqual(["a:b"]);
		expect(config.warnings).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// warnings
// ---------------------------------------------------------------------------

describe("parseBacklinkBlockConfig — warnings", () => {
	it("unknown key produces a warning", () => {
		const config = parseBacklinkBlockConfig("sort: name");
		expect(config.warnings).toContainEqual({ message: "unknown key 'sort'" });
	});

	it("unknown key does not halt parsing of subsequent valid lines", () => {
		const config = parseBacklinkBlockConfig("sort: name\ndisplay: context");
		expect(config.display).toBe("context");
		expect(config.warnings).toContainEqual({ message: "unknown key 'sort'" });
	});

	it("multiple unknown keys each produce their own warning", () => {
		const config = parseBacklinkBlockConfig("sort: name\norder: asc");
		expect(config.warnings).toHaveLength(2);
		expect(config.warnings).toContainEqual({ message: "unknown key 'sort'" });
		expect(config.warnings).toContainEqual({ message: "unknown key 'order'" });
	});

	it("unknown key does not populate any list field", () => {
		const config = parseBacklinkBlockConfig("sort: name");
		expect(config.folderInclude).toEqual([]);
		expect(config.folderExclude).toEqual([]);
		expect(config.tagInclude).toEqual([]);
		expect(config.tagExclude).toEqual([]);
	});
});

describe("parseBacklinkBlockConfig — style (v1.1)", () => {
	it("leaves style undefined when the key is absent (inherit setting)", () => {
		expect(parseBacklinkBlockConfig("").style).toBeUndefined();
	});

	it("parses style: dense and style: cards", () => {
		expect(parseBacklinkBlockConfig("style: dense").style).toBe("dense");
		expect(parseBacklinkBlockConfig("style: cards").style).toBe("cards");
	});

	it("is case-insensitive and whitespace-tolerant", () => {
		expect(parseBacklinkBlockConfig("style :  Cards ").style).toBe("cards");
	});

	it("warns and leaves style inherited on an invalid value", () => {
		const config = parseBacklinkBlockConfig("style: fancy");
		expect(config.style).toBeUndefined();
		expect(config.warnings).toContainEqual({
			message: "invalid style value 'fancy' (using the setting default)",
		});
	});
});

describe("parseBacklinkBlockConfig — collapse (v1.1)", () => {
	it("leaves collapse undefined when the key is absent (inherit setting)", () => {
		expect(parseBacklinkBlockConfig("").collapse).toBeUndefined();
	});

	it("parses collapse: true and collapse: false", () => {
		expect(parseBacklinkBlockConfig("collapse: true").collapse).toBe(true);
		expect(parseBacklinkBlockConfig("collapse: false").collapse).toBe(false);
	});

	it("is case-insensitive and whitespace-tolerant", () => {
		expect(parseBacklinkBlockConfig("collapse:  TRUE ").collapse).toBe(true);
	});

	it("warns and leaves collapse inherited on an invalid value", () => {
		const config = parseBacklinkBlockConfig("collapse: maybe");
		expect(config.collapse).toBeUndefined();
		expect(config.warnings).toContainEqual({
			message: "invalid collapse value 'maybe' (expected true or false)",
		});
	});
});
