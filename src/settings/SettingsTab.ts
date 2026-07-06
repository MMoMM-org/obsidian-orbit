import type OrbitalPlugin from "main";
import { type App, PluginSettingTab, Setting } from "obsidian";
import type {
	ContextAmount,
	ContextSort,
	ContextStyle,
	DanglingGrouping,
	DanglingScope,
	TabId,
} from "types/index";

import { FolderSuggest } from "./FolderSuggest";
import { HeaderSection } from "./HeaderSection";

export class SettingsTab extends PluginSettingTab {
	plugin: OrbitalPlugin;
	private readonly header: HeaderSection;

	constructor(app: App, plugin: OrbitalPlugin) {
		super(app, plugin);
		this.plugin = plugin;
		this.header = new HeaderSection({ plugin });
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass("orbital-settings");

		const headerEl = containerEl.createDiv({ cls: "orbital-settings-header" });
		this.header.render(headerEl);

		this.renderGeneralSection(containerEl);
		this.renderContextTabSection(containerEl);
		this.renderRelationsSection(containerEl);
		this.renderBacklinksSection(containerEl);
		this.renderDanglingSection(containerEl);
		this.renderRecentSection(containerEl);
		this.renderAdvancedSection(containerEl);
	}

	// -------------------------------------------------------------------------
	// Private — section renderers
	// -------------------------------------------------------------------------

	private renderGeneralSection(containerEl: HTMLElement): void {
		// Obsidian guideline: the first settings group has no heading — a
		// leading "General" heading is flagged by obsidianmd lint. These
		// settings render at the top of the tab, above the first heading.
		new Setting(containerEl)
			.setName("Default tab")
			.setDesc("Which tab to show when the orbit pane opens.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("context", "Context")
					.addOption("relations", "Relations")
					.addOption("dangling", "Dangling links")
					.addOption("recent", "Recent notes")
					.setValue(this.plugin.settings.defaultTab)
					.onChange(async (value) => {
						this.plugin.settings.defaultTab = value as TabId;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Show counts")
			.setDesc("Display item counts on each tab label.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showCounts)
					.onChange(async (value) => {
						this.plugin.settings.showCounts = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Show status bar item")
			.setDesc("Show the orbit icon with backlink / 2nd-hop counts for the active note. Click it to open the relations tab.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showStatusBar)
					.onChange(async (value) => {
						this.plugin.settings.showStatusBar = value;
						await this.plugin.saveSettings();
						this.plugin._refreshStatusBar();
					}),
			);
	}

	private renderContextTabSection(containerEl: HTMLElement): void {
		new Setting(containerEl).setName("Context tab").setHeading();

		new Setting(containerEl)
			.setName("Context amount")
			.setDesc("How much surrounding text each backlink shows in the context tab. More context is easier to read; less is more scannable.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("compact", "Compact")
					.addOption("comfortable", "Comfortable")
					.addOption("fullLine", "Full line")
					.addOption("surroundingLines", "Surrounding lines")
					.setValue(this.plugin.settings.contextTabAmount)
					.onChange(async (value) => {
						this.plugin.settings.contextTabAmount = value as ContextAmount;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Style")
			.setDesc("Default visual style for the context tab (independent of the code block and footer). You can also toggle it from the tab's toolbar.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("dense", "Dense")
					.addOption("cards", "Cards")
					.setValue(this.plugin.settings.contextTabStyle)
					.onChange(async (value) => {
						this.plugin.settings.contextTabStyle = value as ContextStyle;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Sort")
			.setDesc("Default order for source notes in the context tab. The tab's sort button cycles through these.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("recent", "Recently modified")
					.addOption("mentions", "Mention count")
					.addOption("name", "Name")
					.setValue(this.plugin.settings.contextTabSort)
					.onChange(async (value) => {
						this.plugin.settings.contextTabSort = value as ContextSort;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Collapse groups by default")
			.setDesc("Start each source group folded in the context tab.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.contextTabCollapse)
					.onChange(async (value) => {
						this.plugin.settings.contextTabCollapse = value;
						await this.plugin.saveSettings();
					}),
			);
	}

	private renderRelationsSection(containerEl: HTMLElement): void {
		new Setting(containerEl).setName("Relations").setHeading();

		new Setting(containerEl)
			.setName("Second-hop links")
			.setDesc("Show links that are two hops away from the active note.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.secondHopEnabled)
					.onChange(async (value) => {
						this.plugin.settings.secondHopEnabled = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Second-hop cap")
			.setDesc("Maximum number of second-hop links to display.")
			.addText((text) =>
				text
					.setPlaceholder("50")
					.setValue(String(this.plugin.settings.secondHopCap))
					.onChange(async (value) => {
						const n = parseInt(value, 10);
						if (!isNaN(n) && n > 0) {
							this.plugin.settings.secondHopCap = n;
							await this.plugin.saveSettings();
						}
					}),
			);

		new Setting(containerEl)
			.setName("Show unlinked mentions")
			.setDesc("Add an 'unlinked mentions' section to the relations tab. Scans note contents on demand when expanded.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.unlinkedMentionsEnabled)
					.onChange(async (value) => {
						this.plugin.settings.unlinkedMentionsEnabled = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Open unlinked mentions in new tab")
			.setDesc("Open the note in a new tab when clicking an unlinked mention. Mod-click always opens a new tab.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.unlinkedOpenInNewTab)
					.onChange(async (value) => {
						this.plugin.settings.unlinkedOpenInNewTab = value;
						await this.plugin.saveSettings();
					}),
			);
	}

	private renderBacklinksSection(containerEl: HTMLElement): void {
		new Setting(containerEl).setName("In-note backlinks").setHeading();

		new Setting(containerEl)
			.setName("Context style")
			.setDesc("Default visual style for the orbital-backlinks code block in context mode. A block's own 'style:' key overrides this.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("dense", "Dense")
					.addOption("cards", "Cards")
					.setValue(this.plugin.settings.backlinkContextStyle)
					.onChange(async (value) => {
						this.plugin.settings.backlinkContextStyle = value as ContextStyle;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Collapse context by default")
			.setDesc("Start context-mode source groups folded. A block's own 'collapse:' key overrides this.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.backlinkContextCollapse)
					.onChange(async (value) => {
						this.plugin.settings.backlinkContextCollapse = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Show backlinks footer")
			.setDesc("Append a backlinks context view at the end of every note, in reading view and live preview. Uses the context style and collapse settings above.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.backlinkFooterEnabled)
					.onChange(async (value) => {
						this.plugin.settings.backlinkFooterEnabled = value;
						await this.plugin.saveSettings();
						this.plugin._refreshFooterHosts();
					}),
			);
	}

	private renderDanglingSection(containerEl: HTMLElement): void {
		new Setting(containerEl).setName("Dangling links").setHeading();

		new Setting(containerEl)
			.setName("Default scope")
			.setDesc("Whether to show dangling links for the whole vault or just the current folder.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("vault", "Vault")
					.addOption("folder", "Folder")
					.setValue(this.plugin.settings.danglingDefaultScope)
					.onChange(async (value) => {
						this.plugin.settings.danglingDefaultScope = value as DanglingScope;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Grouping")
			.setDesc("Group dangling links by their target (missing note) or by their source file.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("target", "Target")
					.addOption("source", "Source")
					.setValue(this.plugin.settings.danglingGrouping)
					.onChange(async (value) => {
						this.plugin.settings.danglingGrouping = value as DanglingGrouping;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("New note folder")
			.setDesc("Folder for new notes created from dangling links. Leave empty to use the default location.")
			.addText((text) => {
				text
					.setPlaceholder("E.g. Notes/")
					.setValue(this.plugin.settings.newNoteFolder)
					.onChange(async (value) => {
						this.plugin.settings.newNoteFolder = value;
						await this.plugin.saveSettings();
					});
				new FolderSuggest(this.app, text.inputEl);
			});
	}

	private renderRecentSection(containerEl: HTMLElement): void {
		new Setting(containerEl).setName("Recent files").setHeading();

		new Setting(containerEl)
			.setName("Recent notes list length")
			.setDesc("Number of recently visited notes to show.")
			.addText((text) =>
				text
					.setPlaceholder("20")
					.setValue(String(this.plugin.settings.recentListLength))
					.onChange(async (value) => {
						const n = parseInt(value, 10);
						if (!isNaN(n) && n > 0) {
							this.plugin.settings.recentListLength = n;
							await this.plugin.saveSettings();
						}
					}),
			);
	}

	private renderAdvancedSection(containerEl: HTMLElement): void {
		new Setting(containerEl).setName("Advanced").setHeading();

		new Setting(containerEl)
			.setName("Refresh debounce (ms)")
			.setDesc("Delay in milliseconds before relations refresh after a file change.")
			.addText((text) =>
				text
					.setPlaceholder("300")
					.setValue(String(this.plugin.settings.refreshDebounceMs))
					.onChange(async (value) => {
						const n = parseInt(value, 10);
						if (!isNaN(n) && n >= 0) {
							this.plugin.settings.refreshDebounceMs = n;
							await this.plugin.saveSettings();
						}
					}),
			);

		new Setting(containerEl)
			.setName("Exclude path patterns")
			.setDesc("File path patterns to exclude (one per line, plain text or regex).")
			.addTextArea((textarea) =>
				textarea
					.setPlaceholder("Templates/\ndaily/")
					.setValue(this.plugin.settings.excludePathPatterns.join("\n"))
					.onChange(async (value) => {
						this.plugin.settings.excludePathPatterns = value
							.split("\n")
							.map((s) => s.trim())
							.filter((s) => s.length > 0);
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Exclude tag patterns")
			.setDesc("Tag patterns to exclude (one per line, plain text or regex).")
			.addTextArea((textarea) =>
				textarea
					.setPlaceholder("#Daily\n#archive")
					.setValue(this.plugin.settings.excludeTagPatterns.join("\n"))
					.onChange(async (value) => {
						this.plugin.settings.excludeTagPatterns = value
							.split("\n")
							.map((s) => s.trim())
							.filter((s) => s.length > 0);
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Debug logging")
			.setDesc("Emit verbose diagnostic traces to the developer console for troubleshooting.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.debugLogging)
					.onChange(async (value) => {
						this.plugin.settings.debugLogging = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}
