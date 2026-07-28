import { DEFAULT_ACTOR_IMAGE, GALLERY_PAGE_SIZE, MODULE_ID } from "./constants.js";
import { debugLog } from "./debug.js";
import { resolveActor } from "./documents.js";
import {
  canModifyActor,
  canViewActor,
  getActorImage,
  getUuidForIndex,
  splitSetting,
  titleCase
} from "./actor-helpers.js";
import { resolveFilePickerClass } from "./file-picker.js";
import { localize, normalizeNumber } from "./utils.js";

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
    this.visibleLimit = GALLERY_PAGE_SIZE;
    this.searchRenderTimer = null;
    this.restoreSearchFocus = false;
    this.selectedActorUuid = "";
    this.portraitClickTimer = null;
    this.pendingGridAnchor = null;
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
    this.restoreGridAnchor(this.element);
    if (this.restoreSearchFocus) {
      const input = this.element.querySelector?.("[data-action='search']");
      input?.focus();
      input?.setSelectionRange?.(input.value.length, input.value.length);
      this.restoreSearchFocus = false;
    }
  }

  invalidateCache() {
    debugLog("Invalidating gallery cache");
    if (this.selectedActorUuid && !this.pendingGridAnchor) {
      this.pendingGridAnchor = this.getGridAnchor(
        this.element?.querySelector?.(".mk-actors__card.is-selected")
      );
    }
    this.cache = null;
    this.warnings = [];
  }

  async getData(_options = {}) {
    debugLog("Preparing gallery data", { state: { ...this.filters } });
    const allActors = await this.getActorEntries();
    const filteredByControls = this.filterByControls(allActors);
    const visibleActors = filteredByControls
      .slice(0, this.visibleLimit)
      .map((entry) => ({
        ...entry,
        selected: entry.uuid === this.selectedActorUuid
      }));
    const types = this.getTypeOptions(allActors);
    const sourceTree = this.getSourceTree(allActors);
    const cardSize = Number(game.settings.get(MODULE_ID, "cardSize")) || 150;
    const editor = await this.getSelectedTokenEditorData();
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
      state: this.filters,
      cardSize,
      warnings: this.warnings,
      editor
    };
  }

  async getSelectedTokenEditorData() {
    if (!this.selectedActorUuid) return null;

    const actor = await resolveActor(this.selectedActorUuid);
    if (!actor || !canModifyActor(actor)) {
      this.selectedActorUuid = "";
      return null;
    }

    return this.buildTokenEditorData(actor);
  }

  buildTokenEditorData(actor) {
    const prototypeToken = actor.prototypeToken;
    const fit = prototypeToken?.texture?.fit || "height";
    const fits = [
      ["contain", "FitContain"],
      ["cover", "FitCover"],
      ["fill", "FitFill"],
      ["height", "FitHeight"],
      ["width", "FitWidth"]
    ];

    return {
      uuid: actor.uuid,
      name: actor.name || localize("UnnamedActor"),
      portraitImage: actor.img ?? "",
      width: prototypeToken?.width ?? 1,
      height: prototypeToken?.height ?? 1,
      fitOptions: fits.map(([value, label]) => ({
        value,
        label: localize(label),
        selected: value === fit
      })),
      anchorX: prototypeToken?.texture?.anchorX ?? 0.5,
      anchorY: prototypeToken?.texture?.anchorY ?? 0.5,
      scale: prototypeToken?.texture?.scaleX ?? prototypeToken?.texture?.scaleY ?? 1,
      labels: {
        title: localize("TokenPortraitEditorTitle"),
        close: localize("Close"),
        imagePath: localize("ImagePath"),
        browseImage: localize("BrowseImage"),
        imagePathPortraitNote: localize("ImagePathPortraitNote"),
        dimensionsGridSpaces: localize("DimensionsGridSpaces"),
        width: localize("Width"),
        height: localize("Height"),
        fitModeHeightNote: localize("FitModeHeightNote"),
        imageFitMode: localize("ImageFitMode"),
        imageFitModeHint: localize("ImageFitModeHint"),
        anchor: localize("Anchor"),
        x: localize("X"),
        y: localize("Y"),
        anchorHint: localize("AnchorHint"),
        scaleRatio: localize("ScaleRatio"),
        apply: localize("Apply")
      }
    };
  }

  activateListeners(html) {
    const root = html?.[0] || html;
    debugLog("Activating gallery listeners");

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
    }

    for (const portrait of root.querySelectorAll?.("[data-action='edit-token-portrait']") || []) {
      portrait.addEventListener("click", this.onPortraitClick.bind(this));
      portrait.addEventListener("keydown", this.onPortraitKeyDown.bind(this));
      portrait.addEventListener("error", (event) => {
        event.currentTarget.src = DEFAULT_ACTOR_IMAGE;
      }, { once: true });
    }

    for (const button of root.querySelectorAll?.("[data-action='open-sheet']") || []) {
      button.addEventListener("click", this.onOpenSheet.bind(this));
    }

    root.querySelector?.("[data-action='load-more']")?.addEventListener("click", () => {
      this.visibleLimit += GALLERY_PAGE_SIZE;
      debugLog("Loading more Actor cards", { visibleLimit: this.visibleLimit });
      this.render(false);
    });

    root.querySelector?.("[data-action='close-token-editor']")?.addEventListener("click", () => {
      this.pendingGridAnchor = this.getGridAnchor(
        root.querySelector?.(".mk-actors__card.is-selected")
      );
      this.selectedActorUuid = "";
      debugLog("Inline token portrait editor closed");
      this.render(false);
    });

    root.querySelector?.("[data-action='browse-token-image']")?.addEventListener(
      "click",
      this.onBrowseTokenImage.bind(this)
    );

    root.querySelector?.("[data-action='token-editor-form']")?.addEventListener(
      "submit",
      this.onTokenEditorSubmit.bind(this)
    );

    const scaleRange = root.querySelector?.("#mk-token-scale-range");
    const scaleInput = root.querySelector?.("#mk-token-scale");
    const portraitInput = root.querySelector?.("#mk-portrait-img");
    const portraitPreview = root.querySelector?.("[data-role='token-editor-preview']");

    scaleRange?.addEventListener("input", () => {
      if (scaleInput) scaleInput.value = scaleRange.value;
    });
    scaleInput?.addEventListener("input", () => {
      if (scaleRange) scaleRange.value = scaleInput.value;
    });
    portraitInput?.addEventListener("input", () => {
      if (portraitPreview && portraitInput.value) portraitPreview.src = portraitInput.value;
    });
    portraitPreview?.addEventListener("error", (event) => {
      event.currentTarget.src = DEFAULT_ACTOR_IMAGE;
    }, { once: true });
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
          name: actor.name || game.i18n.localize("MKACTORS.UnnamedActor"),
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
        this.warnings.push({ pack: pack.collection, error: err });
        return [];
      }
    }));

    const entries = packEntries.flat();
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
    const query = String(this.filters.search || "").trim().toLowerCase();
    return entries.filter((entry) => {
      if (this.filters.type && entry.type !== this.filters.type) return false;
      if (this.filters.source && !this.sourceAllowed(entry, this.filters.source)) return false;
      if (query && !entry.searchText.includes(query)) return false;
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

  onDragStart(event) {
    clearTimeout(this.portraitClickTimer);
    this.portraitClickTimer = null;
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
      offset: card.getBoundingClientRect().top - grid.getBoundingClientRect().top
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
    if (!card) return;

    const currentOffset = card.getBoundingClientRect().top - grid.getBoundingClientRect().top;
    grid.scrollTop += currentOffset - anchor.offset;
  }

  async selectTokenPortraitEditor(uuid, { gridAnchor = null } = {}) {
    debugLog("Inline token portrait editor requested", { uuid });
    const actor = await resolveActor(uuid);
    if (!actor) {
      debugLog("Inline token portrait editor blocked: Actor could not be resolved", { uuid });
      ui.notifications.warn(game.i18n.localize("MKACTORS.CannotResolveActor"));
      return;
    }

    if (!canModifyActor(actor)) {
      debugLog("Inline token portrait editor blocked: Actor cannot be modified", { uuid: actor.uuid });
      ui.notifications.warn(game.i18n.localize("MKACTORS.CannotModifyActor"));
      return;
    }

    this.selectedActorUuid = actor.uuid;
    this.pendingGridAnchor = gridAnchor;
    await this.render(false);
  }

  async onCardDoubleClick(event) {
    if (event.target.closest?.("button, input, select, textarea, a")) return;

    clearTimeout(this.portraitClickTimer);
    this.portraitClickTimer = null;
    event.preventDefault();
    event.stopPropagation();
    debugLog("Actor card double-clicked", { uuid: event.currentTarget.dataset.uuid });

    await this.openActorSheet(event.currentTarget.dataset.uuid);
  }

  onPortraitClick(event) {
    event.preventDefault();
    event.stopPropagation();

    const card = event.currentTarget.closest?.("[data-uuid]");
    const uuid = card?.dataset.uuid;
    if (!uuid) return;
    const gridAnchor = this.getGridAnchor(card);

    clearTimeout(this.portraitClickTimer);
    this.portraitClickTimer = setTimeout(() => {
      this.portraitClickTimer = null;
      this.selectTokenPortraitEditor(uuid, { gridAnchor });
    }, 300);
  }

  async onPortraitKeyDown(event) {
    if (!["Enter", " "].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();

    const card = event.currentTarget.closest?.("[data-uuid]");
    await this.selectTokenPortraitEditor(card?.dataset.uuid, {
      gridAnchor: this.getGridAnchor(card)
    });
  }

  async onBrowseTokenImage(event) {
    event.preventDefault();
    event.stopPropagation();

    const form = event.currentTarget.closest?.("form");
    const portraitInput = form?.querySelector("#mk-portrait-img");
    const portraitPreview = form?.querySelector("[data-role='token-editor-preview']");
    const FilePickerClass = resolveFilePickerClass();

    if (!FilePickerClass) {
      console.error("MK Actors | No compatible Foundry FilePicker constructor is available.");
      ui.notifications.error(localize("FilePickerUnavailable"));
      return;
    }

    try {
      const picker = new FilePickerClass({
        type: "image",
        current: portraitInput?.value || "",
        callback: (path) => {
          if (portraitInput) portraitInput.value = path;
          if (portraitPreview) portraitPreview.src = path;
        }
      });
      await picker.browse();
    } catch (err) {
      console.error(err);
      ui.notifications.error(game.i18n.format("MKACTORS.FilePickerFailed", {
        message: err.message ?? err
      }));
    }
  }

  async onTokenEditorSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form?.reportValidity() || !this.selectedActorUuid) return false;
    const gridAnchor = this.getGridAnchor(
      this.element?.querySelector?.(".mk-actors__card.is-selected")
    );

    const actor = await resolveActor(this.selectedActorUuid);
    if (!actor) {
      ui.notifications.warn(localize("CannotResolveActor"));
      this.selectedActorUuid = "";
      await this.render(false);
      return false;
    }
    if (!canModifyActor(actor)) {
      ui.notifications.warn(localize("CannotModifyActor"));
      return false;
    }

    const prototypeToken = actor.prototypeToken;
    const currentFit = prototypeToken?.texture?.fit || "height";
    const portraitImg = String(form.querySelector("#mk-portrait-img")?.value ?? "").trim();
    const requestedFit = String(form.querySelector("#mk-token-fit")?.value ?? currentFit);
    const allowedFits = new Set(["contain", "cover", "fill", "height", "width"]);

    if (!portraitImg) {
      ui.notifications.warn(localize("ImagePathRequired"));
      return false;
    }

    const updates = {
      img: portraitImg,
      "prototypeToken.width": normalizeNumber(
        form.querySelector("#mk-token-width")?.value,
        prototypeToken?.width ?? 1,
        { min: 0.5, step: 0.5 }
      ),
      "prototypeToken.height": normalizeNumber(
        form.querySelector("#mk-token-height")?.value,
        prototypeToken?.height ?? 1,
        { min: 0.5, step: 0.5 }
      ),
      "prototypeToken.texture.fit": allowedFits.has(requestedFit) ? requestedFit : "height",
      "prototypeToken.texture.anchorX": normalizeNumber(
        form.querySelector("#mk-token-anchor-x")?.value,
        prototypeToken?.texture?.anchorX ?? 0.5,
        { min: 0, max: 1 }
      ),
      "prototypeToken.texture.anchorY": normalizeNumber(
        form.querySelector("#mk-token-anchor-y")?.value,
        prototypeToken?.texture?.anchorY ?? 0.5,
        { min: 0, max: 1 }
      ),
      "prototypeToken.texture.scaleX": normalizeNumber(
        form.querySelector("#mk-token-scale")?.value,
        prototypeToken?.texture?.scaleX ?? prototypeToken?.texture?.scaleY ?? 1,
        { min: 0.2, max: 3, step: 0.05 }
      )
    };
    updates["prototypeToken.texture.scaleY"] = updates["prototypeToken.texture.scaleX"];

    try {
      await actor.update(updates, { mkActorsForcePortraitToTokenImage: true });
      this.invalidateCache();
      this.pendingGridAnchor = gridAnchor;
      ui.notifications.info(game.i18n.format("MKACTORS.TokenPortraitUpdated", { name: actor.name }));
      await this.render(false);
      return true;
    } catch (err) {
      console.error(err);
      ui.notifications.error(game.i18n.format("MKACTORS.TokenPortraitUpdateFailed", {
        message: err.message ?? err
      }));
      return false;
    }
  }

  async onOpenSheet(event) {
    event.preventDefault();
    event.stopPropagation();

    debugLog("Open sheet button clicked", { uuid: event.currentTarget.dataset.uuid });
    await this.openActorSheet(event.currentTarget.dataset.uuid);
  }
}
