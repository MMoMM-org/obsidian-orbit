/**
 * backlinkContext — Context snippet extractor for backlink display.
 *
 * TDD: tests written before implementation. Exercises the observable behaviour
 * of extractContext through its public API only. No Obsidian imports.
 */

import { describe, it, expect } from "vitest";
import { extractContext } from "graph/backlinkContext";
import type { LinkOffset } from "graph/backlinkContext";

// ---------------------------------------------------------------------------
// Empty input
// ---------------------------------------------------------------------------

describe("extractContext — empty input", () => {
	it("returns empty array when links array is empty", () => {
		expect(extractContext("some content here", [], 10)).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// Single link
// ---------------------------------------------------------------------------

describe("extractContext — single link", () => {
	it("produces one snippet with correct match, lineIndex, and matchCount", () => {
		// "before [[link]] after"
		//  0123456 7      14 ...
		const content = "before [[link]] after";
		const links: LinkOffset[] = [{ start: 7, end: 15 }];
		const result = extractContext(content, links, 90);

		expect(result).toHaveLength(1);
		expect(result[0]!.match).toBe("[[link]]");
		expect(result[0]!.lineIndex).toBe(0);
		expect(result[0]!.matchCount).toBe(1);
	});

	it("link at start of line: before is empty with no leading ellipsis", () => {
		const content = "[[link]] some text here";
		const links: LinkOffset[] = [{ start: 0, end: 8 }];
		const result = extractContext(content, links, 90);

		expect(result[0]!.before).toBe("");
	});

	it("link at end of line: after is empty with no trailing ellipsis", () => {
		// "some text [[link]]" — link fills to end of content
		const content = "some text [[link]]";
		const links: LinkOffset[] = [{ start: 10, end: 18 }];
		const result = extractContext(content, links, 90);

		expect(result[0]!.after).toBe("");
	});

	it("before and after equal the raw line text when it fits within windowChars", () => {
		// "short [[link]] text" — 6 chars before, 5 chars after — well within 90
		const content = "short [[link]] text";
		const links: LinkOffset[] = [{ start: 6, end: 14 }];
		const result = extractContext(content, links, 90);

		expect(result[0]!.before).toBe("short ");
		expect(result[0]!.after).toBe(" text");
	});
});

// ---------------------------------------------------------------------------
// Multiple links — same line
// ---------------------------------------------------------------------------

describe("extractContext — multiple links on same line", () => {
	it("two links on same line produce one snippet with matchCount 2 centered on first link", () => {
		// "see [[A]] and [[B]] here"
		//  0   4   9    14  19
		const content = "see [[A]] and [[B]] here";
		const links: LinkOffset[] = [
			{ start: 4, end: 9 },
			{ start: 14, end: 19 },
		];
		const result = extractContext(content, links, 90);

		expect(result).toHaveLength(1);
		expect(result[0]!.matchCount).toBe(2);
		expect(result[0]!.match).toBe("[[A]]");
		expect(result[0]!.lineIndex).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// Multiple links — different lines
// ---------------------------------------------------------------------------

describe("extractContext — multiple links on different lines", () => {
	it("two links on different lines produce two snippets in ascending lineIndex order", () => {
		// "line one [[A]] here\n" = 20 chars → line 1 starts at 20
		// [[A]] at 9..14, [[B]] at 29..34
		const content = "line one [[A]] here\nline two [[B]] there";
		const links: LinkOffset[] = [
			{ start: 9, end: 14 },
			{ start: 29, end: 34 },
		];
		const result = extractContext(content, links, 90);

		expect(result).toHaveLength(2);
		expect(result[0]!.lineIndex).toBe(0);
		expect(result[1]!.lineIndex).toBe(1);
		expect(result[0]!.match).toBe("[[A]]");
		expect(result[1]!.match).toBe("[[B]]");
	});
});

// ---------------------------------------------------------------------------
// Line index mapping
// ---------------------------------------------------------------------------

describe("extractContext — line index mapping", () => {
	it("maps a link's start offset to the correct 0-based line index", () => {
		// "first line\n" = 11 chars → line 1 starts at 11
		// "second line [[link]] here" — [[link]] starts at 11+12=23, ends at 31
		const content = "first line\nsecond line [[link]] here\nthird line";
		const links: LinkOffset[] = [{ start: 23, end: 31 }];
		const result = extractContext(content, links, 90);

		expect(result[0]!.lineIndex).toBe(1);
	});

	it("before and after contain only text from the same physical line (no newline crossing)", () => {
		// "prefix\n" = 7 chars → line 1 starts at 7
		// [[link]] occupies the entire line (7..15), followed immediately by \n
		const content = "prefix\n[[link]]\nsuffix";
		const links: LinkOffset[] = [{ start: 7, end: 15 }];
		const result = extractContext(content, links, 90);

		expect(result[0]!.before).toBe("");
		expect(result[0]!.after).toBe("");
	});
});

// ---------------------------------------------------------------------------
// Window truncation — word-boundary snapping
// ---------------------------------------------------------------------------

describe("extractContext — window truncation", () => {
	it("before truncation snaps to word boundary and prefixes with ellipsis", () => {
		// "alpha beta gamma " = 17 chars before [[link]]
		// windowChars=13 → last 13 chars = "a beta gamma " (starts mid-word 'alpha')
		// snapForward to next whitespace → " beta gamma "
		// result: "… beta gamma "
		const content = "alpha beta gamma [[link]]";
		const links: LinkOffset[] = [{ start: 17, end: 25 }];
		const result = extractContext(content, links, 13);

		expect(result[0]!.before).toBe("… beta gamma ");
	});

	it("after truncation snaps to word boundary and appends ellipsis", () => {
		// " hello world" = 12 chars after [[link]]
		// windowChars=8 → first 8 chars = " hello w" (ends mid-word 'world')
		// snapBackward to last whitespace → " hello "
		// result: " hello …"
		const content = "[[link]] hello world";
		const links: LinkOffset[] = [{ start: 0, end: 8 }];
		const result = extractContext(content, links, 8);

		expect(result[0]!.after).toBe(" hello …");
	});

	it("no ellipsis is added when text fits exactly within windowChars", () => {
		// lineBeforeLink = "abc " (4 chars), lineAfterLink = " xyz" (4 chars), windowChars=4
		const content = "abc [[link]] xyz";
		const links: LinkOffset[] = [{ start: 4, end: 12 }];
		const result = extractContext(content, links, 4);

		expect(result[0]!.before).toBe("abc ");
		expect(result[0]!.after).toBe(" xyz");
	});

	it("ellipsis is added when text exceeds windowChars even at an exact word boundary", () => {
		// "one two " = 8 chars before [[link]], windowChars=7
		// last 7 chars = "e two " — 'e' is mid-word ('one')
		// snapForward to ' ' at index 1 → " two "
		// result: "… two "
		const content = "one two [[link]]";
		const links: LinkOffset[] = [{ start: 8, end: 16 }];
		const result = extractContext(content, links, 7);

		expect(result[0]!.before.startsWith("…")).toBe(true);
		expect(result[0]!.before).not.toContain("ne"); // no partial "one"
	});

	it("before: window with no whitespace keeps the partial word (not just an ellipsis)", () => {
		// A long unbroken token fills the whole window → snapForward finds no
		// whitespace and returns the window unchanged; the partial text must survive.
		const content = "supercalifragilistic[[Note]]";
		const links: LinkOffset[] = [{ start: 20, end: 28 }];
		const result = extractContext(content, links, 10);

		expect(result[0]!.before.startsWith("…")).toBe(true);
		expect(result[0]!.before).toBe("…ragilistic"); // partial word preserved
		expect(result[0]!.before.length).toBeGreaterThan(1);
	});

	it("after: window with no whitespace keeps the partial word (not just an ellipsis)", () => {
		// snapBackward finds no whitespace and returns the window unchanged.
		const content = "[[Note]]supercalifragilistic";
		const links: LinkOffset[] = [{ start: 0, end: 8 }];
		const result = extractContext(content, links, 10);

		expect(result[0]!.after.endsWith("…")).toBe(true);
		expect(result[0]!.after).toBe("supercalif…"); // partial word preserved
		expect(result[0]!.after.length).toBeGreaterThan(1);
	});
});
