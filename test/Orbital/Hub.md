# Hub

Central map of content for this test vault. Start here.

## Core ideas

- [[Zettelkasten]] — the note-taking method
- [[Linking]] — how notes connect to each other
- [[Knowledge Management]] — the bigger picture
- [[Concepts/Atomic Notes|Atomic Notes]] — the unit of knowledge

## Still to create

These targets don't exist as notes yet:

- [[Atlas of Concepts]] — a planned overview
- [[Inbox]] — capture point
- [[Fleeting Notes]] — quick captures

---

## Orbital backlinks — verification (spec 002)

> These blocks show **Hub's own backlinks** (notes that link to `[[Hub]]`).
> Known linkers: `Zettelkasten` (inline `#Capture`), `Projects/Orbit Plugin`
> (frontmatter `tags: [project]`), `Knowledge Management`, `_Orbit Test Guide`,
> `Daily/2026-06-19`. Open this note in **reading view** and **live preview**.

### 1 · Compact (all backlinks)

```orbital-backlinks
```
_Expect: "Backlinks: N" header + one clickable row per linker above. Click opens; Cmd/Ctrl-click opens a new tab._

### 2 · Context mode (default style = Dense; click a line to open)

```orbital-backlinks
display: context
```
_Expect: under each linker, the line where `[[Hub]]` appears, link highlighted. Each source has a **chevron** — click the chevron/title to fold. **Click a context line** → opens that note at the line. Mod-click → new tab._

### 2b · Context — Cards style, folded by default

```orbital-backlinks
display: context
style: cards
collapse: true
```
_Expect: bordered cards with a left accent bar, all **folded** initially; click a title to unfold. Overrides the global Context-style/Collapse settings._

### 3 · Folder include

```orbital-backlinks
folder: Projects
```
_Expect: only `Orbit Plugin` (in `Projects/`). Segment boundary — `Projects` must not match a `ProjectsX/` folder._

### 4 · Folder exclude

```orbital-backlinks
folder-exclude: Daily, Projects
```
_Expect: only root-level linkers (`Zettelkasten`, `Knowledge Management`, `_Orbit Test Guide`); `Daily/2026-06-19` and `Orbit Plugin` hidden._

### 5 · Tag include — INLINE tag (getAllTags check)

```orbital-backlinks
display: context
tag: #capture
```
_Expect: only `Daily/2026-06-19` (carries a real inline `#capture` tag). Confirms **inline-tag** matching via getAllTags. (Note: `Zettelkasten`'s `#Capture` is a link anchor `[[Fleeting Notes#Capture]]`, NOT a tag — correctly ignored.)_

### 6 · Tag include — FRONTMATTER tag (getAllTags check)

```orbital-backlinks
tag: project
```
_Expect: only `Orbit Plugin` (frontmatter `tags: [project]`). Confirms frontmatter-tag matching and that a leading `#` is optional._

### 7 · Tag exclude

```orbital-backlinks
tag-exclude: #capture
```
_Expect: every linker **except** `Daily/2026-06-19` (which now carries inline `#capture`)._

### 8 · Invalid config → graceful

```orbital-backlinks
display: fancy
sort: name
```
_Expect: falls back to compact AND shows a subtle inline warning ("invalid display value 'fancy'…", "unknown key 'sort'"). No crash._

## Backlinks footer — verification (v1.2)

> The footer is **not** a code block. Enable **Settings → Orbital → In-note
> backlinks → Show backlinks footer**, then look at the **very bottom** of this
> note (below everything, past a divider line).

_Expect, with the setting **on**:_
- A divider, then `Backlinks: N` and a **context** view of Hub's linkers —
  identical styling to block 2 above, following the **Context style** setting.
- It appears in **reading view AND live preview** (toggle with Cmd/Ctrl-E).
- Toggle **Context style** dense↔cards / **Collapse by default** → the footer
  follows on the next repaint.
- Open a note with **no** backlinks (e.g. a fresh scratch note) → the footer
  still shows `Backlinks: 0` / `No backlinks.`
- Turn the setting **off** → the footer disappears from every open note.

### Checklist
- [ ] 1 renders in reading view **and** live preview
- [ ] 2 shows highlighted context lines
- [ ] 3 / 4 folder include & exclude correct (exclude wins)
- [ ] 5 inline `#Capture` matched · [ ] 6 frontmatter `project` matched
- [ ] 7 exclude removes only Zettelkasten
- [ ] 8 warning shown, no crash
- [ ] edit a linker (add/remove `[[Hub]]`) → a block updates within ~1s (live refresh)
- [ ] footer appears at note end in reading view **and** live preview when enabled
- [ ] footer shows `No backlinks.` on a note with none · [ ] footer vanishes when disabled
