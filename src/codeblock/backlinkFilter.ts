/**
 * Folder/tag filter for backlink codeblock — T1.2
 *
 * Pure filter that applies folder/tag include/exclude rules from a
 * BacklinkBlockConfig to a list of backlink source paths. Dependencies
 * (tag lookup, global exclusion) are injected so this module remains
 * testable without Obsidian APIs.
 *
 * Domain rule references: docs/ai/memory/domain.md
 */

import type { BacklinkBlockConfig } from "codeblock/BacklinkBlockConfig";

/** Dependencies injected by the caller; minimal for testability. */
export interface BacklinkFilterDeps {
	/** Returns the source's tags WITH '#', already lowercased by the caller. */
	tagsOf: (path: string) => string[];
	/** Returns true for paths globally excluded by Orbital settings. */
	isExcluded: (path: string) => boolean;
}

/** Returns the parent folder of a vault path, or "" for vault-root files. */
function parentFolder(path: string): string {
	const idx = path.lastIndexOf("/");
	return idx >= 0 ? path.slice(0, idx) : "";
}

/**
 * Returns true when `sourceFolder` is equal to or a nested child of
 * `filterFolder`. Segment boundary is enforced: "Research" does not match
 * "Researchers/x". A filterFolder of "" matches only vault-root files
 * (sourceFolder === "").
 */
function inFolder(sourceFolder: string, filterFolder: string): boolean {
	return (
		sourceFolder === filterFolder ||
		sourceFolder.startsWith(filterFolder + "/")
	);
}

/**
 * Returns true when `sourceTags` contains `filterTag` or a nested descendant.
 * Example: "#active" matches "#active" and "#active/now".
 * Both sides are pre-lowercased with a leading '#'.
 */
function hasTag(sourceTags: string[], filterTag: string): boolean {
	return sourceTags.some(
		(t) => t === filterTag || t.startsWith(filterTag + "/"),
	);
}

/**
 * Filter backlink source paths by folder/tag rules from `config`.
 *
 * Decision order (first matching rule drops the path):
 *   1. Drop self-links (path === subjectPath).
 *   2. Drop globally excluded paths (deps.isExcluded).
 *   3. Folder/tag include — empty list means no constraint; OR within a
 *      category, AND across categories.
 *   4. Folder/tag exclude — evaluated last; always wins over includes.
 *   5. Keep.
 *
 * Order of surviving paths is preserved from the input array.
 */
export function filterBacklinks(
	backlinks: string[],
	subjectPath: string,
	config: BacklinkBlockConfig,
	deps: BacklinkFilterDeps,
): string[] {
	return backlinks.filter((path) => {
		if (path === subjectPath) return false;
		if (deps.isExcluded(path)) return false;

		const folder = parentFolder(path);
		const tags = deps.tagsOf(path);

		if (config.folderInclude.length > 0
			&& !config.folderInclude.some((f) => inFolder(folder, f))) return false;
		if (config.tagInclude.length > 0
			&& !config.tagInclude.some((t) => hasTag(tags, t))) return false;

		if (config.folderExclude.some((f) => inFolder(folder, f))) return false;
		if (config.tagExclude.some((t) => hasTag(tags, t))) return false;

		return true;
	});
}
