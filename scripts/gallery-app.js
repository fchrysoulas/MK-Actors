import { MODULE_ID } from "./constants.js";
import { debugLog } from "./debug.js";
import { resolveActor } from "./documents.js";
import {
  canViewActor,
  getActorImage,
  getUuidForIndex,
  splitSetting,
  titleCase
} from "./actor-helpers.js";
import { openTokenPortraitDialog } from "./token-portrait-dialog.js";
import { localize } from "./utils.js";

let activePortraitContextMenu = null;

function closePortraitContextMenu() {
  if (activePortraitContextMenu) {
    activePortraitContextMenu.close();
    return;
  }

  document.querySelector(".mk-actors-context-menu")?.remove();
}

export class MKActorsApp extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "mk-actors-app",
    classes: ["mk-actors-app"],
    position: {
      width: 980,
      height: 720
    },
    window: {
      title: "MKACTORS.AppTitle",
      resizable: true
    }
  };

  constructor(options = {}) {
    super(options);
    this.cache = null;
    this.warnings = [];
    this.filters = {
      search: "",
      type: "",
      source: ""
    };
  }

  get title() {
    return game.i18n.localize("MKACTORS.AppTitle");
  }

  async _prepareContext(options = {}) {
    return this.getData(options);
  }

  async _renderHTML(context, _options) {
    return renderTemplate(`modules/${MODULE_ID}/templates/gallery.hbs`, context);
  }

  _replaceHTML(result, content, _options) {
    content.innerHTML = result;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this.activateListeners(this.element);
  }

  invalidateCache() {
    debugLog("Invalidating gallery cache");
    this.cache = null;
    this.warnings = [];
  }

  async getData(_options = {}) {
    debugLog("Preparing gallery data", { state: { ...this.filters } });
    const allActors = await this.getActorEntries();
    const filteredByControls = this.filterByControls(allActors);
    const types = this.getTypeOptions(allActors);
    const sourceTree = this.getSourceTree(allActors);
    const cardSize = Number(game.settings.get(MODULE_ID, "cardSize")) || 150;
    debugLog("Gallery data prepared", {
      totalActors: allActors.length,
      visibleActors: filteredByControls.length,
      types: types.length,
      treeItems: sourceTree.length,
      cardSize
    });

    return {
      actors: filteredByControls,
      hasActors: filteredByControls.length > 0,
      types,
      sourceTree,
      state: this.filters,
      cardSize,
      warnings: this.warnings
    };
  }

  activateListeners(html) {
    const root = html?.[0] || html;
    debugLog("Activating gallery listeners");

    root.querySelector?.("[data-action='search']")?.addEventListener("input", (event) => {
      this.filters.search = event.currentTarget.value || "";
      debugLog("Search filter changed", { search: this.filters.search });
      this.applySearchFilter(root);
    });

    root.querySelector?.("[data-action='type']")?.addEventListener("change", (event) => {
      this.filters.type = event.currentTarget.value || "";
      debugLog("Type filter changed", { type: this.filters.type });
      this.render(false);
    });

    for (const button of root.querySelectorAll?.("[data-action='source-tree']") || []) {
      button.addEventListener("click", (event) => {
        this.filters.source = event.currentTarget.dataset.source || "";
        debugLog("Source tree filter changed", { source: this.filters.source });
        this.render(false);
      });
    }

    root.querySelector?.("[data-action='clear']")?.addEventListener("click", () => {
      this.filters.search = "";
      this.filters.type = "";
      this.filters.source = "";
      debugLog("Gallery filters cleared");
      this.render(false);
    });

    root.querySelector?.("[data-action='refresh']")?.addEventListener("click", () => {
      debugLog("Manual gallery refresh requested");
      this.invalidateCache();
      this.render(false);
    });

    for (const card of root.querySelectorAll?.("[data-action='drag-actor']") || []) {
      card.addEventListener("dragstart", this.onDragStart.bind(this));
      card.addEventListener("dblclick", this.onCardDoubleClick.bind(this));
    }

    for (const portrait of root.querySelectorAll?.("[data-action='edit-token-portrait']") || []) {
      portrait.addEventListener("contextmenu", this.onPortraitContextMenu.bind(this));
    }

    for (const button of root.querySelectorAll?.("[data-action='open-sheet']") || []) {
      button.addEventListener("click", this.onOpenSheet.bind(this));
    }

    this.applySearchFilter(root);
  }

  async getActorEntries() {
    if (this.cache) {
      debugLog("Using cached Actor entries", { count: this.cache.length });
      return this.cache;
    }

    const entries = [];
    this.warnings = [];
    debugLog("Loading Actor entries", {
      includeWorldActors: game.settings.get(MODULE_ID, "includeWorldActors"),
      includeCompendiumActors: game.settings.get(MODULE_ID, "includeCompendiumActors")
    });

    if (game.settings.get(MODULE_ID, "includeWorldActors")) {
      entries.push(...this.getWorldActorEntries());
    }

    if (game.settings.get(MODULE_ID, "includeCompendiumActors")) {
      entries.push(...await this.getCompendiumActorEntries());
    }

    const includeTypes = splitSetting(game.settings.get(MODULE_ID, "actorTypes"));
    const excludeTypes = splitSetting(game.settings.get(MODULE_ID, "excludedActorTypes"));

    this.cache = entries
      .filter((entry) => this.typeAllowed(entry.type, includeTypes, excludeTypes))
      .sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));

    if (this.warnings.length) {
      ui.notifications.warn(game.i18n.localize("MKACTORS.LoadingFailed"));
      console.warn(game.i18n.localize("MKACTORS.SourceWarningsConsole"), this.warnings);
      debugLog("Actor source warnings recorded", { warnings: this.warnings });
    }

    debugLog("Actor entries loaded", {
      beforeTypeFilter: entries.length,
      afterTypeFilter: this.cache.length,
      includeTypes,
      excludeTypes
    });

    return this.cache;
  }

  getWorldActorEntries() {
    const entries = game.actors.contents
      .filter((actor) => canViewActor(actor))
      .map((actor) => {
        const type = String(actor.type || "");
        const sourceLabel = game.i18n.localize("MKACTORS.World");
        return {
          id: actor.id,
          uuid: actor.uuid,
          name: actor.name || "Unnamed Actor",
          img: getActorImage(actor),
          type,
          typeLabel: titleCase(type),
          folderId: this.getActorFolderId(actor),
          folderPathIds: this.getActorFolderPathIds(actor),
          sourceKind: "world",
          sourceId: "world",
          sourceLabel,
          packLabel: "",
          searchText: this.buildSearchText(actor.name, type, sourceLabel)
        };
      });
    debugLog("World Actor entries loaded", { count: entries.length });
    return entries;
  }

  getActorFolderId(actor) {
    const folder = actor.folder;
    if (!folder) return "";
    if (typeof folder === "string") return folder;
    return folder.id || "";
  }

  getActorFolderPathIds(actor) {
    const folderId = this.getActorFolderId(actor);
    if (!folderId) return [];

    const folderById = this.getWorldActorFolderMap();
    const pathIds = [];
    let currentId = folderId;
    const seen = new Set();

    while (currentId && !seen.has(currentId)) {
      seen.add(currentId);
      pathIds.push(currentId);
      currentId = this.getFolderParentId(folderById.get(currentId));
    }

    return pathIds;
  }

  getWorldActorFolderMap() {
    const folders = game.folders?.contents || [];
    return new Map(folders
      .filter((folder) => (folder.type || folder.documentName) === "Actor")
      .map((folder) => [folder.id, folder]));
  }

  getFolderParentId(folder) {
    if (!folder) return "";
    if (typeof folder.folder === "string") return folder.folder;
    if (folder.folder?.id) return folder.folder.id;
    if (typeof folder.parent === "string") return folder.parent;
    if (folder.parent?.id) return folder.parent.id;
    return folder._source?.folder || "";
  }

  async getCompendiumActorEntries() {
    const onlyVisiblePacks = game.settings.get(MODULE_ID, "showOnlyVisiblePacks");
    const entries = [];

    for (const pack of game.packs) {
      const documentName = pack.documentName || pack.metadata?.type;
      if (documentName !== "Actor") continue;
      if (onlyVisiblePacks && pack.visible === false) continue;

      try {
        const index = await pack.getIndex({ fields: ["img", "type", "folder", "prototypeToken.texture.src"] });
        debugLog("Compendium Actor index loaded", { pack: pack.collection, count: index.size ?? index.length ?? 0 });
        for (const entry of index) {
          const type = String(entry.type || "");
          const sourceLabel = pack.metadata?.label || pack.title || pack.collection;
          entries.push({
            id: entry._id,
            uuid: getUuidForIndex(pack, entry),
            name: entry.name || "Unnamed Actor",
            img: getActorImage(entry),
            type,
            typeLabel: titleCase(type),
            sourceKind: "compendium",
            sourceId: pack.collection,
            sourceLabel,
            packLabel: sourceLabel,
            searchText: this.buildSearchText(entry.name, type, sourceLabel, pack.collection)
          });
        }
      } catch (err) {
        debugLog("Compendium Actor index failed", { pack: pack.collection, error: err });
        this.warnings.push({ pack: pack.collection, error: err });
      }
    }

    debugLog("Compendium Actor entries loaded", { count: entries.length, onlyVisiblePacks });
    return entries;
  }

  typeAllowed(type, includeTypes, excludeTypes) {
    const value = String(type || "").toLowerCase();
    if (includeTypes.length && !includeTypes.includes(value)) return false;
    if (excludeTypes.includes(value)) return false;
    return true;
  }

  filterByControls(entries) {
    return entries.filter((entry) => {
      if (this.filters.type && entry.type !== this.filters.type) return false;
      if (this.filters.source && !this.sourceAllowed(entry, this.filters.source)) return false;
      return true;
    });
  }

  sourceAllowed(entry, source) {
    if (source === "world") return entry.sourceKind === "world";
    if (source === "world-unfiled") return entry.sourceKind === "world" && !entry.folderId;
    if (source.startsWith("world-folder:")) {
      const folderId = source.slice("world-folder:".length);
      return entry.sourceKind === "world" && entry.folderPathIds?.includes(folderId);
    }
    if (source.startsWith("compendium:")) {
      const sourceId = source.slice("compendium:".length);
      return entry.sourceKind === "compendium" && entry.sourceId === sourceId;
    }
    return entry.sourceId === source;
  }

  getTypeOptions(entries) {
    const typeValues = Array.from(new Set(entries.map((entry) => entry.type).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, game.i18n.lang));

    return [
      {
        value: "",
        label: game.i18n.localize("MKACTORS.AllTypes"),
        selected: this.filters.type === ""
      },
      ...typeValues.map((type) => ({
        value: type,
        label: titleCase(type),
        selected: this.filters.type === type
      }))
    ];
  }

  getSourceTree(entries) {
    const selected = this.filters.source || "";
    const worldEntries = entries.filter((entry) => entry.sourceKind === "world");
    const compendiumEntries = entries.filter((entry) => entry.sourceKind === "compendium");
    const tree = [
      {
        value: "",
        label: game.i18n.localize("MKACTORS.AllSources"),
        icon: "fas fa-layer-group",
        count: entries.length,
        depth: 0,
        selected: selected === ""
      }
    ];

    if (worldEntries.length) {
      tree.push({
        value: "world",
        label: game.i18n.localize("MKACTORS.World"),
        icon: "fas fa-globe",
        count: worldEntries.length,
        depth: 0,
        selected: selected === "world"
      });

      tree.push(...this.getWorldFolderTreeItems(worldEntries, selected));
    }

    const compendiumCounts = new Map();
    for (const entry of compendiumEntries) {
      const current = compendiumCounts.get(entry.sourceId) || {
        value: `compendium:${entry.sourceId}`,
        label: entry.sourceLabel,
        icon: "fas fa-book-atlas",
        count: 0,
        depth: 0,
        selected: selected === `compendium:${entry.sourceId}`
      };
      current.count += 1;
      compendiumCounts.set(entry.sourceId, current);
    }

    tree.push(...Array.from(compendiumCounts.values())
      .sort((a, b) => a.label.localeCompare(b.label, game.i18n.lang)));

    return tree;
  }

  getWorldFolderTreeItems(worldEntries, selected) {
    const folderById = this.getWorldActorFolderMap();
    const childrenByParent = new Map();
    const directCounts = new Map();
    const subtreeCounts = new Map();
    let unfiledCount = 0;

    for (const folder of folderById.values()) {
      const parentId = this.getFolderParentId(folder);
      if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
      childrenByParent.get(parentId).push(folder);
    }

    for (const entry of worldEntries) {
      if (!entry.folderId) {
        unfiledCount += 1;
        continue;
      }

      directCounts.set(entry.folderId, (directCounts.get(entry.folderId) || 0) + 1);
      for (const folderId of entry.folderPathIds || []) {
        subtreeCounts.set(folderId, (subtreeCounts.get(folderId) || 0) + 1);
      }
    }

    for (const children of childrenByParent.values()) {
      children.sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
    }

    const items = [];
    const visit = (parentId, depth) => {
      for (const folder of childrenByParent.get(parentId) || []) {
        const count = subtreeCounts.get(folder.id) || directCounts.get(folder.id) || 0;
        if (!count) continue;

        const value = `world-folder:${folder.id}`;
        items.push({
          value,
          label: folder.name || game.i18n.localize("MKACTORS.UnnamedFolder"),
          icon: "fas fa-folder",
          count,
          depth,
          selected: selected === value
        });
        visit(folder.id, depth + 1);
      }
    };

    visit("", 1);

    if (unfiledCount) {
      items.push({
        value: "world-unfiled",
        label: game.i18n.localize("MKACTORS.Unfiled"),
        icon: "fas fa-folder-open",
        count: unfiledCount,
        depth: 1,
        selected: selected === "world-unfiled"
      });
    }

    return items;
  }

  buildSearchText(...parts) {
    return parts
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  }

  applySearchFilter(root) {
    const query = String(this.filters.search || "").trim().toLowerCase();
    let visible = 0;

    for (const card of root.querySelectorAll?.(".mk-actors__card") || []) {
      const matches = !query || card.dataset.search?.includes(query);
      card.classList.toggle("is-hidden", !matches);
      if (matches) visible += 1;
    }

    const count = root.querySelector?.("[data-role='result-count']");
    if (count) count.textContent = String(visible);
    debugLog("Search filter applied", { search: query, visible });
  }

  onDragStart(event) {
    const uuid = event.currentTarget.dataset.uuid;
    const dragData = { type: "Actor", uuid };
    const serialized = JSON.stringify(dragData);

    event.dataTransfer.setData("text/plain", serialized);
    event.dataTransfer.setData("application/json", serialized);
    event.dataTransfer.effectAllowed = "copy";
    debugLog("Actor drag started", { uuid });
  }

  async openActorSheet(uuid) {
    debugLog("Actor sheet open requested", { uuid });
    const actor = await resolveActor(uuid);
    if (!actor) {
      debugLog("Actor sheet open blocked: Actor could not be resolved", { uuid });
      ui.notifications.warn(game.i18n.localize("MKACTORS.CannotResolveActor"));
      return;
    }

    actor.sheet?.render(true);
    debugLog("Actor sheet render requested", { uuid: actor.uuid, name: actor.name });
  }

  async openTokenPortraitEditor(uuid) {
    debugLog("Token portrait editor requested", { uuid });
    const actor = await resolveActor(uuid);
    if (!actor) {
      debugLog("Token portrait editor blocked: Actor could not be resolved", { uuid });
      ui.notifications.warn(game.i18n.localize("MKACTORS.CannotResolveActor"));
      return;
    }

    await openTokenPortraitDialog(actor, {
      onUpdated: () => {
        this.invalidateCache();
        this.render(true);
      }
    });
  }

  async onCardDoubleClick(event) {
    if (event.target.closest?.("button, input, select, textarea, a")) return;

    event.preventDefault();
    event.stopPropagation();
    debugLog("Actor card double-clicked", { uuid: event.currentTarget.dataset.uuid });

    await this.openActorSheet(event.currentTarget.dataset.uuid);
  }

  async onPortraitContextMenu(event) {
    event.preventDefault();
    event.stopPropagation();

    const card = event.currentTarget.closest?.("[data-uuid]");
    debugLog("Portrait context menu requested", { uuid: card?.dataset.uuid });
    this.openPortraitContextMenu(event, card?.dataset.uuid);
  }

  openPortraitContextMenu(event, uuid) {
    if (!uuid) return;

    closePortraitContextMenu();
    debugLog("Opening portrait context menu", { uuid, x: event.clientX, y: event.clientY });

    const menu = document.createElement("nav");
    menu.className = "mk-actors-context-menu";
    menu.innerHTML = `
      <button type="button">
        <i class="fas fa-image"></i>
        <span>${localize("EditTokenPortrait")}</span>
      </button>
    `;

    const close = () => {
      menu.remove();
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      if (activePortraitContextMenu?.menu === menu) activePortraitContextMenu = null;
    };

    const onPointerDown = (pointerEvent) => {
      if (!menu.contains(pointerEvent.target)) close();
    };

    const onKeyDown = (keyEvent) => {
      if (keyEvent.key === "Escape") close();
    };

    menu.querySelector("button")?.addEventListener("click", async () => {
      close();
      debugLog("Portrait context menu action selected", { uuid, action: "edit-token-portrait" });
      await this.openTokenPortraitEditor(uuid);
    });

    activePortraitContextMenu = { menu, close };
    document.body.appendChild(menu);

    const rect = menu.getBoundingClientRect();
    const left = Math.min(event.clientX, window.innerWidth - rect.width - 8);
    const top = Math.min(event.clientY, window.innerHeight - rect.height - 8);
    menu.style.left = `${Math.max(8, left)}px`;
    menu.style.top = `${Math.max(8, top)}px`;

    setTimeout(() => {
      document.addEventListener("mousedown", onPointerDown);
      document.addEventListener("keydown", onKeyDown);
    }, 0);
  }

  async onOpenSheet(event) {
    event.preventDefault();
    event.stopPropagation();

    debugLog("Open sheet button clicked", { uuid: event.currentTarget.dataset.uuid });
    await this.openActorSheet(event.currentTarget.dataset.uuid);
  }
}
