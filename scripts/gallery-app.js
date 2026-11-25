import { COMPENDIUM_INDEX_CONCURRENCY, DEFAULT_ACTOR_IMAGE, GALLERY_PAGE_SIZE, MODULE_ID } from "./constants.js";
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
import { MKActorFolderImportApp } from "./actor-folder-import-app.js";

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
    const preferences = this.readBrowsingPreferences();
    this.filters = { search: preferences.search, type: preferences.type, source: preferences.source };
    this.browsingPreferencesSave = null;
    this.browsingPreferencesRevision = 0;
    this.browsingPreferencesWarningShown = false;
    this.visibleLimit = GALLERY_PAGE_SIZE;
    this.searchRenderTimer = null;
    this.restoreSearchFocus = false;
    this.tokenEditors = new Map();
    this.pendingGridAnchor = null;
    this.sourcesCollapsed = preferences.sourcesCollapsed;
    this.favoriteActors = this.readFavorites();
    this.savingFavorite = false;
    this.savingCompendiumPreference = false;
    this.actorImportApp = null;
    this.actorFolderImportApp = null;
    this.movingActors = new Set();
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

  async close(options = {}) {
    clearTimeout(this.searchRenderTimer);
    this.searchRenderTimer = null;
    this.restoreSearchFocus = false;
    await this.browsingPreferencesSave;
    return super.close(options);
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
    let { types, sourceTree } = this.getBrowseOptions(allActors);
    let correctedFilters = false;
    if (!types.some((option) => option.value === this.filters.type)) {
      this.filters.type = "";
      correctedFilters = true;
    }
    if (!sourceTree.some((option) => option.value === this.filters.source)) {
      this.filters.source = "";
      correctedFilters = true;
    }
    if (correctedFilters) {
      void this.saveBrowsingPreferences();
      ({ types, sourceTree } = this.getBrowseOptions(allActors));
    }
    const filteredByControls = this.filterByControls(allActors);
    const visibleActors = filteredByControls.slice(0, this.visibleLimit).map((entry) => {
      const favorite = this.favoriteActors.has(entry.uuid);
      return { ...entry, favorite, favoriteLabel: localize(favorite ? "RemoveFavorite" : "AddFavorite") };
    });
    const activeSource = sourceTree.find((source) => source.selected) || sourceTree[0];
    const sourceLocation = localize(this.filters.source === "favorites" ? "FavoriteActorsLocation"
      : !this.filters.source ? (this.includesCompendiums() ? "AllActorSources" : "WorldActors")
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
      includeCompendiumActors: this.includesCompendiums(),
      canToggleCompendiums: Boolean(game.settings.get(MODULE_ID, "includeCompendiumActors"))
        && !this.savingCompendiumPreference,
      compendiumsToggleLabel: localize(!game.settings.get(MODULE_ID, "includeCompendiumActors")
        ? "CompendiumsDisabled" : this.includesCompendiums() ? "HideCompendiumActors" : "IncludeCompendiumActors"),
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
    root.querySelector?.("[data-action='import-folder']")?.addEventListener("click", () => {
      void this.openActorImport({ folder: true }).catch((error) => {
        console.error(`${MODULE_ID} | Could not open folder import.`, error);
        ui.notifications.error(game.i18n.format("MKACTORS.ImportActorFailed", { message: error.message }));
      });
    });

    root.querySelector?.("[data-action='toggle-sources']")?.addEventListener("click", () => this.toggleSources(root));
    root.querySelector?.("[data-action='toggle-compendiums']")?.addEventListener("click", (event) => {
      void this.toggleCompendiums(event.currentTarget);
    });
    root.querySelector?.("[data-action='configure-token-shadows']")?.addEventListener("click", () => {
      void openTokenShadowSettings();
    });

    root.querySelector?.("[data-action='search']")?.addEventListener("input", (event) => {
      this.filters.search = event.currentTarget.value || "";
      void this.saveBrowsingPreferences();
      this.visibleLimit = GALLERY_PAGE_SIZE;
      this.restoreSearchFocus = true;
      debugLog("Search filter changed", { search: this.filters.search });
      clearTimeout(this.searchRenderTimer);
      this.searchRenderTimer = setTimeout(() => {
        this.searchRenderTimer = null;
        this.render(false);
      }, 150);
    });

    root.querySelector?.("[data-action='type']")?.addEventListener("change", (event) => {
      this.filters.type = event.currentTarget.value || "";
      void this.saveBrowsingPreferences();
      this.visibleLimit = GALLERY_PAGE_SIZE;
      debugLog("Type filter changed", { type: this.filters.type });
      this.render(false);
    });

    for (const button of root.querySelectorAll?.("[data-action='source-tree']") || []) {
      if (this.isWorldFolderSource(button.dataset.source)) {
        button.addEventListener("dragover", (event) => {
          if (!Array.from(event.dataTransfer?.types ?? []).some((type) => ["text/plain", "application/json"].includes(type))) return;
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = "move";
          button.classList.add("is-drop-target");
        });
        button.addEventListener("dragleave", (event) => {
          if (!button.contains(event.relatedTarget)) button.classList.remove("is-drop-target");
        });
        button.addEventListener("drop", (event) => { void this.onSourceDrop(event); });
      }
      button.addEventListener("click", (event) => {
        this.filters.source = event.currentTarget.dataset.source || "";
        void this.saveBrowsingPreferences();
        this.visibleLimit = GALLERY_PAGE_SIZE;
        debugLog("Source tree filter changed", { source: this.filters.source });
        this.render(false);
      });
    }

    root.querySelector?.("[data-action='clear']")?.addEventListener("click", () => {
      this.filters.search = "";
      this.filters.type = "";
      this.filters.source = "";
      void this.saveBrowsingPreferences();
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
      card.addEventListener("dragend", () => {
        for (const target of root.querySelectorAll(".is-drop-target")) target.classList.remove("is-drop-target");
      });
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

  includesCompendiums() {
    return Boolean(game.settings.get(MODULE_ID, "includeCompendiumActors"))
      && game.settings.get(MODULE_ID, "browseCompendiumActors") !== false;
  }

  async toggleCompendiums(button) {
    if (this.savingCompendiumPreference || !game.settings.get(MODULE_ID, "includeCompendiumActors")) return;
    this.savingCompendiumPreference = true;
    if (button) button.disabled = true;
    try {
      const include = !this.includesCompendiums();
      await game.settings.set(MODULE_ID, "browseCompendiumActors", include);
      if (!include && this.filters.source.startsWith("compendium:")) {
        this.filters.source = "";
        void this.saveBrowsingPreferences();
      }
      this.visibleLimit = GALLERY_PAGE_SIZE;
      this.invalidateCache();
      await this.render(false);
    } catch (error) {
      console.error(`${MODULE_ID} | Could not update compendium browsing.`, error);
      ui.notifications.error(localize("CompendiumToggleFailed"));
    } finally {
      this.savingCompendiumPreference = false;
      if (button) button.disabled = !game.settings.get(MODULE_ID, "includeCompendiumActors");
      const currentButton = this.element?.querySelector?.("[data-action='toggle-compendiums']");
      if (currentButton) currentButton.disabled = !game.settings.get(MODULE_ID, "includeCompendiumActors");
    }
  }

  toggleSources(root) {
    this.sourcesCollapsed = !this.sourcesCollapsed;
    void this.saveBrowsingPreferences();
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

  readBrowsingPreferences() {
    const saved = game.settings?.get?.(MODULE_ID, "browsingPreferences");
    return {
      search: typeof saved?.search === "string" ? saved.search : "",
      type: typeof saved?.type === "string" ? saved.type : "",
      source: typeof saved?.source === "string" ? saved.source : "",
      sourcesCollapsed: saved?.sourcesCollapsed === true
    };
  }

  saveBrowsingPreferences() {
    if (!game.settings?.set) return Promise.resolve();
    const preferences = { ...this.filters, sourcesCollapsed: this.sourcesCollapsed };
    const revision = ++this.browsingPreferencesRevision;
    // Serialize writes and skip obsolete queued snapshots while typing.
    this.browsingPreferencesSave = (this.browsingPreferencesSave ?? Promise.resolve()).then(async () => {
      if (revision !== this.browsingPreferencesRevision) return;
      try {
        await game.settings.set(MODULE_ID, "browsingPreferences", preferences);
        this.browsingPreferencesWarningShown = false;
      } catch (error) {
        console.error(`${MODULE_ID} | Could not save browsing preferences.`, error);
        if (!this.browsingPreferencesWarningShown) ui.notifications.warn(localize("BrowsingPreferencesSaveFailed"));
        this.browsingPreferencesWarningShown = true;
      }
    });
    return this.browsingPreferencesSave;
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
      includeCompendiumActors: this.includesCompendiums()
    });

    if (game.settings.get(MODULE_ID, "includeWorldActors")) {
      for (const entry of this.getWorldActorEntries()) entries.push(entry);
    }

    if (this.includesCompendiums()) {
      for (const entry of await this.getCompendiumActorEntries(warnings, cacheVersion)) entries.push(entry);
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

  async getCompendiumActorEntries(warnings = this.warnings, cacheVersion = this.cacheVersion) {
    const onlyVisiblePacks = game.settings.get(MODULE_ID, "showOnlyVisiblePacks");
    const packs = Array.from(game.packs).filter((pack) => {
      const documentName = pack.documentName || pack.metadata?.type;
      if (documentName !== "Actor") return false;
      if (pack.visible === false && (onlyVisiblePacks || !game.user?.isGM)) return false;
      return true;
    });

    const packEntries = new Array(packs.length);
    let nextPack = 0;
    const loadPacks = async () => {
      while (nextPack < packs.length && cacheVersion === this.cacheVersion) {
        const packIndex = nextPack++;
        const pack = packs[packIndex];
        try {
          const index = await pack.getIndex({ fields: ["img", "type", "folder", "prototypeToken.texture.src"] });
          if (cacheVersion !== this.cacheVersion) return;
          debugLog("Compendium Actor index loaded", { pack: pack.collection, count: index.size ?? index.length ?? 0 });
          const entries = [];
          const sourceLabel = pack.metadata?.label || pack.title || pack.collection;
          for (const entry of index) {
            const type = String(entry.type || "");
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
          packEntries[packIndex] = entries;
        } catch (err) {
          if (cacheVersion !== this.cacheVersion) return;
          debugLog("Compendium Actor index failed", { pack: pack.collection, error: err });
          warnings.push({ pack: pack.collection, error: err });
          packEntries[packIndex] = [];
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(COMPENDIUM_INDEX_CONCURRENCY, packs.length) }, () => loadPacks()));

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

    if (worldEntries.length || (game.settings.get(MODULE_ID, "includeWorldActors") && game.user?.isGM)) {
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
        if (!count && !game.user?.isGM && folder.displayed !== true) continue;

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
    event.dataTransfer.effectAllowed = "copyMove";
    debugLog("Actor drag started", { uuid });
  }

  isWorldFolderSource(source) {
    return source === "world" || source === "world-unfiled" || source?.startsWith("world-folder:");
  }

  async onSourceDrop(event) {
    const button = event.currentTarget;
    const source = button.dataset.source;
    if (!this.isWorldFolderSource(source)) return false;
    event.preventDefault();
    event.stopPropagation();
    button.classList.remove("is-drop-target");
    let data;
    try {
      data = JSON.parse(event.dataTransfer.getData("text/plain") || event.dataTransfer.getData("application/json"));
    } catch (_error) { return false; }
    // Moving is only defined for world Actors; compendium documents remain in their packs.
    if (data?.type !== "Actor" || typeof data.uuid !== "string" || !/^Actor\.[^.]+$/.test(data.uuid)) return false;
    const actor = game.actors?.get(data.uuid.slice("Actor.".length));
    if (!actor || actor.pack || !canModifyActor(actor)) {
      ui.notifications.warn(localize("CannotMoveActor"));
      return false;
    }
    const folderId = source.startsWith("world-folder:") ? source.slice("world-folder:".length) : "";
    const folder = folderId ? this.getWorldActorFolderMap().get(folderId) : null;
    if (folderId && (!folder || folder.pack)) {
      ui.notifications.warn(localize("MoveActorFolderUnavailable"));
      return false;
    }
    if (this.movingActors.has(actor.id) || this.getActorFolderId(actor) === folderId) return false;
    this.movingActors.add(actor.id);
    try {
      await actor.update({ folder: folderId || null });
      this.invalidateCache();
      if (this.rendered) await this.render(false);
      return true;
    } catch (error) {
      console.error(`${MODULE_ID} | Could not move Actor.`, error);
      ui.notifications.error(game.i18n.format("MKACTORS.MoveActorFailed", { message: error.message }));
      return false;
    } finally {
      this.movingActors.delete(actor.id);
    }
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

  async openActorImport({ folder = false } = {}) {
    if (!canImportActors()) {
      ui.notifications.warn(localize("CannotImportActor"));
      return null;
    }
    const key = folder ? "actorFolderImportApp" : "actorImportApp";
    if (this[key]) {
      await this[key].maximize();
      this[key].bringToFront();
      return this[key];
    }
    const ImportApp = folder ? MKActorFolderImportApp : MKActorImportApp;
    const app = new ImportApp({
      onImport: async () => {
        clearTimeout(this.searchRenderTimer);
        this.filters = { search: "", type: "", source: "world" };
        void this.saveBrowsingPreferences();
        this.visibleLimit = GALLERY_PAGE_SIZE;
        this.invalidateCache();
        this.pendingGridAnchor = null;
        if (this.rendered) await this.render(false);
      },
      onClose: () => { this[key] = null; }
    });
    this[key] = app;
    try {
      await app.render(true);
      return app;
    } catch (error) {
      this[key] = null;
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
