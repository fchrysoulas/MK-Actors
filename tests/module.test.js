import assert from "node:assert/strict";
import test from "node:test";

import { canModifyActor, canViewActor } from "../scripts/actor-helpers.js";
import { normalizeNumber } from "../scripts/utils.js";
import { getTokenImageBounds, TokenImagePreview } from "../scripts/token-preview.js";
import { prepareWindowDrag } from "../scripts/window-drag.js";

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

function mockActorSources(t, getIndex, settings = {}) {
  const priorSettings = game.settings;
  const priorPacks = game.packs;
  game.settings = {
    get: (_module, key) => ({
      includeWorldActors: false,
      includeCompendiumActors: true,
      actorTypes: "",
      excludedActorTypes: "",
      showOnlyVisiblePacks: true,
      ...settings
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

function mockTokenPreview() {
  const node = (properties = {}) => Object.assign(new EventTarget(), {
    style: { setProperty(name, value) { this[name] = value; } },
    ...properties
  });
  const captured = new Set();
  const stage = node({
    clientWidth: 400, clientHeight: 240, focus() {},
    classList: { add() {}, remove() {} },
    setPointerCapture: (id) => captured.add(id),
    hasPointerCapture: (id) => captured.has(id),
    releasePointerCapture: (id) => captured.delete(id)
  });
  const image = node({ naturalWidth: 200, naturalHeight: 200 });
  const frame = node();
  const handle = node();
  handle.contains = (target) => target === handle;
  const reset = node();
  const inputs = Object.fromEntries(Object.entries({
    portraitImg: "portrait.webp", tokenWidth: "1", tokenHeight: "1", tokenFit: "height",
    tokenAnchorX: "0.5", tokenAnchorY: "0.5", tokenScale: "1", tokenScaleRange: "1"
  }).map(([name, value]) => [name, { value }]));
  const selectors = {
    "[data-role='token-preview-stage']": stage,
    "[data-role='token-editor-preview']": image,
    "[data-role='token-preview-frame']": frame,
    "[data-action='scale-token-preview']": handle,
    "[data-action='reset-token-preview']": reset,
    ...Object.fromEntries(Object.entries(inputs).map(([name, input]) => [`[name='${name}']`, input]))
  };
  const form = node({ querySelector: (selector) => selectors[selector], reportValidity: () => true });
  const preview = new TokenImagePreview(form);
  const pointer = (target, x, y, pointerId = 1) => ({
    target, clientX: x, clientY: y, pointerId, button: 0, preventDefault() {}, stopPropagation() {}
  });
  return { form, stage, image, frame, handle, reset, inputs, preview, pointer, captured };
}

test("token preview matches Foundry fit modes and texture anchors", () => {
  const options = { width: 100, height: 200, imageWidth: 400, imageHeight: 200, scale: 1, anchorX: 0.5, anchorY: 0.5 };
  for (const [fit, width, height, left, top] of [
    ["contain", 100, 50, 0, 75], ["cover", 400, 200, -150, 0],
    ["fill", 100, 200, 0, 0], ["width", 100, 50, 0, 75], ["height", 400, 200, -150, 0]
  ]) {
    assert.deepEqual(getTokenImageBounds({ ...options, fit }), { width, height, left, top });
  }
  assert.deepEqual(getTokenImageBounds({ ...options, fit: "contain", scale: 2, anchorX: 0.25, anchorY: 0.75 }), {
    width: 200, height: 100, left: 0, top: 25
  });
});

test("dragging the token preview moves the image and cancels without losing the original anchors", (t) => {
  const { preview, image, inputs, pointer, captured } = mockTokenPreview();
  t.after(() => preview.destroy());
  preview.writeValues({ scale: 2 });
  const width = preview.layout.width;
  const height = preview.layout.height;
  preview.startDrag(pointer(image, 100, 100));
  preview.moveDrag(pointer(image, 100 + width * 0.2, 100 - height * 0.1, 2));
  assert.equal(inputs.tokenAnchorX.value, "0.5");
  preview.moveDrag(pointer(image, 100 + width * 0.2, 100 - height * 0.1));
  assert.equal(inputs.tokenAnchorX.value, "0.3");
  assert.equal(inputs.tokenAnchorY.value, "0.6");
  assert.equal(inputs.tokenScale.value, "2");
  assert.equal(captured.has(1), true);
  preview.onKeyDown({ key: "Escape", preventDefault() {}, stopPropagation() {} });
  assert.equal(inputs.tokenAnchorX.value, "0.5");
  assert.equal(inputs.tokenAnchorY.value, "0.5");
  assert.equal(captured.size, 0);

  preview.startDrag(pointer(image, 0, 0));
  preview.moveDrag(pointer(image, width * 5, -height * 5));
  preview.finishDrag();
  assert.equal(inputs.tokenAnchorX.value, "0");
  assert.equal(inputs.tokenAnchorY.value, "1");
});

test("token preview resize, wheel, reset, and numeric inputs stay in sync", (t) => {
  const { preview, form, stage, image, frame, handle, reset, inputs, pointer } = mockTokenPreview();
  t.after(() => preview.destroy());
  preview.startDrag(pointer(handle, 0, 0));
  preview.moveDrag(pointer(handle, preview.drag.resizeX * 0.5, preview.drag.resizeY * 0.5));
  preview.finishDrag();
  assert.equal(inputs.tokenScale.value, "1.5");
  assert.equal(inputs.tokenScaleRange.value, "1.5");
  assert.equal(inputs.tokenAnchorX.value, "0.5");
  const wheel = Object.assign(new Event("wheel", { cancelable: true }), { deltaY: -100 });
  stage.dispatchEvent(wheel);
  assert.equal(inputs.tokenScale.value, "1.55");
  assert.equal(wheel.defaultPrevented, true);

  preview.writeValues({ anchorX: 1, anchorY: 1, scale: 1 });
  preview.startDrag(pointer(handle, 0, 0));
  preview.moveDrag(pointer(handle, preview.drag.resizeX * 10, preview.drag.resizeY * 10));
  assert.equal(inputs.tokenScale.value, "3");
  preview.moveDrag(pointer(handle, -preview.drag.resizeX * 10, -preview.drag.resizeY * 10));
  assert.equal(inputs.tokenScale.value, "0.2");
  preview.finishDrag();
  reset.dispatchEvent(new Event("click"));
  assert.equal(inputs.tokenAnchorX.value, "0.5");
  assert.equal(inputs.tokenAnchorY.value, "0.5");
  assert.equal(inputs.tokenScale.value, "1");

  inputs.tokenWidth.value = "2";
  inputs.tokenHeight.value = "1";
  inputs.tokenFit.value = "fill";
  inputs.tokenAnchorX.value = "0.25";
  form.dispatchEvent(new Event("input"));
  assert.equal(Number.parseFloat(frame.style.width) / Number.parseFloat(frame.style.height), 2);
  assert.equal(Number.parseFloat(image.style.width), Number.parseFloat(frame.style.width));
  assert.equal(Number.parseFloat(image.style.left), 200 - Number.parseFloat(frame.style.width) * 0.25);
  image.naturalWidth = 400;
  inputs.tokenFit.value = "height";
  image.dispatchEvent(new Event("load"));
  assert.equal(Number.parseFloat(image.style.width) / Number.parseFloat(image.style.height), 2);

  preview.onKeyDown({ key: "ArrowRight", shiftKey: true, preventDefault() {}, stopPropagation() {} });
  assert.equal(inputs.tokenAnchorX.value, "0.2");
  preview.destroy();
  stage.dispatchEvent(Object.assign(new Event("wheel"), { deltaY: -100 }));
  assert.equal(inputs.tokenScale.value, "1");
});

test("Save and Close saves anchors and scale from visual token preview gestures", async (t) => {
  const { preview, form, image, handle, inputs, pointer } = mockTokenPreview();
  t.after(() => preview.destroy());
  const actor = {
    uuid: "Actor.visual-preview", name: "Preview Actor", documentName: "Actor", isOwner: true,
    prototypeToken: { width: 1, height: 1, texture: {} },
    update: t.mock.fn(async () => {})
  };
  const priorFromUuid = globalThis.fromUuid;
  globalThis.fromUuid = async () => actor;
  t.after(() => { globalThis.fromUuid = priorFromUuid; });
  preview.startDrag(pointer(image, 0, 0));
  preview.moveDrag(pointer(image, preview.drag.width * 0.25, -preview.drag.height * 0.25));
  preview.finishDrag();
  preview.startDrag(pointer(handle, 0, 0));
  preview.moveDrag(pointer(handle, preview.drag.resizeX * 0.5, preview.drag.resizeY * 0.5));
  preview.finishDrag();
  const editor = new MKTokenPortraitEditor(actor);
  editor.render = async () => editor;
  assert.equal(await editor.onTokenEditorSubmit({ preventDefault() {}, currentTarget: form }), true);
  const [updates] = actor.update.mock.calls[0].arguments;
  assert.equal(updates["prototypeToken.texture.anchorX"], 0.25);
  assert.equal(updates["prototypeToken.texture.anchorY"], 0.75);
  assert.equal(updates["prototypeToken.texture.scaleX"], 1.5);
  assert.equal(updates["prototypeToken.texture.scaleY"], 1.5);
  assert.equal(inputs.tokenScaleRange.value, "1.5");
});

test("preview batches rapid gestures into one paint while keeping form values current", (t) => {
  const priorRequest = globalThis.requestAnimationFrame;
  const priorCancel = globalThis.cancelAnimationFrame;
  const frames = new Map();
  let frameId = 0;
  globalThis.requestAnimationFrame = (callback) => { frames.set(++frameId, callback); return frameId; };
  globalThis.cancelAnimationFrame = (id) => frames.delete(id);
  const { preview, form, image, handle, inputs, pointer } = mockTokenPreview();
  t.after(() => {
    preview.destroy();
    if (priorRequest === undefined) delete globalThis.requestAnimationFrame;
    else globalThis.requestAnimationFrame = priorRequest;
    if (priorCancel === undefined) delete globalThis.cancelAnimationFrame;
    else globalThis.cancelAnimationFrame = priorCancel;
  });
  const paints = t.mock.method(preview, "render");
  const queries = t.mock.method(form, "querySelector");
  preview.startDrag(pointer(image, 0, 0));
  paints.mock.resetCalls();
  queries.mock.resetCalls();
  for (let i = 1; i <= 20; i++) preview.moveDrag(pointer(image, preview.drag.width * i / 100, 0));
  preview.finishDrag();
  assert.equal(inputs.tokenAnchorX.value, "0.3");
  assert.equal(frames.size, 1);
  assert.equal(paints.mock.callCount(), 0);
  assert.equal(queries.mock.callCount(), 0);
  const callback = frames.values().next().value;
  frames.clear();
  callback();
  assert.equal(paints.mock.callCount(), 1);

  preview.writeValues({ scale: 2 });
  assert.equal(inputs.tokenScale.value, "2");
  assert.equal(inputs.tokenScaleRange.value, "2");
  assert.equal(frames.size, 1);
  preview.startDrag(pointer(handle, 0, 0));
  assert.equal(frames.size, 0);
  assert.equal(preview.drag.scale, 2);
  preview.finishDrag();
  preview.writeValues({ scale: 1.5 });
  assert.equal(frames.size, 1);
  preview.destroy();
  assert.equal(frames.size, 0);
});

test("world Actor loading reuses folder paths and refreshes them on the next load", (t) => {
  const priorActors = game.actors;
  const priorFolders = game.folders;
  const child = { id: "child", name: "Child", type: "Actor", folder: { id: "root" } };
  game.folders = { contents: [
    { id: "root", name: "Root", type: "Actor" }, child,
    { id: "other", name: "Other", type: "Actor" },
    { id: "loop", name: "Loop", type: "Actor", folder: "loop" },
    { id: "item", name: "Items", type: "Item" }
  ] };
  game.actors = { contents: [
    ...Array.from({ length: 200 }, (_, i) => ({
      id: String(i), name: `Actor ${i}`, type: "npc",
      folder: i % 2 ? "child" : { id: "child" }, testUserPermission: () => true
    })),
    { id: "unfiled", name: "Unfiled", testUserPermission: () => true },
    { id: "secret", name: "Secret", folder: "other", testUserPermission: () => false }
  ] };
  t.after(() => { game.actors = priorActors; game.folders = priorFolders; });
  const app = new MKActorsApp();
  const folderMaps = t.mock.method(app, "getWorldActorFolderMap");
  const folderPaths = t.mock.method(app, "getActorFolderPathIds");
  const entries = app.getWorldActorEntries();
  assert.equal(entries.length, 201);
  assert.equal(folderMaps.mock.callCount(), 1);
  assert.equal(folderPaths.mock.callCount(), 1);
  assert.deepEqual(entries[0].folderPathIds, ["child", "root"]);
  assert.deepEqual(entries[200].folderPathIds, []);
  assert.equal(entries.filter((entry) => app.sourceAllowed(entry, "world-folder:root")).length, 200);
  const tree = app.getSourceTree(entries);
  assert.equal(tree.find((item) => item.value === "world-folder:root").count, 200);
  assert.equal(tree.find((item) => item.value === "world-folder:child").count, 200);
  assert.equal(tree.some((item) => item.value === "world-folder:other"), false);

  child.folder = "other";
  assert.deepEqual(app.getWorldActorEntries()[0].folderPathIds, ["child", "other"]);
  assert.deepEqual(app.getActorFolderPathIds({ folder: "loop" }), ["loop"]);
});

test("cached browsing options retain current selections and rebuild after refresh or language changes", async (t) => {
  const index = [
    { _id: "one", name: "Guard", type: "npc" },
    { _id: "two", name: "Hero", type: "character" }
  ];
  mockActorSources(t, async () => index);
  const priorLanguage = game.i18n.lang;
  t.after(() => { game.i18n.lang = priorLanguage; });
  const app = new MKActorsApp();
  const types = t.mock.method(app, "getTypeOptions");
  const sources = t.mock.method(app, "getSourceTree");
  const initial = await app.getData();
  app.filters = { search: "guard", type: "npc", source: "compendium:test.actors" };
  const filtered = await app.getData();
  assert.equal(filtered.resultCount, 1);
  assert.equal(filtered.types.find((item) => item.selected).value, "npc");
  assert.equal(filtered.sourceTree.find((item) => item.selected).value, "compendium:test.actors");
  assert.equal(initial.types.find((item) => item.selected).value, "");
  assert.equal(initial.sourceTree.find((item) => item.selected).value, "");
  assert.equal(types.mock.callCount(), 1);
  assert.equal(sources.mock.callCount(), 1);

  index.push({ _id: "three", name: "Airship", type: "vehicle" });
  app.invalidateCache();
  app.filters = { search: "", type: "", source: "" };
  const refreshed = await app.getData();
  assert.equal(refreshed.resultCount, 3);
  assert.equal(refreshed.types.some((item) => item.value === "vehicle"), true);
  assert.equal(refreshed.sourceTree[0].count, 3);
  assert.equal(types.mock.callCount(), 2);
  assert.equal(sources.mock.callCount(), 2);
  game.i18n.lang = "el";
  await app.getData();
  assert.equal(types.mock.callCount(), 3);
  assert.equal(sources.mock.callCount(), 3);
});

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

test("Save and Close waits for validated Actor updates before closing the editor", async (t) => {
  let submittedUpdates = null;
  const priorFromUuid = globalThis.fromUuid;
  const updateStarted = deferred();
  const updateCompleted = deferred();
  t.after(() => { globalThis.fromUuid = priorFromUuid; });

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
      updateStarted.resolve();
      await updateCompleted.promise;
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
  let editorClosed = false;
  const app = new MKTokenPortraitEditor(actor, {
    onApply: () => { galleryRefreshed = true; },
    onClose: () => {
      assert.equal(galleryRefreshed, true);
      editorClosed = true;
    }
  });
  app.rendered = true;

  const editor = app.buildTokenEditorData(actor);
  assert.equal(editor.uuid, actor.uuid);
  assert.equal(editor.name, actor.name);
  assert.equal(editor.fitOptions.find((option) => option.selected)?.value, "height");

  const submission = app.onTokenEditorSubmit({
    preventDefault: () => {},
    currentTarget: form
  });
  await updateStarted.promise;
  assert.equal(app.rendered, true);
  assert.equal(editorClosed, false);
  assert.equal(galleryRefreshed, false);
  updateCompleted.resolve();
  const result = await submission;
  assert.equal(result, true);
  assert.equal(galleryRefreshed, true);
  assert.equal(editorClosed, true);
  assert.equal(app.rendered, false);
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

test("Save and Close keeps the editor open when the Actor update fails", async (t) => {
  const priorFromUuid = globalThis.fromUuid;
  t.after(() => { globalThis.fromUuid = priorFromUuid; });
  const actor = {
    uuid: "Actor.failed-save", name: "Test Actor", documentName: "Actor", isOwner: true,
    prototypeToken: { width: 1, height: 1, texture: {} },
    update: async () => { throw new Error("Save failed"); }
  };
  globalThis.fromUuid = async () => actor;
  t.mock.method(console, "error", () => {});
  const errorNotification = t.mock.method(ui.notifications, "error");
  const onApply = t.mock.fn();
  const onClose = t.mock.fn();
  const app = new MKTokenPortraitEditor(actor, { onApply, onClose });
  app.rendered = true;
  const form = {
    reportValidity: () => true,
    querySelector: (selector) => ({ value: selector === "[name='portraitImg']" ? "portrait.webp" : undefined })
  };

  assert.equal(await app.onTokenEditorSubmit({ preventDefault() {}, currentTarget: form }), false);
  assert.equal(app.rendered, true);
  assert.equal(onApply.mock.callCount(), 0);
  assert.equal(onClose.mock.callCount(), 0);
  assert.equal(errorNotification.mock.callCount(), 1);
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

test("gallery starts with all accessible types and restores them when cleared", async (t) => {
  let indexRequests = 0;
  mockActorSources(t, async () => {
    indexRequests += 1;
    return [
      { _id: "pc", name: "Scout", type: "pc" },
      { _id: "player", name: "Adventurer", type: "player" },
      { _id: "vehicle", name: "Airship", type: "vehicle" }
    ];
  }, { includeWorldActors: true, excludedActorTypes: "character,pc,player" });
  const priorActors = game.actors;
  game.actors = { contents: [
    { id: "npc", name: "Guard", type: "npc", testUserPermission: () => true },
    { id: "character", name: "Hero", type: "character", testUserPermission: () => true },
    { id: "hidden", name: "Secret", type: "hidden-type", testUserPermission: () => false }
  ] };
  t.after(() => { game.actors = priorActors; });
  const app = new MKActorsApp();
  let data = await app.getData();

  assert.deepEqual(data.actors.map((entry) => entry.id), ["player", "vehicle", "npc", "character", "pc"]);
  assert.deepEqual(data.types.map((option) => option.value), ["", "character", "npc", "pc", "player", "vehicle"]);
  assert.equal(data.types.find((option) => option.selected)?.value, "");
  assert.equal(data.types[0].label, "MKACTORS.AllTypes");
  assert.equal(data.sourceTree[0].count, 5);

  for (const type of ["character", "npc", "pc", "player", "vehicle"]) {
    app.filters.type = type;
    data = await app.getData();
    assert.deepEqual(data.actors.map((entry) => entry.id), [type]);
    assert.equal(data.types.find((option) => option.selected)?.value, type);
  }

  app.filters.type = "";
  data = await app.getData();
  assert.equal(data.resultCount, 5);
  assert.equal(data.sourceTree[0].count, 5);
  assert.equal(data.types.find((option) => option.selected)?.value, "");
  app.filters.source = "compendium:test.actors";
  app.filters.search = "scout";
  data = await app.getData();
  assert.deepEqual(data.actors.map((entry) => entry.id), ["pc"]);
  app.filters.source = "world";
  assert.equal((await app.getData()).resultCount, 0);

  let clearFilters;
  app.render = () => app;
  app.activateListeners({
    querySelector: (selector) => selector === "[data-action='clear']"
      ? { addEventListener: (_event, handler) => { clearFilters = handler; } }
      : null
  });
  clearFilters();
  data = await app.getData();
  assert.deepEqual(app.filters, { search: "", type: "", source: "" });
  assert.equal(data.resultCount, 5);
  assert.equal(data.types.find((option) => option.selected)?.value, "");
  assert.equal(indexRequests, 1);
});

test("legacy included and excluded type settings do not restrict the gallery", async (t) => {
  mockActorSources(t, async () => [
    { _id: "npc", name: "Guard", type: "npc" },
    { _id: "monster", name: "Dragon", type: "monster" },
    { _id: "creature", name: "Wolf", type: "creature" }
  ], { actorTypes: " NPC, MONSTER ", excludedActorTypes: " MONSTER " });
  const app = new MKActorsApp();
  const data = await app.getData();
  assert.deepEqual(data.actors.map((entry) => entry.type), ["monster", "npc", "creature"]);
  assert.deepEqual(data.types.map((option) => option.value), ["", "creature", "monster", "npc"]);

  for (const type of ["monster", "creature"]) {
    app.filters.type = type;
    assert.deepEqual((await app.getData()).actors.map((entry) => entry.type), [type]);
  }
  app.filters.type = "";
  assert.equal((await app.getData()).resultCount, 3);
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

function mockWindowDrag() {
  const view = new EventTarget();
  const frames = new Map();
  let frameId = 0;
  view.requestAnimationFrame = (callback) => { frames.set(++frameId, callback); return frameId; };
  view.cancelAnimationFrame = (id) => frames.delete(id);
  const captured = new Set();
  const header = Object.assign(new EventTarget(), {
    setPointerCapture: (id) => captured.add(id),
    hasPointerCapture: (id) => captured.has(id),
    releasePointerCapture: (id) => captured.delete(id)
  });
  const classes = new Set();
  let reads = 0;
  const element = {
    ownerDocument: { defaultView: view, documentElement: { clientWidth: 1000, clientHeight: 800 } },
    style: { transform: "scale(1.25)" },
    classList: { add: (name) => classes.add(name), remove: (name) => classes.delete(name), contains: (name) => classes.has(name) },
    getBoundingClientRect: () => { reads++; return { left: 100, top: 80, width: 600, height: 400 }; },
    querySelector: () => header,
    isConnected: true
  };
  const positions = [];
  const app = { element, position: { left: 100, top: 80 }, bringToFront() {}, setPosition: (value) => positions.push(value) };
  const controller = prepareWindowDrag(app, null);
  const pointer = (x, y, extra = {}) => ({
    pointerId: 7, button: 0, isPrimary: true, pointerType: "mouse", detail: 1,
    clientX: x, clientY: y, target: { closest: () => null },
    preventDefault() {}, stopImmediatePropagation() {}, ...extra
  });
  const dispatch = (type, extra) => view.dispatchEvent(Object.assign(new Event(type), extra));
  const paint = () => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach((callback) => callback()); };
  return { app, controller, element, header, view, positions, frames, pointer, dispatch, paint, reads: () => reads };
}

test("window movement batches transforms without repeated layout reads or position updates", (t) => {
  const qa = mockWindowDrag();
  t.after(() => qa.controller.destroy());
  qa.controller.start(qa.pointer(200, 150));
  for (let i = 1; i <= 100; i++) qa.controller.move(qa.pointer(200 + i, 150 + i / 2));
  assert.equal(qa.reads(), 1);
  assert.equal(qa.positions.length, 0);
  assert.equal(qa.frames.size, 1);
  qa.paint();
  assert.equal(qa.element.style.transform, "translate3d(100px, 50px, 0) scale(1.25)");
  qa.dispatch("pointerup", { pointerId: 7, clientX: 320, clientY: 210 });
  assert.deepEqual(qa.positions, [{ left: 220, top: 140 }]);
  assert.equal(qa.element.style.transform, "scale(1.25)");
  assert.equal(qa.element.classList.contains("is-window-dragging"), false);
  assert.equal(qa.frames.size, 0);
});

test("window movement clamps the complete scaled window to the viewport", (t) => {
  const qa = mockWindowDrag();
  t.after(() => qa.controller.destroy());
  qa.controller.start(qa.pointer(200, 150));
  qa.controller.move(qa.pointer(2000, 2000));
  qa.paint();
  assert.equal(qa.element.style.transform, "translate3d(300px, 320px, 0) scale(1.25)");
  qa.controller.finish();
  assert.deepEqual(qa.positions, [{ left: 400, top: 400 }]);
  qa.controller.start(qa.pointer(200, 150));
  qa.controller.move(qa.pointer(-2000, -2000));
  qa.controller.finish();
  assert.deepEqual(qa.positions.at(-1), { left: 0, top: 0 });
});

test("Escape, lost focus, lost capture, and disposal cancel window movement without committing", () => {
  for (const action of ["escape", "blur", "capture", "destroy"]) {
    const qa = mockWindowDrag();
    qa.controller.start(qa.pointer(200, 150));
    qa.controller.move(qa.pointer(240, 180));
    if (action === "escape") qa.dispatch("keydown", { key: "Escape" });
    else if (action === "blur") qa.dispatch("blur", {});
    else if (action === "capture") qa.header.dispatchEvent(Object.assign(new Event("lostpointercapture"), { pointerId: 7 }));
    else qa.controller.destroy();
    assert.equal(qa.positions.length, 0);
    assert.equal(qa.element.style.transform, "scale(1.25)");
    assert.equal(qa.frames.size, 0);
    assert.equal(qa.header.hasPointerCapture(7), false);
    qa.controller.destroy();
  }
});

test("focusing a window after editing a field does not cancel its title-bar drag", (t) => {
  const qa = mockWindowDrag();
  t.after(() => qa.controller.destroy());
  qa.app.bringToFront = () => {
    const event = new Event("blur");
    Object.defineProperty(event, "target", { value: { tagName: "INPUT" } });
    qa.view.dispatchEvent(event);
  };
  qa.controller.start(qa.pointer(200, 150));
  qa.controller.move(qa.pointer(250, 180));
  qa.dispatch("pointerup", { pointerId: 7, clientX: 250, clientY: 180 });
  assert.deepEqual(qa.positions, [{ left: 150, top: 110 }]);
});

test("window dragging preserves header controls, double-click, touch, and native fallback", (t) => {
  const qa = mockWindowDrag();
  t.after(() => qa.controller.destroy());
  for (const extra of [
    { target: { closest: () => ({}) } }, { detail: 2 }, { button: 2 },
    { shiftKey: true }, { pointerType: "touch" }, { isPrimary: false }
  ]) {
    qa.controller.start(qa.pointer(200, 150, extra));
    assert.equal(qa.controller.drag, null);
  }
  qa.app.minimized = true;
  qa.controller.start(qa.pointer(200, 150));
  assert.equal(qa.controller.drag, null);
  qa.app.minimized = false;
  qa.header.setPointerCapture = () => { throw new Error("Pointer capture unavailable"); };
  qa.controller.start(qa.pointer(200, 150, { stopImmediatePropagation: () => assert.fail("Native fallback was blocked") }));
  assert.equal(qa.controller.drag, null);
  assert.equal(prepareWindowDrag({ element: { querySelector: () => null } }, null), null);
});

test("header clicks do not reposition, and rerendering reuses the same drag listeners", (t) => {
  const qa = mockWindowDrag();
  t.after(() => qa.controller.destroy());
  assert.equal(prepareWindowDrag(qa.app, qa.controller), qa.controller);
  qa.controller.start(qa.pointer(200, 150));
  qa.dispatch("pointerup", { pointerId: 7, clientX: 200, clientY: 150 });
  assert.equal(qa.positions.length, 0);
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
