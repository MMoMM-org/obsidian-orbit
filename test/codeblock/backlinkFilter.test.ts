/**
 * Folder/tag filter for backlink codeblock — T1.2
 *
 * Tests exercise filterBacklinks() through its observable output only.
 * The three private helpers (parentFolder, inFolder, hasTag) are covered
 * by their effect on what paths survive the filter.
 */

import { describe, it, expect } from "vitest";
import { filterBacklinks } from "codeblock/backlinkFilter";
import type { BacklinkFilterDeps } from "codeblock/backlinkFilter";
import type { BacklinkBlockConfig } from "codeblock/BacklinkBlockConfig";

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeConfig(overrides?: Partial<BacklinkBlockConfig>): BacklinkBlockConfig {
	return {
		display: "compact",
		folderInclude: [],
		folderExclude: [],
		tagInclude: [],
		tagExclude: [],
		warnings: [],
		...overrides,
	};
}

function makeDeps(overrides?: Partial<BacklinkFilterDeps>): BacklinkFilterDeps {
	return {
		tagsOf: () => [],
		isExcluded: () => false,
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// Rule 1: self-link
// ---------------------------------------------------------------------------

describe("filterBacklinks — self-link", () => {
	it("drops source path equal to subjectPath", () => {
		const result = filterBacklinks(
			["active.md", "other.md"],
			"active.md",
			makeConfig(),
			makeDeps(),
		);
		expect(result).not.toContain("active.md");
		expect(result).toContain("other.md");
	});
});

// ---------------------------------------------------------------------------
// Rule 2: global exclusion
// ---------------------------------------------------------------------------

describe("filterBacklinks — global exclusion (isExcluded)", () => {
	it("drops paths where isExcluded returns true", () => {
		const deps = makeDeps({ isExcluded: (p) => p === "excluded.md" });
		const result = filterBacklinks(
			["excluded.md", "kept.md"],
			"subject.md",
			makeConfig(),
			deps,
		);
		expect(result).not.toContain("excluded.md");
		expect(result).toContain("kept.md");
	});
});

// ---------------------------------------------------------------------------
// Rule 3 + 4a: folder include
// ---------------------------------------------------------------------------

describe("filterBacklinks — folder include", () => {
	it("keeps paths in the exact included folder", () => {
		const result = filterBacklinks(
			["Research/note.md"],
			"subject.md",
			makeConfig({ folderInclude: ["Research"] }),
			makeDeps(),
		);
		expect(result).toContain("Research/note.md");
	});

	it("keeps paths in a nested subfolder of the included folder", () => {
		const result = filterBacklinks(
			["Research/deep/note.md"],
			"subject.md",
			makeConfig({ folderInclude: ["Research"] }),
			makeDeps(),
		);
		expect(result).toContain("Research/deep/note.md");
	});

	it("drops paths in a folder sharing only a name prefix — segment boundary (Researchers vs Research)", () => {
		const result = filterBacklinks(
			["Researchers/note.md"],
			"subject.md",
			makeConfig({ folderInclude: ["Research"] }),
			makeDeps(),
		);
		expect(result).not.toContain("Researchers/note.md");
	});

	it("drops paths not in any included folder when folderInclude is non-empty", () => {
		const result = filterBacklinks(
			["Other/note.md"],
			"subject.md",
			makeConfig({ folderInclude: ["Research"] }),
			makeDeps(),
		);
		expect(result).not.toContain("Other/note.md");
	});

	it("empty folderInclude imposes no folder constraint (all paths pass)", () => {
		const result = filterBacklinks(
			["Anywhere/note.md"],
			"subject.md",
			makeConfig({ folderInclude: [] }),
			makeDeps(),
		);
		expect(result).toContain("Anywhere/note.md");
	});
});

// ---------------------------------------------------------------------------
// Rule 3 + 4b: tag include
// ---------------------------------------------------------------------------

describe("filterBacklinks — tag include", () => {
	it("keeps paths with an exactly matching tag", () => {
		const deps = makeDeps({ tagsOf: (p) => (p === "tagged.md" ? ["#active"] : []) });
		const result = filterBacklinks(
			["tagged.md"],
			"subject.md",
			makeConfig({ tagInclude: ["#active"] }),
			deps,
		);
		expect(result).toContain("tagged.md");
	});

	it("keeps paths whose tag is a nested child of the filter tag (#active/now matches #active)", () => {
		const deps = makeDeps({ tagsOf: (p) => (p === "tagged.md" ? ["#active/now"] : []) });
		const result = filterBacklinks(
			["tagged.md"],
			"subject.md",
			makeConfig({ tagInclude: ["#active"] }),
			deps,
		);
		expect(result).toContain("tagged.md");
	});

	it("drops paths with none of the required tags", () => {
		const deps = makeDeps({ tagsOf: () => ["#other"] });
		const result = filterBacklinks(
			["note.md"],
			"subject.md",
			makeConfig({ tagInclude: ["#active"] }),
			deps,
		);
		expect(result).not.toContain("note.md");
	});

	it("empty tagInclude imposes no tag constraint (all paths pass)", () => {
		const result = filterBacklinks(
			["no-tags.md"],
			"subject.md",
			makeConfig({ tagInclude: [] }),
			makeDeps({ tagsOf: () => [] }),
		);
		expect(result).toContain("no-tags.md");
	});
});

// ---------------------------------------------------------------------------
// Rule 4: cross-category AND — folderInclude AND tagInclude must both pass
// ---------------------------------------------------------------------------

describe("filterBacklinks — cross-category AND (folderInclude AND tagInclude)", () => {
	it("drops when source satisfies folderInclude but not tagInclude", () => {
		const deps = makeDeps({ tagsOf: () => [] });
		const result = filterBacklinks(
			["Research/note.md"],
			"subject.md",
			makeConfig({ folderInclude: ["Research"], tagInclude: ["#active"] }),
			deps,
		);
		expect(result).not.toContain("Research/note.md");
	});

	it("drops when source satisfies tagInclude but not folderInclude", () => {
		const deps = makeDeps({ tagsOf: () => ["#active"] });
		const result = filterBacklinks(
			["Other/note.md"],
			"subject.md",
			makeConfig({ folderInclude: ["Research"], tagInclude: ["#active"] }),
			deps,
		);
		expect(result).not.toContain("Other/note.md");
	});

	it("keeps when source satisfies both folderInclude and tagInclude", () => {
		const deps = makeDeps({ tagsOf: () => ["#active"] });
		const result = filterBacklinks(
			["Research/note.md"],
			"subject.md",
			makeConfig({ folderInclude: ["Research"], tagInclude: ["#active"] }),
			deps,
		);
		expect(result).toContain("Research/note.md");
	});
});

// ---------------------------------------------------------------------------
// Rule 5a: folder exclude
// ---------------------------------------------------------------------------

describe("filterBacklinks — folder exclude", () => {
	it("drops paths in the excluded folder", () => {
		const result = filterBacklinks(
			["Archive/note.md"],
			"subject.md",
			makeConfig({ folderExclude: ["Archive"] }),
			makeDeps(),
		);
		expect(result).not.toContain("Archive/note.md");
	});

	it("drops paths in a subfolder of the excluded folder", () => {
		const result = filterBacklinks(
			["Archive/2020/note.md"],
			"subject.md",
			makeConfig({ folderExclude: ["Archive"] }),
			makeDeps(),
		);
		expect(result).not.toContain("Archive/2020/note.md");
	});

	it("exclude-folder wins over include-folder for the same path", () => {
		const result = filterBacklinks(
			["Research/note.md"],
			"subject.md",
			makeConfig({ folderInclude: ["Research"], folderExclude: ["Research"] }),
			makeDeps(),
		);
		expect(result).not.toContain("Research/note.md");
	});
});

// ---------------------------------------------------------------------------
// Rule 5b: tag exclude
// ---------------------------------------------------------------------------

describe("filterBacklinks — tag exclude", () => {
	it("drops paths with an excluded tag", () => {
		const deps = makeDeps({ tagsOf: () => ["#archived"] });
		const result = filterBacklinks(
			["note.md"],
			"subject.md",
			makeConfig({ tagExclude: ["#archived"] }),
			deps,
		);
		expect(result).not.toContain("note.md");
	});

	it("drops paths whose tag is a nested child of the excluded tag (#archived/old matches #archived)", () => {
		const deps = makeDeps({ tagsOf: () => ["#archived/old"] });
		const result = filterBacklinks(
			["note.md"],
			"subject.md",
			makeConfig({ tagExclude: ["#archived"] }),
			deps,
		);
		expect(result).not.toContain("note.md");
	});

	it("exclude-tag wins over include-tag for the same path", () => {
		const deps = makeDeps({ tagsOf: () => ["#active", "#archived"] });
		const result = filterBacklinks(
			["note.md"],
			"subject.md",
			makeConfig({ tagInclude: ["#active"], tagExclude: ["#archived"] }),
			deps,
		);
		expect(result).not.toContain("note.md");
	});
});

// ---------------------------------------------------------------------------
// Rule 6: order preserved
// ---------------------------------------------------------------------------

describe("filterBacklinks — order preserved", () => {
	it("surviving paths appear in the same order as the input array", () => {
		const deps = makeDeps({ isExcluded: (p) => p === "c.md" });
		const result = filterBacklinks(
			["a.md", "b.md", "c.md", "d.md", "e.md"],
			"subject.md",
			makeConfig(),
			deps,
		);
		expect(result).toEqual(["a.md", "b.md", "d.md", "e.md"]);
	});
});

// ---------------------------------------------------------------------------
// Vault-root source folder (parentFolder returns "" for files with no slash)
// ---------------------------------------------------------------------------

describe("filterBacklinks — vault-root source folder", () => {
	it("keeps a vault-root file when folderInclude contains empty string", () => {
		const result = filterBacklinks(
			["root-note.md"],
			"subject.md",
			makeConfig({ folderInclude: [""] }),
			makeDeps(),
		);
		expect(result).toContain("root-note.md");
	});

	it("drops a vault-root file when folderInclude specifies a named folder", () => {
		const result = filterBacklinks(
			["root-note.md"],
			"subject.md",
			makeConfig({ folderInclude: ["Notes"] }),
			makeDeps(),
		);
		expect(result).not.toContain("root-note.md");
	});

	it("drops a subfolder file when folderInclude contains only empty string (vault root only)", () => {
		const result = filterBacklinks(
			["Notes/note.md"],
			"subject.md",
			makeConfig({ folderInclude: [""] }),
			makeDeps(),
		);
		expect(result).not.toContain("Notes/note.md");
	});

	it("drops a vault-root file when it matches a folderExclude of empty string", () => {
		const result = filterBacklinks(
			["root-note.md", "Notes/note.md"],
			"subject.md",
			makeConfig({ folderExclude: [""] }),
			makeDeps(),
		);
		expect(result).not.toContain("root-note.md");
		expect(result).toContain("Notes/note.md");
	});
});
