import assert from "node:assert/strict";
import test from "node:test";

import { canModifyActor, canViewActor } from "../scripts/actor-helpers.js";
import { normalizeNumber } from "../scripts/utils.js";

globalThis.foundry = {
  applications: {
    api: {
      ApplicationV2: class {
        constructor(options = {}) { this.id = options.id; }
        async render() { this.rendered = true; return this; }
        async maximize() { return this; }
        bringToFront() {}
        _onClose() {}
        async close(options = {}) {
          this.rendered = false;
          this._onClose(options);
          return this;
        }
      }
    }
  }
};

globalThis.game = {
  user: { isGM: false },
  i18n: {
    localize: (key) => key,
    format: (key) => key
  }
};

globalThis.ui = {
  notifications: {
    info: () => {},
    warn: () => {},
    error: () => {}
  }
};

const { MKActorsApi } = await import("../scripts/api.js");
const { MKActorsApp } = await import("../scripts/gallery-app.js");
const { MKTokenPortraitEditor } = await import("../scripts/token-portrait-editor.js");
const { addSceneControlButton, ensurePortraitSyncedToTokenImage } = await import("../scripts/hooks.js");
const { resolveActor } = await import("../scripts/documents.js");
const { resolveFilePickerClass } = await import("../scripts/file-picker.js");

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function mockActorSources(t, getIndex) {
  const priorSettings = game.settings;
  const priorPacks = game.packs;
  game.settings = {
    get: (_module, key) => ({
      includeWorldActors: false,
      includeCompendiumActors: true,
      actorTypes: "",
      excludedActorTypes: "",
      showOnlyVisiblePacks: true
    })[key]
  };
  game.packs = [{
    documentName: "Actor",
    visible: true,
    collection: "test.actors",
    getIndex
  }];
  t.after(() => {
    game.settings = priorSettings;
    game.packs = priorPacks;
  });
}

test("Actor visibility uses LIMITED permission and fails closed", () => {
  let requestedPermission = null;
  const actor = {
    testUserPermission: (_user, permission) => {
      requestedPermission = permission;
      return true;
    }
  };

  assert.equal(canViewActor(actor), true);
  assert.equal(requestedPermission, "LIMITED");
  assert.equal(canViewActor({}), false);
  assert.equal(canViewActor({ testUserPermission: () => { throw new Error("bad permission"); } }), false);
});

test("Actor modification uses Foundry update permission", () => {
  let requestedAction = null;
  const actor = {
    canUserModify: (_user, action) => {
      requestedAction = action;
      return true;
    }
  };

  assert.equal(canModifyActor(actor), true);
  assert.equal(requestedAction, "update");
  assert.equal(canModifyActor({ isOwner: true }), true);
  assert.equal(canModifyActor({}), false);
});

test("GM Actor access bypasses document permission checks", () => {
  game.user.isGM = true;
  assert.equal(canViewActor({}), true);
  assert.equal(canModifyActor({}), true);
  game.user.isGM = false;
});

test("numeric token values are rounded and clamped", () => {
  assert.equal(normalizeNumber(1.26, 1, { min: 0.5, step: 0.5 }), 1.5);
  assert.equal(normalizeNumber(-3, 1, { min: 0.5, step: 0.5 }), 0.5);
  assert.equal(normalizeNumber(4, 1, { min: 0.2, max: 3, step: 0.05 }), 3);
  assert.equal(normalizeNumber("invalid", 0.5, { min: 0, max: 1, step: 0.1 }), 0.5);
});

test("FilePicker resolution supports v12 globals and v13 namespaced classes", () => {
  const priorGlobalPicker = globalThis.FilePicker;
  const priorApps = foundry.applications.apps;
  class V12FilePicker {}
  class V13FilePicker {}

  foundry.applications.apps = { FilePicker: {} };
  globalThis.FilePicker = V12FilePicker;
  assert.equal(resolveFilePickerClass(), V12FilePicker);

  delete globalThis.FilePicker;
  foundry.applications.apps.FilePicker = {
    default: {
      FilePicker: {
        implementation: V13FilePicker
      }
    }
  };
  assert.equal(resolveFilePickerClass(), V13FilePicker);

  if (priorGlobalPicker === undefined) delete globalThis.FilePicker;
  else globalThis.FilePicker = priorGlobalPicker;
  foundry.applications.apps = priorApps;
});

test("popup token editor submits validated normalized updates", async () => {
  let submittedUpdates = null;
  const priorFromUuid = globalThis.fromUuid;

  const actor = {
    id: "actor-id",
    uuid: "Actor.actor-id",
    name: "Test Actor",
    img: "portrait.webp",
    prototypeToken: {
      width: 1,
      height: 1,
      texture: {
        fit: "height",
        anchorX: 0.5,
        anchorY: 0.5,
        scaleX: 1,
        scaleY: 1
      }
    },
    documentName: "Actor",
    isOwner: true,
    update: async (updates) => {
      submittedUpdates = updates;
    }
  };
  globalThis.fromUuid = async () => actor;

  const values = {
    "[name='portraitImg']": "updated.webp",
    "[name='tokenWidth']": "1.26",
    "[name='tokenHeight']": "0.1",
    "[name='tokenFit']": "cover",
    "[name='tokenAnchorX']": "-1",
    "[name='tokenAnchorY']": "2",
    "[name='tokenScale']": "4"
  };
  const form = {
    reportValidity: () => true,
    querySelector: (selector) => ({ value: values[selector] })
  };
  let galleryRefreshed = false;
  const app = new MKTokenPortraitEditor(actor, {
    onApply: () => { galleryRefreshed = true; }
  });
  app.render = async () => app;

  const editor = app.buildTokenEditorData(actor);
  assert.equal(editor.uuid, actor.uuid);
  assert.equal(editor.name, actor.name);
  assert.equal(editor.fitOptions.find((option) => option.selected)?.value, "height");

  const result = await app.onTokenEditorSubmit({
    preventDefault: () => {},
    currentTarget: form
  });
  assert.equal(result, true);
  assert.equal(galleryRefreshed, true);
  assert.deepEqual(submittedUpdates, {
    img: "updated.webp",
    "prototypeToken.width": 1.5,
    "prototypeToken.height": 0.5,
    "prototypeToken.texture.fit": "cover",
    "prototypeToken.texture.anchorX": 0,
    "prototypeToken.texture.anchorY": 1,
    "prototypeToken.texture.scaleX": 3,
    "prototypeToken.texture.scaleY": 3
  });

  if (priorFromUuid === undefined) delete globalThis.fromUuid;
  else globalThis.fromUuid = priorFromUuid;
});

test("gallery search filters the full cached result set", () => {
  const app = new MKActorsApp();
  app.filters.search = "red dragon";
  const entries = [
    { type: "npc", sourceId: "world", searchText: "red dragon npc world" },
    { type: "npc", sourceId: "world", searchText: "blue dragon npc world" }
  ];

  assert.deepEqual(app.filterByControls(entries), [entries[0]]);
});

test("gallery rerenders preserve a card's visual scroll position", () => {
  const app = new MKActorsApp();
  const originalGrid = {
    getBoundingClientRect: () => ({ top: 20 })
  };
  const originalCard = {
    dataset: { uuid: "Actor.anchor" },
    closest: () => originalGrid,
    getBoundingClientRect: () => ({ top: 85 })
  };

  const anchor = app.getGridAnchor(originalCard);
  assert.deepEqual(anchor, { uuid: "Actor.anchor", offset: 65 });

  const renderedGrid = {
    scrollTop: 100,
    getBoundingClientRect: () => ({ top: 20 }),
    querySelectorAll: () => [{
      dataset: { uuid: "Actor.anchor" },
      getBoundingClientRect: () => ({ top: 140 })
    }]
  };
  app.pendingGridAnchor = anchor;
  app.restoreGridAnchor({
    querySelector: () => renderedGrid
  });

  assert.equal(renderedGrid.scrollTop, 155);
  assert.equal(app.pendingGridAnchor, null);

  app.element = {
    querySelector: () => originalCard
  };
  app.invalidateCache();
  assert.deepEqual(app.pendingGridAnchor, anchor);
});

test("non-GM users cannot index hidden compendiums", async () => {
  let indexRequested = false;
  const priorSettings = game.settings;
  const priorPacks = game.packs;
  game.settings = {
    get: (_module, key) => key === "showOnlyVisiblePacks" ? false : null
  };
  game.packs = [{
    documentName: "Actor",
    visible: false,
    collection: "hidden.actors",
    getIndex: async () => {
      indexRequested = true;
      return [];
    }
  }];

  const app = new MKActorsApp();
  assert.deepEqual(await app.getCompendiumActorEntries(), []);
  assert.equal(indexRequested, false);

  game.settings = priorSettings;
  game.packs = priorPacks;
});

test("concurrent gallery loads share one compendium index request", async (t) => {
  const index = deferred();
  let requests = 0;
  mockActorSources(t, () => {
    requests += 1;
    return index.promise;
  });
  const app = new MKActorsApp();
  const firstLoad = app.getActorEntries();
  const secondLoad = app.getActorEntries();
  index.resolve([{ _id: "one", name: "First Actor", type: "npc" }]);

  const [first, second] = await Promise.all([firstLoad, secondLoad]);
  assert.equal(requests, 1);
  assert.strictEqual(first, second);
  assert.strictEqual(app.cache, first);
});

test("refresh during indexing discards an older result that finishes last", async (t) => {
  const oldIndex = deferred();
  let requests = 0;
  mockActorSources(t, () => {
    requests += 1;
    return requests === 1 ? oldIndex.promise : [{ _id: "new", name: "New Actor", type: "npc" }];
  });
  const app = new MKActorsApp();
  const oldLoad = app.getActorEntries();
  app.invalidateCache();
  const refreshed = await app.getActorEntries();
  oldIndex.resolve([{ _id: "old", name: "Old Actor", type: "npc" }]);

  const result = await oldLoad;
  assert.strictEqual(result, refreshed);
  assert.strictEqual(app.cache, refreshed);
  assert.equal(app.cache[0].name, "New Actor");
  assert.equal(requests, 2);
});

test("refresh during indexing suppresses warnings from the discarded load", async (t) => {
  const oldIndex = deferred();
  let requests = 0;
  let warnings = 0;
  mockActorSources(t, () => {
    requests += 1;
    return requests === 1 ? oldIndex.promise : [{ _id: "new", name: "New Actor", type: "npc" }];
  });
  t.mock.method(ui.notifications, "warn", () => { warnings += 1; });
  t.mock.method(console, "warn", () => {});
  const app = new MKActorsApp();
  const oldLoad = app.getActorEntries();
  app.invalidateCache();
  const refreshed = await app.getActorEntries();
  oldIndex.reject(new Error("Old index request failed"));

  assert.strictEqual(await oldLoad, refreshed);
  assert.deepEqual(app.warnings, []);
  assert.equal(warnings, 0);
});

test("an invalidated load waits for the replacement index when it finishes first", async (t) => {
  const oldIndex = deferred();
  const newIndex = deferred();
  let requests = 0;
  mockActorSources(t, () => {
    requests += 1;
    return requests === 1 ? oldIndex.promise : newIndex.promise;
  });
  const app = new MKActorsApp();
  const oldLoad = app.getActorEntries();
  app.invalidateCache();
  const newLoad = app.getActorEntries();
  oldIndex.resolve([{ _id: "old", name: "Old Actor", type: "npc" }]);
  // Let the old request finish before releasing the replacement index.
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(app.cache, null);
  newIndex.resolve([{ _id: "new", name: "New Actor", type: "npc" }]);

  const [oldResult, newResult] = await Promise.all([oldLoad, newLoad]);
  assert.strictEqual(oldResult, newResult);
  assert.equal(newResult[0].name, "New Actor");
  assert.equal(requests, 2);
});

test("a current source failure still warns and refresh can retry it", async (t) => {
  let requests = 0;
  let warning = null;
  mockActorSources(t, async () => {
    requests += 1;
    if (requests === 1) throw new Error("Source unavailable");
    return [{ _id: "one", name: "Recovered Actor", type: "npc" }];
  });
  t.mock.method(ui.notifications, "warn", (key) => { warning = key; });
  t.mock.method(console, "warn", () => {});
  const app = new MKActorsApp();
  assert.deepEqual(await app.getActorEntries(), []);
  assert.equal(app.warnings.length, 1);
  assert.equal(warning, "MKACTORS.LoadingFailed");

  app.invalidateCache();
  const entries = await app.getActorEntries();
  assert.equal(entries[0].name, "Recovered Actor");
  assert.deepEqual(app.warnings, []);
  assert.equal(requests, 2);
});

test("Actor resolution accepts Actors and rejects other documents or invalid input", async (t) => {
  const priorFromUuid = globalThis.fromUuid;
  let document = { documentName: "Actor", uuid: "Actor.one" };
  let lookups = 0;
  globalThis.fromUuid = async () => {
    lookups += 1;
    return document;
  };
  t.after(() => {
    if (priorFromUuid === undefined) delete globalThis.fromUuid;
    else globalThis.fromUuid = priorFromUuid;
  });

  assert.strictEqual(await resolveActor(document.uuid), document);
  document = { documentName: "Item" };
  assert.equal(await resolveActor("Item.one"), null);
  document = null;
  assert.equal(await resolveActor("Actor.missing"), null);
  for (const uuid of [undefined, null, "", {}]) {
    assert.equal(await resolveActor(uuid), null);
  }
  assert.equal(lookups, 3);
});

test("failed Actor resolution prevents popup opening and allows sheet actions to finish", async (t) => {
  const priorFromUuid = globalThis.fromUuid;
  globalThis.fromUuid = async () => { throw new Error("Compendium is unavailable"); };
  t.after(() => {
    if (priorFromUuid === undefined) delete globalThis.fromUuid;
    else globalThis.fromUuid = priorFromUuid;
  });

  assert.equal(await resolveActor("Compendium.missing.actors.Actor.one"), null);
  const app = new MKActorsApp();
  let warning = null;
  t.mock.method(ui.notifications, "warn", (key) => { warning = key; });
  assert.equal(await app.openTokenPortraitEditor("Compendium.missing.actors.Actor.one"), undefined);
  assert.equal(app.tokenEditors.size, 0);
  assert.equal(warning, "MKACTORS.CannotResolveActor");
  await app.openActorSheet("Compendium.missing.actors.Actor.one");
  assert.equal(warning, "MKACTORS.CannotResolveActor");
});

test("only a card context menu opens the popup and repeated requests focus it", async (t) => {
  const priorFromUuid = globalThis.fromUuid;
  const actor = { uuid: "Actor.one", documentName: "Actor", name: "First Actor", isOwner: true };
  globalThis.fromUuid = async () => actor;
  t.after(() => { globalThis.fromUuid = priorFromUuid; });
  const cardHandlers = new Map();
  const portraitHandlers = new Map();
  const card = { dataset: { uuid: actor.uuid }, addEventListener: (type, handler) => cardHandlers.set(type, handler) };
  const portrait = { addEventListener: (type, handler) => portraitHandlers.set(type, handler) };
  const app = new MKActorsApp();
  app.render = () => { throw new Error("Opening a popup must not rerender the gallery"); };
  app.activateListeners({
    querySelector: () => null,
    querySelectorAll: (selector) => {
      if (selector === "[data-action='drag-actor']") return [card];
      if (selector === "[data-role='actor-portrait']") return [portrait];
      return [];
    }
  });
  assert.equal(portraitHandlers.has("click"), false);
  assert.equal(portraitHandlers.has("keydown"), false);
  assert.equal(cardHandlers.has("click"), false);
  const event = {
    currentTarget: card,
    preventDefault: t.mock.fn(),
    stopPropagation: t.mock.fn()
  };
  await cardHandlers.get("contextmenu")(event);
  const editor = app.tokenEditors.get(actor.uuid);
  assert.ok(editor instanceof MKTokenPortraitEditor);
  assert.equal(editor.rendered, true);
  assert.equal(event.preventDefault.mock.callCount(), 1);
  assert.equal(event.stopPropagation.mock.callCount(), 1);
  const focus = t.mock.method(editor, "bringToFront");
  await cardHandlers.get("contextmenu")(event);
  assert.equal(app.tokenEditors.size, 1);
  assert.strictEqual(app.tokenEditors.get(actor.uuid), editor);
  assert.equal(focus.mock.callCount(), 1);
  await editor.close();
  assert.equal(app.tokenEditors.size, 0);
  assert.notStrictEqual(await app.openTokenPortraitEditor(actor.uuid), editor);
});

test("popup editing checks update permission again and closes if the Actor disappears", async (t) => {
  const priorFromUuid = globalThis.fromUuid;
  let actor = { uuid: "Actor.one", documentName: "Actor", isOwner: false };
  globalThis.fromUuid = async () => actor;
  t.after(() => { globalThis.fromUuid = priorFromUuid; });
  let warning;
  t.mock.method(ui.notifications, "warn", (key) => { warning = key; });
  const gallery = new MKActorsApp();
  assert.equal(await gallery.openTokenPortraitEditor(actor.uuid), undefined);
  assert.equal(warning, "MKACTORS.CannotModifyActor");
  assert.equal(gallery.tokenEditors.size, 0);
  actor.isOwner = true;
  const editor = await gallery.openTokenPortraitEditor(actor.uuid);
  actor.isOwner = false;
  const event = { preventDefault: () => {}, currentTarget: { reportValidity: () => true } };
  assert.equal(await editor.onTokenEditorSubmit(event), false);
  assert.equal(warning, "MKACTORS.CannotModifyActor");
  assert.equal(editor.rendered, true);
  actor = null;
  assert.equal(await editor.onTokenEditorSubmit(event), false);
  assert.equal(warning, "MKACTORS.CannotResolveActor");
  assert.equal(editor.rendered, false);
  assert.equal(gallery.tokenEditors.size, 0);
});

test("portrait sync follow-up updates only on the initiating client", async (t) => {
  const priorUser = game.user;
  const priorSettings = game.settings;
  game.user = { id: "initiator", isGM: true };
  game.settings = { get: (_module, key) => key === "syncPortraitToTokenImage" };
  t.after(() => {
    game.user = priorUser;
    game.settings = priorSettings;
  });
  const updates = [];
  const actor = {
    id: "one",
    uuid: "Actor.one",
    img: "new.webp",
    prototypeToken: { texture: { src: "old.webp" } },
    update: async (...args) => { updates.push(args); }
  };
  const changes = { img: actor.img };

  await ensurePortraitSyncedToTokenImage(actor, changes, {}, "another-user");
  assert.equal(updates.length, 0);
  await ensurePortraitSyncedToTokenImage(actor, changes, {}, game.user.id);
  assert.deepEqual(updates, [[
    { "prototypeToken.texture.src": actor.img },
    { mkActorsSyncPortraitToTokenImage: true }
  ]]);
  await ensurePortraitSyncedToTokenImage(actor, changes, { mkActorsSyncPortraitToTokenImage: true }, game.user.id);
  assert.equal(updates.length, 1);
});

test("loading more cards preserves the grid scroll position", () => {
  const app = new MKActorsApp();
  const grid = { getBoundingClientRect: () => ({ top: 20 }) };
  const card = {
    dataset: { uuid: "Actor.one" },
    closest: () => grid,
    getBoundingClientRect: () => ({ top: -480 })
  };
  let loadMore;
  const root = {
    querySelector: (selector) => {
      if (selector === "[data-action='load-more']") {
        return { addEventListener: (_event, handler) => { loadMore = handler; } };
      }
      if (selector === ".mk-actors__card") return card;
      return null;
    },
    querySelectorAll: () => []
  };
  let renders = 0;
  app.render = () => { renders += 1; };
  app.activateListeners(root);
  loadMore();

  assert.equal(app.visibleLimit, 400);
  assert.equal(renders, 1);
  assert.deepEqual(app.pendingGridAnchor, { uuid: card.dataset.uuid, offset: -500 });
  const renderedGrid = {
    scrollTop: 0,
    getBoundingClientRect: () => ({ top: 20 }),
    querySelectorAll: () => [{
      dataset: card.dataset,
      getBoundingClientRect: () => ({ top: 20 })
    }]
  };
  app.restoreGridAnchor({ querySelector: () => renderedGrid });
  assert.equal(renderedGrid.scrollTop, 500);
});

test("scene control supports the v12 array shape", () => {
  const controls = [{
    name: "token",
    tools: [{ name: "select" }]
  }];

  addSceneControlButton(controls);
  const tool = controls[0].tools.find((entry) => entry.name === "mk-actors");
  assert.ok(tool);
  assert.equal(tool.order, 1);
  assert.equal(tool.visible, true);
  assert.equal(typeof tool.onClick, "function");
});

test("scene control supports the v13 record shape and receives an order", () => {
  const controls = {
    tokens: {
      name: "tokens",
      tools: {
        select: { name: "select", order: 10 },
        target: { name: "target", order: 30 }
      }
    }
  };

  addSceneControlButton(controls);
  const tool = controls.tokens.tools["mk-actors"];
  assert.ok(tool);
  assert.equal(tool.order, 31);
  assert.equal(typeof tool.onChange, "function");
});

test("non-opening refresh invalidates without opening a closed gallery", () => {
  let invalidations = 0;
  let renders = 0;
  MKActorsApi.app = {
    id: "test-gallery",
    rendered: false,
    invalidateCache: () => { invalidations += 1; },
    render: () => { renders += 1; }
  };

  MKActorsApi.refresh({ open: false });
  assert.equal(invalidations, 1);
  assert.equal(renders, 0);

  MKActorsApi.app.rendered = true;
  MKActorsApi.refresh({ open: false });
  assert.equal(invalidations, 2);
  assert.equal(renders, 1);

  MKActorsApi.app = null;
  assert.equal(MKActorsApi.refresh({ open: false }), null);
});
