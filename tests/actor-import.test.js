import assert from "node:assert/strict";
import test from "node:test";

globalThis.foundry = {
  applications: { api: { ApplicationV2: class {
    async close(options = {}) { this.closed = true; this._onClose(options); return this; }
    _onClose() {}
  } } }
};
globalThis.game = {
  user: { id: "importer", canCreate: true }, system: { id: "test-system" },
  documentTypes: { Actor: ["character", "npc"] },
  i18n: { localize: (key) => key, format: (key, data) => `${key}: ${JSON.stringify(data)}` }
};
globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };

const { canImportActors, importActor, parseActorImport } = await import("../scripts/actor-import.js");
const { MKActorImportApp } = await import("../scripts/actor-import-app.js");

function exportData() {
  return {
    _id: "existing-actor", name: "Captain Rowan", type: "character", img: "portrait.webp",
    system: { hp: { value: 12 } },
    items: [{ _id: "sword", name: "Sword", type: "weapon", system: { damage: 6 } }],
    effects: [{ _id: "effect", name: "Inspired", origin: "Actor.existing-actor.Item.sword" }],
    prototypeToken: { name: "Rowan", width: 2, texture: { src: "token.webp", scaleX: 1.4 } },
    folder: "old-world-folder", ownership: { "old-user": 3 },
    _stats: { coreVersion: "13.350", exportSource: { systemId: "test-system" } }
  };
}

function replaceProperty(t, object, key, value) {
  const prior = Object.getOwnPropertyDescriptor(object, key);
  Object.defineProperty(object, key, { value, configurable: true, writable: true });
  t.after(() => {
    if (prior) Object.defineProperty(object, key, prior);
    else delete object[key];
  });
}

function setup(t, { migrate = null, create = null } = {}) {
  const calls = { migrated: [], normalized: [], created: [] };
  class SystemActor {
    static canUserCreate(user) { return user.canCreate; }
    static async fromImport(source) {
      calls.migrated.push(structuredClone(source));
      if (migrate) return migrate(source);
      source.system.migrated = true;
      return { toObject: () => source };
    }
    static async create(data, options) {
      calls.created.push({ data: structuredClone(data), options });
      if (create) return create(data, options);
      return { ...data, id: "new-actor", uuid: "Actor.new-actor" };
    }
  }
  replaceProperty(t, game, "actors", {
    documentClass: SystemActor,
    fromCompendium(document, options) {
      calls.normalized.push(options);
      const data = document.toObject();
      delete data._id;
      delete data.folder;
      data.ownership = { default: 0, [game.user.id]: 3 };
      return data;
    }
  });
  replaceProperty(t, game, "user", { id: "importer", canCreate: true });
  return calls;
}

function mockForm() {
  const image = { value: "", disabled: false };
  const submit = { disabled: false };
  const status = { textContent: "" };
  const preview = { src: "" };
  return {
    image, submit, status, preview,
    elements: { namedItem: (key) => key === "imagePath" ? image : null },
    querySelector: (selector) => ({
      "[type='submit']": submit,
      "[data-role='import-status']": status,
      "[data-role='import-preview']": preview
    })[selector],
    querySelectorAll: () => [image, submit],
    reportValidity: () => true,
    setAttribute() {}, removeAttribute() {}
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

test("JSON imports use native migrations and create a separate Actor with embedded data intact", async (t) => {
  const calls = setup(t);
  const source = exportData();
  const original = structuredClone(source);
  const actor = await importActor(source);
  assert.deepEqual(source, original);
  assert.deepEqual(calls.migrated[0]._stats, original._stats);
  assert.deepEqual(calls.normalized, [{ clearFolder: true, clearOwnership: true, keepId: false }]);
  assert.equal(actor.uuid, "Actor.new-actor");
  assert.equal(actor.system.migrated, true);
  assert.deepEqual(actor.items, original.items);
  assert.deepEqual(actor.effects, original.effects);
  assert.deepEqual(actor.prototypeToken, original.prototypeToken);
  assert.equal(actor.img, "portrait.webp");
  assert.equal(calls.created[0].data._id, undefined);
  assert.equal(calls.created[0].data.folder, undefined);
  assert.deepEqual(actor.ownership, { default: 0, importer: 3 });
  assert.deepEqual(calls.created[0].options, { renderSheet: false, keepId: false, keepEmbeddedIds: true });
});

test("a selected image replaces portrait and token artwork without changing token geometry", async (t) => {
  setup(t);
  const actor = await importActor(exportData(), { imagePath: "  uploaded/rowan.png  " });
  assert.equal(actor.img, "uploaded/rowan.png");
  assert.deepEqual(actor.prototypeToken, {
    name: "Rowan", width: 2, texture: { src: "uploaded/rowan.png", scaleX: 1.4 }
  });
});

test("invalid JSON, other documents, unsupported Actor types, and different systems create nothing", async (t) => {
  const calls = setup(t);
  for (const json of ["{", "null", "[]", '"text"', JSON.stringify({ name: "Sword", type: "weapon", system: {} })]) {
    assert.throws(() => parseActorImport(json), /ImportActorInvalidJSON/);
  }
  assert.throws(() => parseActorImport(JSON.stringify({ ...exportData(), documentName: "Item" })), /InvalidJSON/);
  assert.throws(() => parseActorImport(JSON.stringify({ ...exportData(), type: "unknown" })), /TypeUnavailable/);
  const wrongSystem = exportData();
  wrongSystem._stats.exportSource.systemId = "another-system";
  assert.throws(() => parseActorImport(JSON.stringify(wrongSystem)), /SystemMismatch/);
  await assert.rejects(importActor(wrongSystem), /SystemMismatch/);
  assert.equal(calls.migrated.length, 0);
  assert.equal(calls.created.length, 0);
});

test("unrecognized raw Actor types are allowed when the system has no type registry", (t) => {
  setup(t);
  replaceProperty(t, game, "documentTypes", {});
  assert.equal(parseActorImport(JSON.stringify({ ...exportData(), type: "creature" })).type, "creature");
});

test("creation permission is checked before migration and again before creating", async (t) => {
  const calls = setup(t, { migrate: (source) => {
    game.user.canCreate = false;
    return { toObject: () => source };
  } });
  game.user.canCreate = false;
  assert.equal(canImportActors(), false);
  await assert.rejects(importActor(exportData()), /CannotImportActor/);
  assert.equal(calls.migrated.length, 0);
  game.user.canCreate = true;
  assert.equal(canImportActors(), true);
  await assert.rejects(importActor(exportData()), /CannotImportActor/);
  assert.equal(calls.migrated.length, 1);
  assert.equal(calls.created.length, 0);
});

test("migration failures never create an empty Actor", async (t) => {
  const calls = setup(t, { migrate: () => { throw new Error("Incompatible export"); } });
  await assert.rejects(importActor(exportData()), /Incompatible export/);
  assert.equal(calls.created.length, 0);
});

test("choosing JSON and an image previews them, and cancelling creates nothing", async (t) => {
  const calls = setup(t);
  const app = new MKActorImportApp();
  const form = mockForm();
  await app.onFileChange({ currentTarget: { files: [{ text: async () => JSON.stringify(exportData()) }] } }, form);
  assert.equal(form.submit.disabled, false);
  assert.match(form.status.textContent, /Captain Rowan/);
  assert.equal(form.preview.src, "portrait.webp");
  form.image.value = "chosen.webp";
  app.updatePreview(form);
  assert.equal(form.preview.src, "chosen.webp");
  form.image.value = "";
  app.updatePreview(form);
  assert.equal(form.preview.src, "portrait.webp");
  await app.close();
  assert.equal(calls.migrated.length, 0);
  assert.equal(calls.created.length, 0);
});

test("stale file reads and rejected files cannot replace the current import", async (t) => {
  setup(t);
  const app = new MKActorImportApp();
  const form = mockForm();
  const first = deferred();
  const reading = app.onFileChange({ currentTarget: { files: [{ text: () => first.promise }] } }, form);
  await app.onFileChange({ currentTarget: { files: [{ text: async () => JSON.stringify({ ...exportData(), name: "Newer file" }) }] } }, form);
  first.resolve(JSON.stringify(exportData()));
  await reading;
  assert.equal(app.source.name, "Newer file");
  assert.match(form.status.textContent, /Newer file/);
  await app.onFileChange({ currentTarget: { files: [{ text: async () => "bad json" }] } }, form);
  assert.equal(app.source, null);
  assert.equal(form.submit.disabled, true);
  assert.match(form.status.textContent, /InvalidJSON/);
});

test("the image browser applies the selection to the draft preview", async (t) => {
  const calls = setup(t);
  const app = new MKActorImportApp();
  const form = mockForm();
  replaceProperty(t, globalThis, "FilePicker", class {
    constructor(options) { assert.equal(options.type, "image"); this.options = options; }
    async browse() { this.options.callback("uploads/character.webp"); }
  });
  await app.onBrowseImage(form);
  assert.equal(form.image.value, "uploads/character.webp");
  assert.equal(form.preview.src, "uploads/character.webp");
  assert.equal(calls.created.length, 0);
});

test("duplicate submits and closing while importing cannot create another Actor", async (t) => {
  const saving = deferred();
  const calls = setup(t, { create: () => saving.promise });
  const imported = [];
  const app = new MKActorImportApp({ onImport: (actor) => imported.push(actor) });
  app.source = exportData();
  const form = mockForm();
  form.image.value = "selected.webp";
  const event = { preventDefault() {}, currentTarget: form };
  const submission = app.onSubmit(event);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.created.length, 1);
  assert.equal(calls.created[0].data.img, "selected.webp");
  assert.equal(form.image.disabled, true);
  assert.equal(await app.onSubmit(event), false);
  await app.close();
  assert.notEqual(app.closed, true);
  const actor = { name: "Rowan", uuid: "Actor.new-actor" };
  saving.resolve(actor);
  assert.equal(await submission, true);
  assert.deepEqual(imported, [actor]);
  assert.equal(app.closed, true);
  assert.equal(calls.created.length, 1);
});

test("a completed import stays locked while its window is closing", async (t) => {
  const calls = setup(t);
  const closing = deferred();
  const app = new MKActorImportApp();
  app.source = exportData();
  t.mock.method(app, "close", () => closing.promise);
  const form = mockForm();
  const event = { preventDefault() {}, currentTarget: form };
  const submission = app.onSubmit(event);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(app.saving, false);
  assert.equal(form.submit.disabled, true);
  assert.equal(await app.onSubmit(event), false);
  closing.resolve();
  assert.equal(await submission, true);
  assert.equal(calls.created.length, 1);
});

test("a failed creation preserves the JSON and image for retry without refreshing the gallery", async (t) => {
  setup(t, { create: () => { throw new Error("Save failed"); } });
  t.mock.method(console, "error", () => {});
  const app = new MKActorImportApp({ onImport: () => assert.fail("Failed import refreshed gallery") });
  app.source = exportData();
  const form = mockForm();
  form.image.value = "selected.webp";
  assert.equal(await app.onSubmit({ preventDefault() {}, currentTarget: form }), false);
  assert.equal(app.source.name, "Captain Rowan");
  assert.equal(form.image.value, "selected.webp");
  assert.equal(form.image.disabled, false);
  assert.equal(form.submit.disabled, false);
  assert.equal(app.saving, false);
  assert.notEqual(app.closed, true);
});
