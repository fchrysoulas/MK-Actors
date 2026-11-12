import { DEFAULT_ACTOR_IMAGE, GALLERY_PAGE_SIZE, MODULE_ID } from "./constants.js";
import { debugLog } from "./debug.js";
import { resolveActor } from "./documents.js";
import {
  canModifyActor,
  canViewActor,
  getActorImage,
  getUuidForIndex,
  titleCase
} from "./actor-helpers.js";
import { MKTokenPortraitEditor } from "./token-portrait-editor.js";
import { localize } from "./utils.js";
import { prepareWindowDrag } from "./window-drag.js";
import { openTokenShadowSettings } from "./token-shadow-controls.js";
import { canImportActors } from "./actor-import.js";
import { MKActorImportApp } from "./actor-import-app.js";

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
    this.cacheVersion = 0;
    this.cacheLoad = null;
    this.browseOptions = null;
    this.warnings = [];
    this.filters = {
      search: "",
      type: "",
      source: ""
    };
    this.visibleLimit = GALLERY_PAGE_SIZE;
    this.searchRenderTimer = null;
    this.restoreSearchFocus = false;
    this.tokenEditors = new Map();
    this.pendingGridAnchor = null;
    this.sourcesCollapsed = false;
    this.favoriteActors = this.readFavorites();
    this.savingFavorite = false;
    this.actorImportApp = null;
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
    this.windowDrag = prepareWindowDrag(this, this.windowDrag);
    this.activateListeners(this.element);
    this.restoreGridAnchor(this.element);
    if (this.restoreSearchFocus) {
      const input = this.element.querySelector?.("[data-action='search']");
      input?.focus();
      input?.setSelectionRange?.(input.value.length, input.value.length);
      this.restoreSearchFocus = false;
    }
  }

  _onClose(options) {
    this.windowDrag?.destroy();
    this.windowDrag = null;
    super._onClose(options);
  }

  invalidateCache() {
    debugLog("Invalidating gallery cache");
    if (!this.pendingGridAnchor) {
      this.pendingGridAnchor = this.getGridAnchor(
        this.element?.querySelector?.(".mk-actors__card")
      );
    }
    this.cache = null;
    this.cacheVersion += 1;
    this.cacheLoad = null;
    this.browseOptions = null;
    this.warnings = [];
  }

  async getData(_options = {}) {
    debugLog("Preparing gallery data", { state: { ...this.filters } });
    this.favoriteActors = this.readFavorites();
    const allActors = await this.getActorEntries();
    const filteredByControls = this.filterByControls(allActors);
    const visibleActors = filteredByControls.slice(0, this.visibleLimit).map((entry) => {
      const favorite = this.favoriteActors.has(entry.uuid);
      return { ...entry, favorite, favoriteLabel: localize(favorite ? "RemoveFavorite" : "AddFavorite") };
    });
    const { types, sourceTree } = this.getBrowseOptions(allActors);
    const activeSource = sourceTree.find((source) => source.selected) || sourceTree[0];
    const sourceLocation = localize(this.filters.source === "favorites" ? "FavoriteActorsLocation"
      : !this.filters.source ? "AllActorSources"
      : this.filters.source.startsWith("compendium:") ? "ActorCompendium" : "WorldActors");
    const emptyFavorites = this.filters.source === "favorites"
      && sourceTree.find((source) => source.value === "favorites").count === 0;
    const cardSize = Number(game.settings.get(MODULE_ID, "cardSize")) || 150;
    debugLog("Gallery data prepared", {
      totalActors: allActors.length,
      filteredActors: filteredByControls.length,
      renderedActors: visibleActors.length,
      types: types.length,
      treeItems: sourceTree.length,
      cardSize
    });

    return {
      actors: visibleActors,
      hasActors: filteredByControls.length > 0,
      hasMore: visibleActors.length < filteredByControls.length,
      resultCount: filteredByControls.length,
      types,
      sourceTree,
      activeSource,
      sourceLocation,
      sourcesCollapsed: this.sourcesCollapsed,
      sourcesToggleLabel: localize(this.sourcesCollapsed ? "ExpandSources" : "CollapseSources"),
      state: this.filters,
      cardSize,
      canImportActors: canImportActors(),
      showTokenShadowSettings: game.user?.isGM === true,
      warnings: this.warnings,
      emptyMessage: localize(emptyFavorites ? "NoFavorites" : "NoActors")
    };
  }

  activateListeners(html) {
    const root = html?.[0] || html;
    debugLog("Activating gallery listeners");

    root.querySelector?.("[data-action='import-actor']")?.addEventListener("click", () => {
      void this.openActorImport().catch((error) => {
        console.error(`${MODULE_ID} | Could not open Actor import.`, error);
        ui.notifications.error(game.i18n.format("MKACTORS.ImportActorFailed", { message: error.message }));
      });
    });

    root.querySelector?.("[data-action='toggle-sources']")?.addEventListener("click", () => this.toggleSources(root));
    root.querySelector?.("[data-action='configure-token-shadows']")?.addEventListener("click", () => {
      void openTokenShadowSettings();
    });

    root.querySelector?.("[data-action='search']")?.addEventListener("input", (event) => {
      this.filters.search = event.currentTarget.value || "";
      this.visibleLimit = GALLERY_PAGE_SIZE;
      this.restoreSearchFocus = true;
      debugLog("Search filter changed", { search: this.filters.search });
      clearTimeout(this.searchRenderTimer);
      this.searchRenderTimer = setTimeout(() => this.render(false), 150);
    });

    root.querySelector?.("[data-action='type']")?.addEventListener("change", (event) => {
      this.filters.type = event.currentTarget.value || "";
      this.visibleLimit = GALLERY_PAGE_SIZE;
      debugLog("Type filter changed", { type: this.filters.type });
      this.render(false);
    });

    for (const button of root.querySelectorAll?.("[data-action='source-tree']") || []) {
      button.addEventListener("click", (event) => {
        this.filters.source = event.currentTarget.dataset.source || "";
        this.visibleLimit = GALLERY_PAGE_SIZE;
        debugLog("Source tree filter changed", { source: this.filters.source });
        this.render(false);
      });
    }

    root.querySelector?.("[data-action='clear']")?.addEventListener("click", () => {
      this.filters.search = "";
      this.filters.type = "";
      this.filters.source = "";
      this.visibleLimit = GALLERY_PAGE_SIZE;
      debugLog("Gallery filters cleared");
      this.render(false);
    });

    root.querySelector?.("[data-action='refresh']")?.addEventListener("click", () => {
      debugLog("Manual gallery refresh requested");
      this.visibleLimit = GALLERY_PAGE_SIZE;
      this.invalidateCache();
      this.render(false);
    });

    for (const card of root.querySelectorAll?.("[data-action='drag-actor']") || []) {
      card.addEventListener("dragstart", this.onDragStart.bind(this));
      card.addEventListener("dblclick", this.onCardDoubleClick.bind(this));
      card.addEventListener("contextmenu", this.onCardContextMenu.bind(this));
    }

    for (const portrait of root.querySelectorAll?.("[data-role='actor-portrait']") || []) {
      portrait.addEventListener("error", (event) => {
        event.currentTarget.src = DEFAULT_ACTOR_IMAGE;
      }, { once: true });
    }

    for (const button of root.querySelectorAll?.("[data-action='open-sheet']") || []) {
      button.addEventListener("click", this.onOpenSheet.bind(this));
    }

    for (const button of root.querySelectorAll?.("[data-action='toggle-favorite']") || []) {
      button.addEventListener("click", this.onToggleFavorite.bind(this));
    }

    root.querySelector?.("[data-action='load-more']")?.addEventListener("click", () => {
      this.pendingGridAnchor = this.getGridAnchor(root.querySelector?.(".mk-actors__card"));
      this.visibleLimit += GALLERY_PAGE_SIZE;
      debugLog("Loading more Actor cards", { visibleLimit: this.visibleLimit });
      this.render(false);
    });

  }

  toggleSources(root) {
    this.sourcesCollapsed = !this.sourcesCollapsed;
    root.querySelector?.(".mk-actors__body")?.classList.toggle("is-sources-collapsed", this.sourcesCollapsed);
    const button = root.querySelector?.("[data-action='toggle-sources']");
    const label = localize(this.sourcesCollapsed ? "ExpandSources" : "CollapseSources");
    button?.setAttribute("aria-expanded", String(!this.sourcesCollapsed));
    button?.setAttribute("aria-label", label);
    button?.setAttribute("title", label);
    const icon = button?.querySelector("i");
    icon?.classList.toggle("fa-chevron-left", !this.sourcesCollapsed);
    icon?.classList.toggle("fa-chevron-right", this.sourcesCollapsed);
  }

  readFavorites() {
    const saved = game.settings?.get?.(MODULE_ID, "favoriteActors");
    return new Set(Array.isArray(saved) ? saved.filter((uuid) => typeof uuid === "string" && uuid.length) : []);
  }

  async onToggleFavorite(event) {
    event.preventDefault();
    event.stopPropagation();
    const button = event.currentTarget;
    const uuid = button.dataset.uuid;
    if (!uuid || this.savingFavorite) return;

    this.savingFavorite = true;
    button.disabled = true;
    const favorites = this.readFavorites();
    if (favorites.has(uuid)) favorites.delete(uuid);
    else favorites.add(uuid);

    try {
      await game.settings.set(MODULE_ID, "favoriteActors", Array.from(favorites));
      this.favoriteActors = favorites;
      const restoreFocus = button.ownerDocument?.activeElement === button;
      const root = this.element?.[0] || this.element;
      const card = button.closest?.(".mk-actors__card");
      this.pendingGridAnchor = this.getGridAnchor(card?.isConnected === false
        ? root?.querySelector?.(".mk-actors__card") : card);
      await this.render(false);
      if (restoreFocus) {
        const renderedRoot = this.element?.[0] || this.element;
        const focusButton = Array.from(renderedRoot?.querySelectorAll?.("[data-action='toggle-favorite']") || [])
          .find((entry) => entry.dataset.uuid === uuid)
          || renderedRoot?.querySelector?.("[data-source='favorites']");
        focusButton?.focus({ preventScroll: true });
      }
    } catch (error) {
      console.error(`${MODULE_ID} | Could not update favorite Actors`, error);
      ui.notifications.error(localize("FavoritesUpdateFailed"));
    } finally {
      this.savingFavorite = false;
      button.disabled = false;
    }
  }

  async getActorEntries() {
    if (this.cache) {
      debugLog("Using cached Actor entries", { count: this.cache.length });
      return this.cache;
    }
    if (this.cacheLoad) return this.cacheLoad;

    const load = this.loadActorEntries(this.cacheVersion);
    this.cacheLoad = load;
    try {
      return await load;
    } finally {
      if (this.cacheLoad === load) this.cacheLoad = null;
    }
  }

  async loadActorEntries(cacheVersion) {
    const entries = [];
    const warnings = [];
    debugLog("Loading Actor entries", {
      includeWorldActors: game.settings.get(MODULE_ID, "includeWorldActors"),
      includeCompendiumActors: game.settings.get(MODULE_ID, "includeCompendiumActors")
    });

    if (game.settings.get(MODULE_ID, "includeWorldActors")) {
      entries.push(...this.getWorldActorEntries());
    }

    if (game.settings.get(MODULE_ID, "includeCompendiumActors")) {
      entries.push(...await this.getCompendiumActorEntries(warnings));
    }

    // An invalidated load must not replace newer results or report stale warnings.
    if (cacheVersion !== this.cacheVersion) return this.getActorEntries();

    this.cache = entries.sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
    this.warnings = warnings;

    if (this.warnings.length) {
      ui.notifications.warn(game.i18n.localize("MKACTORS.LoadingFailed"));
      console.warn(game.i18n.localize("MKACTORS.SourceWarningsConsole"), this.warnings);
      debugLog("Actor source warnings recorded", { warnings: this.warnings });
    }

    debugLog("Actor entries loaded", {
      count: this.cache.length
    });

    return this.cache;
  }

  getWorldActorEntries() {
    const folderById = this.getWorldActorFolderMap();
    const folderPaths = new Map([["", []]]);
    const sourceLabel = game.i18n.localize("MKACTORS.World");
    const entries = game.actors.contents
      .filter((actor) => canViewActor(actor))
      .map((actor) => {
        const type = String(actor.type || "");
        const folderId = this.getActorFolderId(actor);
        if (!folderPaths.has(folderId)) {
          folderPaths.set(folderId, this.getActorFolderPathIds(actor, folderById));
        }
        return {
          id: actor.id,
          uuid: actor.uuid,
          name: actor.name || game.i18n.localize("MKACTORS.UnnamedActor"),
          img: getActorImage(actor),
          type,
          typeLabel: titleCase(type),
          folderId,
          folderPathIds: folderPaths.get(folderId),
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

  getActorFolderPathIds(actor, folderById = null) {
    const folderId = this.getActorFolderId(actor);
    if (!folderId) return [];

    folderById ??= this.getWorldActorFolderMap();
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

  async getCompendiumActorEntries(warnings = this.warnings) {
    const onlyVisiblePacks = game.settings.get(MODULE_ID, "showOnlyVisiblePacks");
    const packs = Array.from(game.packs).filter((pack) => {
      const documentName = pack.documentName || pack.metadata?.type;
      if (documentName !== "Actor") return false;
      if (pack.visible === false && (onlyVisiblePacks || !game.user?.isGM)) return false;
      return true;
    });

    const packEntries = await Promise.all(packs.map(async (pack) => {
      try {
        const index = await pack.getIndex({ fields: ["img", "type", "folder", "prototypeToken.texture.src"] });
        debugLog("Compendium Actor index loaded", { pack: pack.collection, count: index.size ?? index.length ?? 0 });
        const entries = [];
        for (const entry of index) {
          const type = String(entry.type || "");
          const sourceLabel = pack.metadata?.label || pack.title || pack.collection;
          entries.push({
            id: entry._id,
            uuid: getUuidForIndex(pack, entry),
            name: entry.name || game.i18n.localize("MKACTORS.UnnamedActor"),
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
        return entries;
      } catch (err) {
        debugLog("Compendium Actor index failed", { pack: pack.collection, error: err });
        warnings.push({ pack: pack.collection, error: err });
        return [];
      }
    }));

    const entries = packEntries.flat();
    debugLog("Compendium Actor entries loaded", { count: entries.length, onlyVisiblePacks });
    return entries;
  }

  filterByControls(entries) {
    const query = String(this.filters.search || "").trim().toLowerCase();
    return entries.filter((entry) => {
      if (this.filters.type && entry.type !== this.filters.type) return false;
      if (this.filters.source && !this.sourceAllowed(entry, this.filters.source)) return false;
      if (query && !entry.searchText.includes(query)) return false;
      return true;
    });
  }

  sourceAllowed(entry, source) {
    if (source === "favorites") return this.favoriteActors.has(entry.uuid);
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

  getBrowseOptions(entries) {
    const lang = game.i18n.lang;
    if (this.browseOptions?.entries !== entries || this.browseOptions.lang !== lang) {
      this.browseOptions = {
        entries, lang,
        types: this.getTypeOptions(entries),
        sourceTree: this.getSourceTree(entries)
      };
    }
    return {
      types: this.browseOptions.types.map((option) => ({ ...option, selected: option.value === this.filters.type })),
      sourceTree: this.browseOptions.sourceTree.map((option) => ({
        ...option,
        count: option.value === "favorites"
          ? entries.reduce((count, entry) => count + Number(this.favoriteActors.has(entry.uuid)), 0) : option.count,
        selected: option.value === this.filters.source
      }))
    };
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
      },
      {
        value: "favorites",
        label: localize("Favorites"),
        icon: "fas fa-star",
        count: entries.filter((entry) => this.favoriteActors.has(entry.uuid)).length,
        depth: 0,
        selected: selected === "favorites"
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

  getGridAnchor(card) {
    const grid = card?.closest?.("[data-role='grid']");
    const uuid = card?.dataset?.uuid;
    if (!grid || !uuid) return null;

    return {
      uuid,
      offset: card.getBoundingClientRect().top - grid.getBoundingClientRect().top,
      scrollTop: grid.scrollTop ?? 0
    };
  }

  restoreGridAnchor(root) {
    const anchor = this.pendingGridAnchor;
    this.pendingGridAnchor = null;
    if (!anchor) return;

    const grid = root?.querySelector?.("[data-role='grid']");
    if (!grid) return;

    const card = Array.from(grid.querySelectorAll?.("[data-uuid]") || [])
      .find((entry) => entry.dataset.uuid === anchor.uuid);
    if (!card) {
      if (Number.isFinite(anchor.scrollTop)) grid.scrollTop = anchor.scrollTop;
      return;
    }

    const currentOffset = card.getBoundingClientRect().top - grid.getBoundingClientRect().top;
    grid.scrollTop += currentOffset - anchor.offset;
  }

  async openActorImport() {
    if (!canImportActors()) {
      ui.notifications.warn(localize("CannotImportActor"));
      return null;
    }
    if (this.actorImportApp) {
      await this.actorImportApp.maximize();
      this.actorImportApp.bringToFront();
      return this.actorImportApp;
    }
    const app = new MKActorImportApp({
      onImport: async () => {
        clearTimeout(this.searchRenderTimer);
        this.filters = { search: "", type: "", source: "world" };
        this.visibleLimit = GALLERY_PAGE_SIZE;
        this.invalidateCache();
        this.pendingGridAnchor = null;
        if (this.rendered) await this.render(false);
      },
      onClose: () => { this.actorImportApp = null; }
    });
    this.actorImportApp = app;
    try {
      await app.render(true);
      return app;
    } catch (error) {
      this.actorImportApp = null;
      throw error;
    }
  }

  async openTokenPortraitEditor(uuid) {
    debugLog("Token portrait popup requested", { uuid });
    const actor = await resolveActor(uuid);
    if (!actor) {
      ui.notifications.warn(localize("CannotResolveActor"));
      return;
    }
    if (!canModifyActor(actor)) {
      ui.notifications.warn(localize("CannotModifyActor"));
      return;
    }

    const existing = this.tokenEditors.get(actor.uuid);
    if (existing) {
      await existing.maximize();
      existing.bringToFront();
      return existing;
    }

    const editor = new MKTokenPortraitEditor(actor, {
      onApply: async () => {
        this.invalidateCache();
        if (this.rendered) await this.render(false);
      },
      onClose: () => this.tokenEditors.delete(actor.uuid)
    });
    this.tokenEditors.set(actor.uuid, editor);
    try {
      await editor.render(true);
      return editor;
    } catch (error) {
      this.tokenEditors.delete(actor.uuid);
      throw error;
    }
  }

  async onCardDoubleClick(event) {
    if (event.target.closest?.("button, input, select, textarea, a")) return;

    event.preventDefault();
    event.stopPropagation();
    debugLog("Actor card double-clicked", { uuid: event.currentTarget.dataset.uuid });

    await this.openActorSheet(event.currentTarget.dataset.uuid);
  }

  async onCardContextMenu(event) {
    if (event.target?.closest?.("[data-action='toggle-favorite']")) return;
    event.preventDefault();
    event.stopPropagation();
    await this.openTokenPortraitEditor(event.currentTarget.dataset.uuid);
  }

  async onOpenSheet(event) {
    event.preventDefault();
    event.stopPropagation();

    debugLog("Open sheet button clicked", { uuid: event.currentTarget.dataset.uuid });
    await this.openActorSheet(event.currentTarget.dataset.uuid);
  }
}
