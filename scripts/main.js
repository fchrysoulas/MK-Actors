const MODULE_ID = "mk-actors";
const DEFAULT_ACTOR_IMAGE = "icons/svg/mystery-man.svg";

class MKActorsApi {
  static app = null;

  static open() {
    if (!this.app) this.app = new MKActorsApp();
    this.app.render(true);
    return this.app;
  }

  static refresh() {
    if (!this.app) return this.open();
    this.app.invalidateCache();
    this.app.render(true);
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
    const document = await fromUuid(uuid);
    if (!document) return null;
    if (document.documentName === "Actor") return document;
    if (document.constructor?.documentName === "Actor") return document;
    return null;
  }

  static async spawnAtViewCenter(uuid) {
    if (!game.user?.isGM) {
      ui.notifications.warn(game.i18n.localize("MKACTORS.GMRequired"));
      return null;
    }

    if (!canvas?.scene) {
      ui.notifications.warn(game.i18n.localize("MKACTORS.SceneRequired"));
      return null;
    }

    let actor = await this.resolveActor(uuid);
    if (!actor) {
      ui.notifications.warn(game.i18n.localize("MKACTORS.CannotResolveActor"));
      return null;
    }

    // Tokens need a world Actor. If this is a compendium Actor, import a world copy first.
    if (actor.pack) {
      actor = await Actor.create(actor.toObject(), { renderSheet: false });
    }

    const position = this.getViewCenterPosition();
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

    return canvas.scene.createEmbeddedDocuments("Token", [tokenData]);
  }

  static async spawnAtSceneCenter(uuid) {
    return this.spawnAtViewCenter(uuid);
  }
}

class MKActorsApp extends Application {
  constructor(options = {}) {
    super(options);
    this.cache = null;
    this.warnings = [];
    this.state = {
      search: "",
      type: "",
      source: ""
    };
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "mk-actors-app",
      title: game.i18n.localize("MKACTORS.AppTitle"),
      template: `modules/${MODULE_ID}/templates/gallery.hbs`,
      width: 980,
      height: 720,
      resizable: true,
      classes: ["mk-actors-app"]
    });
  }

  invalidateCache() {
    this.cache = null;
    this.warnings = [];
  }

  async getData(_options = {}) {
    const allActors = await this.getActorEntries();
    const filteredByControls = this.filterByControls(allActors);
    const types = this.getTypeOptions(allActors);
    const sources = this.getSourceOptions(allActors);
    const cardSize = Number(game.settings.get(MODULE_ID, "cardSize")) || 150;

    return {
      actors: filteredByControls,
      hasActors: filteredByControls.length > 0,
      types,
      sources,
      state: this.state,
      cardSize,
      canSpawn: game.user?.isGM,
      warnings: this.warnings
    };
  }

  activateListeners(html) {
    super.activateListeners(html);
    const root = html?.[0] || html;

    root.querySelector?.("[data-action='search']")?.addEventListener("input", (event) => {
      this.state.search = event.currentTarget.value || "";
      this.applySearchFilter(root);
    });

    root.querySelector?.("[data-action='type']")?.addEventListener("change", (event) => {
      this.state.type = event.currentTarget.value || "";
      this.render(false);
    });

    root.querySelector?.("[data-action='source']")?.addEventListener("change", (event) => {
      this.state.source = event.currentTarget.value || "";
      this.render(false);
    });

    root.querySelector?.("[data-action='clear']")?.addEventListener("click", () => {
      this.state.search = "";
      this.state.type = "";
      this.state.source = "";
      this.render(false);
    });

    root.querySelector?.("[data-action='refresh']")?.addEventListener("click", () => {
      this.invalidateCache();
      this.render(false);
    });

    for (const card of root.querySelectorAll?.("[data-action='drag-actor']") || []) {
      card.addEventListener("dragstart", this.onDragStart.bind(this));
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
    if (this.cache) return this.cache;

    const entries = [];
    this.warnings = [];

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
    }

    return this.cache;
  }

  getWorldActorEntries() {
    return game.actors.contents
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
  }

  async getCompendiumActorEntries() {
    const onlyVisiblePacks = game.settings.get(MODULE_ID, "showOnlyVisiblePacks");
    const entries = [];

    for (const pack of game.packs) {
      const documentName = pack.documentName || pack.metadata?.type;
      if (documentName !== "Actor") continue;
      if (onlyVisiblePacks && pack.visible === false) continue;

      try {
        const index = await pack.getIndex({ fields: ["img", "type", "folder"] });
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
        this.warnings.push({ pack: pack.collection, error: err });
      }
    }

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
      if (this.state.type && entry.type !== this.state.type) return false;
      if (this.state.source && entry.sourceId !== this.state.source) return false;
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
        selected: this.state.type === ""
      },
      ...typeValues.map((type) => ({
        value: type,
        label: MKActorsApi.titleCase(type),
        selected: this.state.type === type
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
        selected: this.state.source === ""
      },
      ...Array.from(sources.entries())
        .sort((a, b) => a[1].localeCompare(b[1], game.i18n.lang))
        .map(([value, label]) => ({ value, label, selected: this.state.source === value }))
    ];
  }

  buildSearchText(...parts) {
    return parts
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  }

  applySearchFilter(root) {
    const query = String(this.state.search || "").trim().toLowerCase();
    let visible = 0;

    for (const card of root.querySelectorAll?.(".mk-actors__card") || []) {
      const matches = !query || card.dataset.search?.includes(query);
      card.classList.toggle("is-hidden", !matches);
      if (matches) visible += 1;
    }

    const count = root.querySelector?.("[data-role='result-count']");
    if (count) count.textContent = String(visible);
  }

  onDragStart(event) {
    const uuid = event.currentTarget.dataset.uuid;
    const dragData = { type: "Actor", uuid };
    const serialized = JSON.stringify(dragData);

    event.dataTransfer.setData("text/plain", serialized);
    event.dataTransfer.setData("application/json", serialized);
    event.dataTransfer.effectAllowed = "copy";
  }

  async onOpenSheet(event) {
    event.preventDefault();
    event.stopPropagation();

    const uuid = event.currentTarget.dataset.uuid;
    const actor = await MKActorsApi.resolveActor(uuid);
    if (!actor) {
      ui.notifications.warn(game.i18n.localize("MKACTORS.CannotResolveActor"));
      return;
    }

    actor.sheet?.render(true);
  }

  async onSpawnCenter(event) {
    event.preventDefault();
    event.stopPropagation();

    const uuid = event.currentTarget.dataset.uuid;
    await MKActorsApi.spawnAtViewCenter(uuid);
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
    onChange: () => MKActorsApi.refresh()
  });

  game.settings.register(MODULE_ID, "includeCompendiumActors", {
    name: game.i18n.localize("MKACTORS.IncludeCompendiumActors"),
    hint: game.i18n.localize("MKACTORS.IncludeCompendiumActorsHint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => MKActorsApi.refresh()
  });

  game.settings.register(MODULE_ID, "actorTypes", {
    name: game.i18n.localize("MKACTORS.ActorTypes"),
    hint: game.i18n.localize("MKACTORS.ActorTypesHint"),
    scope: "world",
    config: true,
    type: String,
    default: "",
    onChange: () => MKActorsApi.refresh()
  });

  game.settings.register(MODULE_ID, "excludedActorTypes", {
    name: game.i18n.localize("MKACTORS.ExcludedActorTypes"),
    hint: game.i18n.localize("MKACTORS.ExcludedActorTypesHint"),
    scope: "world",
    config: true,
    type: String,
    default: "character,pc,player",
    onChange: () => MKActorsApi.refresh()
  });

  game.settings.register(MODULE_ID, "showOnlyVisiblePacks", {
    name: game.i18n.localize("MKACTORS.ShowOnlyVisiblePacks"),
    hint: game.i18n.localize("MKACTORS.ShowOnlyVisiblePacksHint"),
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => MKActorsApi.refresh()
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
    onChange: () => MKActorsApi.refresh()
  });

  game.settings.registerMenu(MODULE_ID, "openGallery", {
    name: game.i18n.localize("MKACTORS.Open"),
    label: game.i18n.localize("MKACTORS.Open"),
    hint: game.i18n.localize("MKACTORS.OpenHint"),
    icon: "fas fa-users-viewfinder",
    type: MKActorsApp,
    restricted: false
  });
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
      MKActorsApi.open();
      return true;
    },
    restricted: false,
    precedence: CONST.KEYBINDING_PRECEDENCE?.NORMAL ?? 0
  });
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
  button.addEventListener("click", () => MKActorsApi.open());
  header.appendChild(button);
}

function addSceneControlButton(controls) {
  const title = game.i18n.localize("MKACTORS.Open");
  const tool = {
    name: "mk-actors",
    title,
    icon: "fas fa-users-viewfinder",
    button: true,
    visible: true,
    onClick: () => MKActorsApi.open(),
    onChange: () => MKActorsApi.open()
  };

  if (Array.isArray(controls)) {
    const group = controls.find((control) => ["token", "tokens"].includes(control.name)) || controls[0];
    if (Array.isArray(group?.tools) && !group.tools.some((existing) => existing.name === tool.name)) {
      group.tools.push(tool);
    }
    return;
  }

  // Defensive support for newer object-shaped controls without hard depending on one Foundry generation.
  const tokenControls = controls?.tokens || controls?.token;
  if (!tokenControls?.tools) return;

  if (Array.isArray(tokenControls.tools)) {
    if (!tokenControls.tools.some((existing) => existing.name === tool.name)) tokenControls.tools.push(tool);
  } else if (!tokenControls.tools[tool.name]) {
    tokenControls.tools[tool.name] = tool;
  }
}

Hooks.once("init", () => {
  registerSettings();
  registerKeybinding();
});

Hooks.once("ready", () => {
  globalThis.MKActors = MKActorsApi;
  const module = game.modules.get(MODULE_ID);
  if (module) module.api = MKActorsApi;
});

Hooks.on("renderActorDirectory", addDirectoryButton);
Hooks.on("getSceneControlButtons", addSceneControlButton);
