const MODULE_ID = "mk-actors";
const DEFAULT_ACTOR_IMAGE = "icons/svg/mystery-man.svg";

class MKActorsApi {
  static app = null;

  static open() {
    debugLog("Opening gallery");
    if (!this.app) this.app = new MKActorsApp();
    this.app.render(true);
    debugLog("Gallery render requested", { appId: this.app.appId });
    return this.app;
  }

  static refresh() {
    debugLog("Refreshing gallery");
    if (!this.app) return this.open();
    this.app.invalidateCache();
    this.app.render(true);
    debugLog("Gallery cache invalidated and render requested", { appId: this.app.appId });
    return this.app;
  }

  static splitSetting(value) {
    return String(value ?? "")
      .split(",")
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean);
  }

  static getActorImage(actorOrIndex) {
    return actorOrIndex?.img
      || actorOrIndex?.prototypeToken?.texture?.src
      || actorOrIndex?.texture?.src
      || DEFAULT_ACTOR_IMAGE;
  }

  static titleCase(value) {
    const raw = String(value ?? "").trim();
    if (!raw) return "";
    return raw
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  static getUuidForIndex(pack, indexEntry) {
    return indexEntry.uuid || `Compendium.${pack.collection}.${indexEntry._id}`;
  }

  static getSourceLabel(entry) {
    if (entry.sourceKind === "world") return game.i18n.localize("MKACTORS.World");
    return entry.packLabel || game.i18n.localize("MKACTORS.Compendium");
  }

  static canViewActor(actor) {
    if (game.user?.isGM) return true;
    if (!actor?.testUserPermission) return true;
    try {
      return actor.testUserPermission(game.user, "OBSERVER");
    } catch (_err) {
      return true;
    }
  }

  static getViewCenterPosition() {
    const scene = canvas?.scene;
    const gridSize = canvas?.grid?.size || scene?.grid?.size || 100;
    let x = Number(scene?.width || 0) / 2;
    let y = Number(scene?.height || 0) / 2;

    try {
      if (canvas?.stage?.worldTransform && canvas?.app?.view) {
        const rect = canvas.app.view.getBoundingClientRect();
        const Point = globalThis.PIXI?.Point;
        const point = Point ? new Point(rect.width / 2, rect.height / 2) : {
          x: rect.width / 2,
          y: rect.height / 2
        };
        const world = canvas.stage.worldTransform.applyInverse(point);
        x = world.x;
        y = world.y;
      }
    } catch (_err) {
      // Fall back to scene midpoint.
    }

    return {
      x: Math.round(x / gridSize) * gridSize,
      y: Math.round(y / gridSize) * gridSize
    };
  }

  static getSceneCenterPosition() {
    return this.getViewCenterPosition();
  }

  static async resolveActor(uuid) {
    debugLog("Resolving Actor", { uuid });
    const document = await fromUuid(uuid);
    if (!document) {
      debugLog("Actor resolution failed", { uuid });
      return null;
    }
    if (document.documentName === "Actor" || document.constructor?.documentName === "Actor") {
      debugLog("Actor resolved", {
        uuid,
        id: document.id,
        name: document.name,
        pack: document.pack || ""
      });
      return document;
    }
    debugLog("Resolved document was not an Actor", { uuid, documentName: document.documentName });
    return null;
  }

  static async spawnAtViewCenter(uuid) {
    debugLog("Spawn requested", { uuid });
    if (!game.user?.isGM) {
      debugLog("Spawn blocked: current user is not GM", { uuid, userId: game.user?.id });
      ui.notifications.warn(game.i18n.localize("MKACTORS.GMRequired"));
      return null;
    }

    if (!canvas?.scene) {
      debugLog("Spawn blocked: no active Scene", { uuid });
      ui.notifications.warn(game.i18n.localize("MKACTORS.SceneRequired"));
      return null;
    }

    let actor = await this.resolveActor(uuid);
    if (!actor) {
      debugLog("Spawn blocked: Actor could not be resolved", { uuid });
      ui.notifications.warn(game.i18n.localize("MKACTORS.CannotResolveActor"));
      return null;
    }

    // Tokens need a world Actor. If this is a compendium Actor, import a world copy first.
    if (actor.pack) {
      debugLog("Importing compendium Actor before spawn", { uuid, pack: actor.pack, name: actor.name });
      actor = await Actor.create(actor.toObject(), { renderSheet: false });
      debugLog("Compendium Actor imported", { id: actor.id, uuid: actor.uuid, name: actor.name });
    }

    const position = this.getViewCenterPosition();
    debugLog("Spawn position calculated", { uuid: actor.uuid, position });
    let tokenData;

    if (actor.getTokenDocument) {
      const tokenDocument = await actor.getTokenDocument(position);
      tokenData = tokenDocument?.toObject ? tokenDocument.toObject() : tokenDocument;
    } else {
      tokenData = actor.prototypeToken?.toObject ? actor.prototypeToken.toObject() : {};
      tokenData = foundry.utils.mergeObject(tokenData, {
        x: position.x,
        y: position.y,
        actorId: actor.id,
        name: actor.name,
        img: MKActorsApi.getActorImage(actor)
      });
    }

    debugLog("Creating Token document", {
      actorId: actor.id,
      actorName: actor.name,
      sceneId: canvas.scene.id,
      x: tokenData?.x,
      y: tokenData?.y
    });

    const created = await canvas.scene.createEmbeddedDocuments("Token", [tokenData]);
    debugLog("Token document created", { actorId: actor.id, count: created?.length || 0 });
    return created;
  }

  static async spawnAtSceneCenter(uuid) {
    return this.spawnAtViewCenter(uuid);
  }
}

class MKActorsApp extends foundry.applications.api.ApplicationV2 {
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
    const sources = this.getSourceOptions(allActors);
    const cardSize = Number(game.settings.get(MODULE_ID, "cardSize")) || 150;
    debugLog("Gallery data prepared", {
      totalActors: allActors.length,
      visibleActors: filteredByControls.length,
      types: types.length,
      sources: sources.length,
      cardSize
    });

    return {
      actors: filteredByControls,
      hasActors: filteredByControls.length > 0,
      types,
      sources,
      state: this.filters,
      cardSize,
      canSpawn: game.user?.isGM,
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

    root.querySelector?.("[data-action='source']")?.addEventListener("change", (event) => {
      this.filters.source = event.currentTarget.value || "";
      debugLog("Source filter changed", { source: this.filters.source });
      this.render(false);
    });

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

    for (const button of root.querySelectorAll?.("[data-action='spawn-center']") || []) {
      button.addEventListener("click", this.onSpawnCenter.bind(this));
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

    const includeTypes = MKActorsApi.splitSetting(game.settings.get(MODULE_ID, "actorTypes"));
    const excludeTypes = MKActorsApi.splitSetting(game.settings.get(MODULE_ID, "excludedActorTypes"));

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
      .filter((actor) => MKActorsApi.canViewActor(actor))
      .map((actor) => {
        const type = String(actor.type || "");
        const sourceLabel = game.i18n.localize("MKACTORS.World");
        return {
          id: actor.id,
          uuid: actor.uuid,
          name: actor.name || "Unnamed Actor",
          img: MKActorsApi.getActorImage(actor),
          type,
          typeLabel: MKActorsApi.titleCase(type),
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
            uuid: MKActorsApi.getUuidForIndex(pack, entry),
            name: entry.name || "Unnamed Actor",
            img: MKActorsApi.getActorImage(entry),
            type,
            typeLabel: MKActorsApi.titleCase(type),
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
      if (this.filters.source && entry.sourceId !== this.filters.source) return false;
      return true;
    });
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
        label: MKActorsApi.titleCase(type),
        selected: this.filters.type === type
      }))
    ];
  }

  getSourceOptions(entries) {
    const sources = new Map();
    for (const entry of entries) sources.set(entry.sourceId, entry.sourceLabel);

    return [
      {
        value: "",
        label: game.i18n.localize("MKACTORS.AllSources"),
        selected: this.filters.source === ""
      },
      ...Array.from(sources.entries())
        .sort((a, b) => a[1].localeCompare(b[1], game.i18n.lang))
        .map(([value, label]) => ({ value, label, selected: this.filters.source === value }))
    ];
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
    const actor = await MKActorsApi.resolveActor(uuid);
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
    const actor = await MKActorsApi.resolveActor(uuid);
    if (!actor) {
      debugLog("Token portrait editor blocked: Actor could not be resolved", { uuid });
      ui.notifications.warn(game.i18n.localize("MKACTORS.CannotResolveActor"));
      return;
    }

    await openTokenPortraitDialog(actor);
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

  async onSpawnCenter(event) {
    event.preventDefault();
    event.stopPropagation();

    const uuid = event.currentTarget.dataset.uuid;
    debugLog("Spawn button clicked", { uuid });
    await MKActorsApi.spawnAtViewCenter(uuid);
  }
}

class MKActorsOpenGalleryMenu extends foundry.applications.api.ApplicationV2 {
  render(_force, _options = {}) {
    debugLog("Settings menu launcher opened");
    MKActorsApi.open();
    return this;
  }
}

function registerSettings() {
  game.settings.register(MODULE_ID, "includeWorldActors", {
    name: game.i18n.localize("MKACTORS.IncludeWorldActors"),
    hint: game.i18n.localize("MKACTORS.IncludeWorldActorsHint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    onChange: (value) => refreshAfterSettingChange("includeWorldActors", value)
  });

  game.settings.register(MODULE_ID, "includeCompendiumActors", {
    name: game.i18n.localize("MKACTORS.IncludeCompendiumActors"),
    hint: game.i18n.localize("MKACTORS.IncludeCompendiumActorsHint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    onChange: (value) => refreshAfterSettingChange("includeCompendiumActors", value)
  });

  game.settings.register(MODULE_ID, "actorTypes", {
    name: game.i18n.localize("MKACTORS.ActorTypes"),
    hint: game.i18n.localize("MKACTORS.ActorTypesHint"),
    scope: "world",
    config: true,
    type: String,
    default: "",
    onChange: (value) => refreshAfterSettingChange("actorTypes", value)
  });

  game.settings.register(MODULE_ID, "excludedActorTypes", {
    name: game.i18n.localize("MKACTORS.ExcludedActorTypes"),
    hint: game.i18n.localize("MKACTORS.ExcludedActorTypesHint"),
    scope: "world",
    config: true,
    type: String,
    default: "character,pc,player",
    onChange: (value) => refreshAfterSettingChange("excludedActorTypes", value)
  });

  game.settings.register(MODULE_ID, "showOnlyVisiblePacks", {
    name: game.i18n.localize("MKACTORS.ShowOnlyVisiblePacks"),
    hint: game.i18n.localize("MKACTORS.ShowOnlyVisiblePacksHint"),
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange: (value) => refreshAfterSettingChange("showOnlyVisiblePacks", value)
  });

  game.settings.register(MODULE_ID, "cardSize", {
    name: game.i18n.localize("MKACTORS.CardSize"),
    hint: game.i18n.localize("MKACTORS.CardSizeHint"),
    scope: "client",
    config: true,
    type: Number,
    default: 150,
    range: {
      min: 120,
      max: 260,
      step: 10
    },
    onChange: (value) => refreshAfterSettingChange("cardSize", value)
  });

  game.settings.register(MODULE_ID, "syncPortraitToTokenImage", {
    name: game.i18n.localize("MKACTORS.SyncPortraitToTokenImage"),
    hint: game.i18n.localize("MKACTORS.SyncPortraitToTokenImageHint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: (value) => debugLog("Setting changed", { setting: "syncPortraitToTokenImage", value })
  });

  game.settings.register(MODULE_ID, "debugMode", {
    name: game.i18n.localize("MKACTORS.DebugMode"),
    hint: game.i18n.localize("MKACTORS.DebugModeHint"),
    scope: "client",
    config: true,
    type: Boolean,
    default: false,
    onChange: (value) => debugLog("Debug mode changed", { enabled: value })
  });

  game.settings.registerMenu(MODULE_ID, "openGallery", {
    name: game.i18n.localize("MKACTORS.Open"),
    label: game.i18n.localize("MKACTORS.Open"),
    hint: game.i18n.localize("MKACTORS.OpenHint"),
    icon: "fas fa-users-viewfinder",
    type: MKActorsOpenGalleryMenu,
    restricted: false
  });
  debugLog("Settings registered");
}

function registerKeybinding() {
  if (!game.keybindings) return;

  game.keybindings.register(MODULE_ID, "openGallery", {
    name: game.i18n.localize("MKACTORS.Open"),
    hint: game.i18n.localize("MKACTORS.OpenHint"),
    editable: [
      {
        key: "KeyG",
        modifiers: ["CONTROL", "SHIFT"]
      }
    ],
    onDown: () => {
      debugLog("Open gallery keybinding pressed");
      MKActorsApi.open();
      return true;
    },
    restricted: false,
    precedence: CONST.KEYBINDING_PRECEDENCE?.NORMAL ?? 0
  });
  debugLog("Keybinding registered", { id: "openGallery" });
}

let activePortraitContextMenu = null;

function closePortraitContextMenu() {
  if (activePortraitContextMenu) {
    activePortraitContextMenu.close();
    return;
  }

  document.querySelector(".mk-actors-context-menu")?.remove();
}

function localize(key) {
  return game.i18n.localize(`MKACTORS.${key}`);
}

function isDebugModeEnabled() {
  try {
    return globalThis.game?.settings?.get(MODULE_ID, "debugMode") === true;
  } catch (_err) {
    return false;
  }
}

function debugLog(message, data = undefined) {
  if (!isDebugModeEnabled()) return;

  if (data === undefined) {
    console.debug(`MK Actors | ${message}`);
  } else {
    console.debug(`MK Actors | ${message}`, data);
  }
}

function refreshAfterSettingChange(setting, value) {
  debugLog("Setting changed", { setting, value });
  MKActorsApi.refresh();
}

function escapeHtml(value) {
  const element = document.createElement("textarea");
  element.textContent = String(value ?? "");
  return element.innerHTML;
}

function numberOrFallback(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

async function openTokenPortraitDialog(actor) {
  const prototypeToken = actor.prototypeToken;
  const portraitImage = actor.img ?? "";
  const width = prototypeToken?.width ?? 1;
  const height = prototypeToken?.height ?? 1;
  const fit = prototypeToken?.texture?.fit || "height";
  const anchorX = prototypeToken?.texture?.anchorX ?? 0.5;
  const anchorY = prototypeToken?.texture?.anchorY ?? 0.5;
  const scale = prototypeToken?.texture?.scaleX ?? prototypeToken?.texture?.scaleY ?? 1;
  const actorName = escapeHtml(actor.name || localize("UnnamedActor"));
  const fitOptions = [
    { value: "contain", label: localize("FitContain") },
    { value: "cover", label: localize("FitCover") },
    { value: "fill", label: localize("FitFill") },
    { value: "height", label: localize("FitHeight") },
    { value: "width", label: localize("FitWidth") }
  ].map((option) => ({
    ...option,
    selected: option.value === fit
  }));

  const content = await renderTemplate(`modules/${MODULE_ID}/templates/token-portrait-dialog.hbs`, {
    portraitImage,
    width,
    height,
    fitOptions,
    anchorX,
    anchorY,
    scale,
    labels: {
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
      scaleRatio: localize("ScaleRatio")
    }
  });

  debugLog("Opening token portrait dialog", {
    actorId: actor.id,
    actorUuid: actor.uuid,
    actorName: actor.name,
    portraitImage,
    tokenImage: prototypeToken?.texture?.src || "",
    width,
    height,
    fit,
    anchorX,
    anchorY,
    scale
  });

  new Dialog({
    title: `${localize("TokenPortraitDialogTitle")}: ${actorName}`,
    content,
    buttons: {
      apply: {
        icon: '<i class="fas fa-check"></i>',
        label: localize("Apply"),
        callback: async (html) => {
          const portraitImg = String(html.find("#mk-portrait-img").val() ?? "").trim();
          const tokenWidth = numberOrFallback(html.find("#mk-token-width").val(), width);
          const tokenHeight = numberOrFallback(html.find("#mk-token-height").val(), height);
          const tokenFit = String(html.find("#mk-token-fit").val() ?? "height");
          const tokenAnchorX = numberOrFallback(html.find("#mk-token-anchor-x").val(), anchorX);
          const tokenAnchorY = numberOrFallback(html.find("#mk-token-anchor-y").val(), anchorY);
          const tokenScale = numberOrFallback(html.find("#mk-token-scale").val(), scale);

          if (!portraitImg) {
            debugLog("Token portrait update blocked: image path required", {
              actorId: actor.id,
              actorUuid: actor.uuid
            });
            ui.notifications.warn(localize("ImagePathRequired"));
            return;
          }

          const updates = {
            img: portraitImg,
            "prototypeToken.width": tokenWidth,
            "prototypeToken.height": tokenHeight,
            "prototypeToken.texture.fit": tokenFit,
            "prototypeToken.texture.anchorX": tokenAnchorX,
            "prototypeToken.texture.anchorY": tokenAnchorY,
            "prototypeToken.texture.scaleX": tokenScale,
            "prototypeToken.texture.scaleY": tokenScale
          };

          try {
            debugLog("Updating Actor from token portrait dialog", {
              actorId: actor.id,
              actorUuid: actor.uuid,
              updates
            });
            await actor.update(updates, { mkActorsForcePortraitToTokenImage: true });
            MKActorsApi.refresh();
            debugLog("Actor updated from token portrait dialog", {
              actorId: actor.id,
              actorUuid: actor.uuid
            });
            ui.notifications.info(game.i18n.format("MKACTORS.TokenPortraitUpdated", { name: actor.name }));
          } catch (err) {
            debugLog("Token portrait update failed", {
              actorId: actor.id,
              actorUuid: actor.uuid,
              error: err
            });
            console.error(err);
            ui.notifications.error(game.i18n.format("MKACTORS.TokenPortraitUpdateFailed", {
              message: err.message ?? err
            }));
          }
        }
      },
      cancel: {
        icon: '<i class="fas fa-times"></i>',
        label: localize("Cancel")
      }
    },
    render: (html) => {
      const portraitInput = html.find("#mk-portrait-img")[0];
      const scaleRange = html.find("#mk-token-scale-range")[0];
      const scaleInput = html.find("#mk-token-scale")[0];

      html.find("#mk-browse-portrait").on("click", () => {
        new FilePicker({
          type: "image",
          current: portraitInput.value || "",
          callback: (path) => {
            portraitInput.value = path;
            debugLog("Token portrait image selected", {
              actorId: actor.id,
              actorUuid: actor.uuid,
              path
            });
          }
        }).browse();
      });

      scaleRange?.addEventListener("input", () => {
        scaleInput.value = scaleRange.value;
      });

      scaleInput?.addEventListener("input", () => {
        scaleRange.value = scaleInput.value;
      });
    },
    default: "apply"
  }).render(true);
}

function setUpdateProperty(changes, path, value) {
  changes[path] = value;
}

function shouldSyncPortraitToTokenImage(changes, options = {}) {
  if (options.mkActorsSyncPortraitToTokenImage) {
    debugLog("Portrait sync skipped: update was created by MK Actors sync", { changes });
    return false;
  }
  const enabled = options.mkActorsForcePortraitToTokenImage || game.settings.get(MODULE_ID, "syncPortraitToTokenImage");
  if (!enabled) {
    debugLog("Portrait sync skipped: setting disabled", { changes });
    return false;
  }
  if (!Object.prototype.hasOwnProperty.call(changes, "img")) {
    debugLog("Portrait sync skipped: Actor image not changed", { changes });
    return false;
  }
  if (typeof changes.img !== "string") {
    debugLog("Portrait sync skipped: Actor image change was not a string", { image: changes.img });
    return false;
  }
  if (!changes.img) {
    debugLog("Portrait sync skipped: Actor image change was empty");
    return false;
  }
  return true;
}

function syncPortraitToTokenImage(actor, changes, options) {
  if (!shouldSyncPortraitToTokenImage(changes, options)) return;

  setUpdateProperty(changes, "prototypeToken.texture.src", changes.img);
  debugLog("Portrait sync applied before Actor update", {
    actorId: actor?.id,
    actorUuid: actor?.uuid,
    image: changes.img
  });
}

async function ensurePortraitSyncedToTokenImage(actor, changes, options) {
  if (!shouldSyncPortraitToTokenImage(changes, options)) return;

  const portraitImage = actor.img || changes.img;
  const tokenImage = actor.prototypeToken?.texture?.src || "";
  if (!portraitImage || tokenImage === portraitImage) {
    debugLog("Portrait sync follow-up skipped: prototype token already matches", {
      actorId: actor.id,
      actorUuid: actor.uuid,
      portraitImage,
      tokenImage
    });
    return;
  }

  try {
    debugLog("Portrait sync follow-up updating prototype token image", {
      actorId: actor.id,
      actorUuid: actor.uuid,
      portraitImage,
      tokenImage
    });
    await actor.update(
      { "prototypeToken.texture.src": portraitImage },
      { mkActorsSyncPortraitToTokenImage: true }
    );
    debugLog("Portrait sync follow-up complete", {
      actorId: actor.id,
      actorUuid: actor.uuid,
      portraitImage
    });
  } catch (err) {
    debugLog("Portrait sync follow-up failed", {
      actorId: actor.id,
      actorUuid: actor.uuid,
      error: err
    });
    console.warn("MK Actors | Failed to sync portrait to token image.", err);
  }
}

function addDirectoryButton(_app, html) {
  const root = html?.[0] || html;
  if (!root?.querySelector) return;
  if (root.querySelector(".mk-actors-directory-button")) return;

  const header = root.querySelector(".directory-header .header-actions") || root.querySelector(".directory-header");
  if (!header) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "mk-actors-directory-button";
  button.title = game.i18n.localize("MKACTORS.Open");
  button.innerHTML = `<i class="fas fa-users-viewfinder"></i>`;
  button.addEventListener("click", () => {
    debugLog("Actor Directory button clicked");
    MKActorsApi.open();
  });
  header.appendChild(button);
  debugLog("Actor Directory button added");
}

function addSceneControlButton(controls) {
  const title = game.i18n.localize("MKACTORS.Open");
  const tool = {
    name: "mk-actors",
    title,
    icon: "fas fa-users-viewfinder",
    button: true,
    visible: true,
    onClick: () => {
      debugLog("Scene control button clicked");
      MKActorsApi.open();
    },
    onChange: () => {
      debugLog("Scene control changed");
      MKActorsApi.open();
    }
  };

  if (Array.isArray(controls)) {
    const group = controls.find((control) => ["token", "tokens"].includes(control.name)) || controls[0];
    if (Array.isArray(group?.tools) && !group.tools.some((existing) => existing.name === tool.name)) {
      group.tools.push(tool);
      debugLog("Scene control button added", { group: group.name || "" });
    }
    return;
  }

  // Defensive support for newer object-shaped controls without hard depending on one Foundry generation.
  const tokenControls = controls?.tokens || controls?.token;
  if (!tokenControls?.tools) return;

  if (Array.isArray(tokenControls.tools)) {
    if (!tokenControls.tools.some((existing) => existing.name === tool.name)) {
      tokenControls.tools.push(tool);
      debugLog("Scene control button added", { shape: "array" });
    }
  } else if (!tokenControls.tools[tool.name]) {
    tokenControls.tools[tool.name] = tool;
    debugLog("Scene control button added", { shape: "object" });
  }
}

Hooks.once("init", () => {
  registerSettings();
  registerKeybinding();
  debugLog("Init hook complete");
});

Hooks.once("ready", () => {
  globalThis.MKActors = MKActorsApi;
  const module = game.modules.get(MODULE_ID);
  if (module) module.api = MKActorsApi;
  debugLog("Ready hook complete", { moduleId: MODULE_ID, apiRegistered: Boolean(module) });
});

Hooks.on("renderActorDirectory", addDirectoryButton);
Hooks.on("getSceneControlButtons", addSceneControlButton);
Hooks.on("preUpdateActor", syncPortraitToTokenImage);
Hooks.on("updateActor", ensurePortraitSyncedToTokenImage);
