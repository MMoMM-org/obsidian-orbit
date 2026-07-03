/**
 * BacklinkBlockConfig — T1.1
 *
 * Parses the raw text of a backlink codeblock into a typed config object.
 * Pure module: no side effects, no Obsidian imports.
 *
 * Format: flat key: value lines, comma-separated values.
 * See docs/XDD/specs/002-backlink-codeblock/ for the full specification.
 */

export type DisplayMode = "compact" | "context";

export interface BacklinkBlockWarning {
	message: string;
}

export interface BacklinkBlockConfig {
	display: DisplayMode;
	folderInclude: string[];
	folderExclude: string[];
	tagInclude: string[];
	tagExclude: string[];
	warnings: BacklinkBlockWarning[];
}

/** Trim, collapse duplicate slashes, strip leading/trailing slashes. */
function normalizeFolder(raw: string): string {
	const trimmed = raw.trim();
	const collapsed = trimmed.replace(/\/+/g, "/");
	return collapsed.replace(/^\/|\/$/g, "");
}

/** Trim, strip optional leading '#', lowercase, then re-prefix with '#'. */
function normalizeTag(raw: string): string {
	const trimmed = raw.trim();
	const stripped = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
	return "#" + stripped.toLowerCase();
}

/** Split on commas, trim each item, drop empty items. */
function parseValues(rawValue: string): string[] {
	return rawValue.split(",").map((v) => v.trim()).filter((v) => v.length > 0);
}

/** Return a new array with duplicates removed, preserving first-seen order. */
function dedupe(items: string[]): string[] {
	const seen = new Set<string>();
	return items.filter((item) => {
		if (seen.has(item)) return false;
		seen.add(item);
		return true;
	});
}

type ListKey = "folderInclude" | "folderExclude" | "tagInclude" | "tagExclude";

/** Parse, normalize, append, and de-duplicate values for a list key. */
function applyListKey(
	config: BacklinkBlockConfig,
	key: ListKey,
	rawValue: string,
	normalize: (v: string) => string,
): void {
	const incoming = parseValues(rawValue).map(normalize);
	config[key] = dedupe([...config[key], ...incoming]);
}

/** Apply a validated display value or push a warning and fall back to compact. */
function applyDisplayKey(config: BacklinkBlockConfig, rawValue: string): void {
	const val = rawValue.trim();
	if (val === "compact" || val === "context") {
		config.display = val;
		return;
	}
	config.warnings.push({
		message: `invalid display value '${val}' (defaulted to compact)`,
	});
	config.display = "compact";
}

/**
 * Process a single raw line into config mutations.
 *
 * Split on the FIRST ':'. No colon → blank/comment (silent) or invalid line
 * (warning). Known key → apply value. Unknown key → warning.
 */
function processLine(config: BacklinkBlockConfig, line: string): void {
	const colonIdx = line.indexOf(":");
	if (colonIdx === -1) {
		const trimmed = line.trim();
		if (trimmed === "" || trimmed.startsWith("#")) return;
		config.warnings.push({ message: `invalid line '${trimmed}'` });
		return;
	}
	const key = line.slice(0, colonIdx).trim();
	const rawValue = line.slice(colonIdx + 1);
	switch (key) {
		case "display":
			applyDisplayKey(config, rawValue);
			break;
		case "folder":
			applyListKey(config, "folderInclude", rawValue, normalizeFolder);
			break;
		case "folder-exclude":
			applyListKey(config, "folderExclude", rawValue, normalizeFolder);
			break;
		case "tag":
			applyListKey(config, "tagInclude", rawValue, normalizeTag);
			break;
		case "tag-exclude":
			applyListKey(config, "tagExclude", rawValue, normalizeTag);
			break;
		default:
			config.warnings.push({ message: `unknown key '${key}'` });
	}
}

/**
 * Parse the raw text of a backlink codeblock into a BacklinkBlockConfig.
 *
 * @param rawText - The full text content of the codeblock (without fence markers).
 * @returns A fully populated config; warnings array captures parse issues.
 */
export function parseBacklinkBlockConfig(rawText: string): BacklinkBlockConfig {
	const config: BacklinkBlockConfig = {
		display: "compact",
		folderInclude: [],
		folderExclude: [],
		tagInclude: [],
		tagExclude: [],
		warnings: [],
	};
	for (const line of rawText.split("\n")) {
		processLine(config, line);
	}
	return config;
}
