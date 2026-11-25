import assert from "node:assert/strict";
import test from "node:test";

globalThis.foundry = {
  applications: { api: { ApplicationV2: class {
    async close(options = {}) { this.closed = true; this._onClose(options); return this; }
    _onClose() {}
  } } }
};
globalThis.game = {
  user: { canCreate: true, can: () => true }, system: { id: "test-system" }, world: { id: "test-world" },
  documentTypes: { Actor: ["character", "npc"] },
  i18n: { localize: (key) => key, format: (key, data) => `${key}: ${JSON.stringify(data)}` }
};
globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };

const {
  createFolderImageResolver, defaultUploadFolder, importActorFolder, prepareActorFolderImport,
  remapFolderActorImages, validateUploadFolder
} = await import("../scripts/actor-folder-import.js");
const { MKActorFolderImportApp } = await import("../scripts/actor-folder-import-app.js");

function source(name = "Rowan", changes = {}) {
  return {
    name, type: "character", system: { hp: 12 }, items: [{ name: "Sword", img: "art/sword.webp" }],
    img: "art/rowan.webp", prototypeToken: { width: 2, texture: { src: "art/token.webp", scaleX: 1.5 } },
    effects: [{ img: "art/effect.webp" }], ...changes
  };
}

function file(path, data = "image data") {
  return { name: path.split("/").pop(), webkitRelativePath: path, text: async () => data };
}

function json(path, data = source()) { return file(path, JSON.stringify(data)); }

function replaceProperty(t, object, key, value) {
  const prior = Object.getOwnPropertyDescriptor(object, key);
  Object.defineProperty(object, key, { value, configurable: true, writable: true });
  t.after(() => {
    if (prior) Object.defineProperty(object, key, prior);
    else delete object[key];
  });
}

function setup(t, { upload = null, create = null } = {}) {
  const calls = { uploads: [], directories: [], actors: [] };
  const directories = new Set(["worlds", "worlds/test-world"]);
  class Picker {
    static async browse(storage, target) {
      assert.equal(storage, "data");
      assert.ok(!target || directories.has(target));
      return { dirs: Array.from(directories).filter((path) => path.split("/").slice(0, -1).join("/") === target) };
    }
    static async createDirectory(storage, path) {
      assert.equal(storage, "data");
      assert.ok(!directories.has(path), "Existing directories must not be recreated");
      calls.directories.push(path);
      directories.add(path);
    }
    static async upload(storage, path, image, _body, options) {
      assert.equal(storage, "data");
      assert.equal(options.notify, false);
      assert.ok(directories.has(path));
      calls.uploads.push(image.webkitRelativePath);
      if (upload) return upload(image, path);
      return { path: `${path}/${image.name}` };
    }
  }
  class ActorClass {
    static canUserCreate(user) { return user.canCreate === true; }
    static async fromImport(data) { return data; }
    static async create(data) {
      calls.actors.push(data);
      if (create) return create(data);
      return { ...data, uuid: `Actor.${calls.actors.length}` };
    }
  }
  replaceProperty(t, globalThis, "FilePicker", Picker);
  replaceProperty(t, game, "user", { canCreate: true, can: () => true });
  replaceProperty(t, game, "actors", { documentClass: ActorClass, fromCompendium: (data) => data });
  return calls;
}

test("folder review reads nested Actor exports and all images without creating or uploading", async (t) => {
  const calls = setup(t);
  const plan = await prepareActorFolderImport([
    json("Pack/npcs/rowan.json"), file("Pack/art/rowan.webp"), file("Pack/unused.PNG"),
    file("Pack/broken.json", "bad"), json("Pack/item.json", { name: "Sword", type: "weapon", system: {} }),
    json("Pack/other-system.json", source("Other", { _stats: { systemId: "another" } })),
    file("Pack/readme.txt"), json("../escape.json")
  ]);
  assert.equal(plan.actors.length, 1);
  assert.equal(plan.images.length, 2);
  assert.equal(plan.invalid.length, 4);
  assert.equal(plan.ignored, 1);
  assert.deepEqual(calls, { uploads: [], directories: [], actors: [] });
  assert.equal(defaultUploadFolder(), "worlds/test-world/mk-actors-imports");
});

test("image matching prefers JSON-relative paths and preserves ambiguous and remote references", () => {
  const images = ["Pack/npcs/portrait.webp", "Pack/art/portrait.webp", "Pack/art/My Token.png"].map((path) => ({ path }));
  const resolve = createFolderImageResolver(images);
  assert.equal(resolve("portrait.webp", "Pack/npcs/rowan.json").image, images[0]);
  assert.equal(resolve("../art/portrait.webp", "Pack/npcs/rowan.json").image, images[1]);
  assert.equal(resolve("art/portrait.webp", "Pack/rowan.json").image, images[1]);
  assert.equal(resolve("C:\\old\\Pack\\art\\My%20Token.png", "Pack/rowan.json").image, images[2]);
  assert.equal(resolve("worlds/old/art/My%20Token.png?v=2", "Pack/rowan.json").image, images[2]);
  assert.equal(resolve("portrait.webp", "Pack/rowan.json").ambiguous, true);
  assert.deepEqual(resolve("https://example.com/portrait.webp", "Pack/rowan.json"), {});
  assert.deepEqual(resolve("data:image/svg+xml,stuff", "Pack/rowan.json"), {});
});

test("artwork remapping includes embedded data, preserves geometry, and supports same-stem artwork", () => {
  const images = ["rowan", "token", "sword", "effect"].map((name) => ({ path: `Pack/art/${name}.webp`, uploadedPath: `new/${name}.webp` }));
  const entry = { path: "Pack/rowan.json", source: source() };
  const original = structuredClone(entry.source);
  const mapped = remapFolderActorImages(entry, createFolderImageResolver(images), { requireUploaded: true });
  assert.equal(mapped.source.img, "new/rowan.webp");
  assert.deepEqual(mapped.source.prototypeToken, { width: 2, texture: { src: "new/token.webp", scaleX: 1.5 } });
  assert.equal(mapped.source.items[0].img, "new/sword.webp");
  assert.equal(mapped.source.effects[0].img, "new/effect.webp");
  assert.deepEqual(entry.source, original);
  const fallback = remapFolderActorImages({ path: "Pack/rowan.json", source: source("Rowan", { img: "icons/default.svg" }) },
    createFolderImageResolver([{ path: "Pack/rowan.png", uploadedPath: "new/rowan.png" }]));
  assert.equal(fallback.source.img, "new/rowan.png");
  assert.equal(fallback.source.prototypeToken.texture.src, "new/rowan.png");
});

test("same-stem fallback preserves remote and ambiguous portrait paths", () => {
  const images = ["Pack/rowan.png", "Pack/a/portrait.webp", "Pack/b/portrait.webp"]
    .map((path) => ({ path, uploadedPath: `uploaded/${path}` }));
  for (const img of ["https://example.com/portrait.webp", "portrait.webp"]) {
    const mapped = remapFolderActorImages({ path: "Pack/rowan.json", source: source("Rowan", { img }) }, createFolderImageResolver(images));
    assert.equal(mapped.source.img, img);
    assert.equal(mapped.source.prototypeToken.texture.src, "art/token.webp");
    if (img === "portrait.webp") assert.deepEqual(mapped.warnings, [img]);
  }
});

test("failed image uploads hold dependent Actors and retries skip all successful writes", async (t) => {
  let failImage = true;
  const calls = setup(t, { upload: (image, path) => image.name === "rowan.webp" && failImage
    ? false : { path: `${path}/${image.name}` } });
  const plan = await prepareActorFolderImport([
    json("Pack/rowan.json"), json("Pack/other.json", source("Other", { img: "other.png", prototypeToken: {} })),
    file("Pack/art/rowan.webp"), file("Pack/other.png"), file("Pack/unused.gif")
  ]);
  const progress = [];
  await importActorFolder(plan, { onProgress: (entry) => progress.push(entry.path) });
  assert.equal(plan.uploaded, 2);
  assert.equal(plan.imported, 1);
  assert.match(plan.actors.find((entry) => entry.source.name === "Rowan").error, /ImageFailed/);
  assert.equal(calls.actors[0].name, "Other");
  assert.match(calls.actors[0].img, /\/Pack\/other.png$/);
  const target = plan.target;
  failImage = false;
  await importActorFolder(plan);
  assert.equal(plan.target, target);
  assert.equal(plan.uploaded, 3);
  assert.equal(plan.imported, 2);
  assert.equal(calls.uploads.length, 4);
  assert.equal(calls.actors.length, 2);
  assert.equal(progress.length, 5);
  await importActorFolder(plan);
  assert.equal(calls.uploads.length, 4);
  assert.equal(calls.actors.length, 2);
});

test("failed Actor creations do not stop the batch or duplicate successful Actors on retry", async (t) => {
  let fail = true;
  const calls = setup(t, { create: (data) => {
    if (fail && data.name === "First") throw new Error("Migration failed");
    return { ...data, uuid: `Actor.${data.name}` };
  } });
  const plan = await prepareActorFolderImport([json("Pack/a.json", source("First")), json("Pack/b.json", source("Second"))]);
  await importActorFolder(plan);
  assert.equal(plan.imported, 1);
  assert.equal(plan.actors[0].error, "Migration failed");
  fail = false;
  await importActorFolder(plan);
  assert.equal(plan.imported, 2);
  assert.deepEqual(calls.actors.map((actor) => actor.name), ["First", "Second", "First"]);
});

test("image-only batches upload artwork, and permission or destination failures write nothing", async (t) => {
  const calls = setup(t);
  for (const value of ["", "../outside", "/absolute", "C:\\images", "https://host/images", "worlds/%2e%2e/outside", "%2froot", "worlds/%5c..%5coutside"]) {
    assert.throws(() => validateUploadFolder(value), /InvalidDestination/);
  }
  assert.equal(validateUploadFolder(" worlds\\test-world\\images/ "), "worlds/test-world/images");
  const plan = await prepareActorFolderImport([file("Pack/unused.webp")]);
  await assert.rejects(importActorFolder(plan, { destination: "../outside" }), /InvalidDestination/);
  game.user.can = () => false;
  await assert.rejects(importActorFolder(plan), /CannotUpload/);
  game.user.canCreate = false;
  await assert.rejects(importActorFolder(plan), /CannotImportActor/);
  assert.deepEqual(calls, { uploads: [], directories: [], actors: [] });
  game.user.can = () => true;
  game.user.canCreate = true;
  await importActorFolder(plan);
  assert.equal(plan.uploaded, 1);
  assert.equal(plan.imported, 0);
});

test("uploads support insecure Foundry origins and Actor retries need no further upload permission", async (t) => {
  let fail = true;
  const calls = setup(t, { create: (data) => {
    if (fail) throw new Error("Temporary Actor error");
    return { ...data, uuid: "Actor.one" };
  } });
  replaceProperty(t, globalThis, "crypto", {});
  const plan = await prepareActorFolderImport([json("Pack/rowan.json"), file("Pack/art/rowan.webp")]);
  await importActorFolder(plan);
  assert.match(plan.target, /\/import-[a-z0-9-]+$/);
  assert.equal(plan.uploaded, 1);
  assert.equal(plan.imported, 0);
  game.user.can = () => false;
  fail = false;
  await importActorFolder(plan);
  assert.equal(plan.imported, 1);
  assert.equal(calls.uploads.length, 1);
});

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function mockForm() {
  const document = { createElement: () => {
    const children = [];
    return { ownerDocument: document, children, textContent: "", classList: { toggle() {} },
      append(...nodes) { children.push(...nodes); },
      replaceChildren() { children.length = 0; },
      get lastElementChild() { return children.at(-1); }
    };
  } };
  const list = document.createElement();
  const status = { textContent: "" };
  const target = { textContent: "" };
  const destination = { value: defaultUploadFolder(), disabled: false };
  const actorFolder = { disabled: false };
  const submit = { disabled: true };
  return {
    destination, actorFolder, submit, list, status,
    elements: { namedItem: (key) => ({ destination, actorFolder })[key] },
    querySelector: (selector) => ({
      "[type='submit']": submit, "[data-role='folder-results']": list,
      "[data-role='folder-status']": status, "[data-role='folder-target']": target
    })[selector],
    querySelectorAll: () => [destination, actorFolder, submit],
    reportValidity: () => true, setAttribute() {}, removeAttribute() {}
  };
}

test("folder selection ignores stale reads and cancelling a reviewed folder writes nothing", async (t) => {
  const calls = setup(t);
  const app = new MKActorFolderImportApp();
  const form = mockForm();
  const first = deferred();
  const reading = app.onFolderChange({ currentTarget: { files: [{ ...file("Pack/old.json"), text: () => first.promise }] } }, form);
  await app.onFolderChange({ currentTarget: { files: [json("New/new.json", source("New"))] } }, form);
  first.resolve(JSON.stringify(source("Old")));
  await reading;
  assert.equal(app.plan.actors[0].source.name, "New");
  assert.equal(form.submit.disabled, false);
  assert.equal(form.list.children[0].children[0].textContent, "New");
  await app.close();
  assert.deepEqual(calls, { uploads: [], directories: [], actors: [] });
});

test("folder submissions prevent overlaps, preserve partial results, and refresh after imported Actors", async (t) => {
  const saving = deferred();
  const calls = setup(t, { create: () => saving.promise });
  const onImport = t.mock.fn();
  const app = new MKActorFolderImportApp({ onImport });
  app.plan = await prepareActorFolderImport([json("Pack/rowan.json")]);
  const form = mockForm();
  form.submit.disabled = false;
  const event = { preventDefault() {}, currentTarget: form };
  const submission = app.onSubmit(event);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.actors.length, 1);
  assert.equal(form.actorFolder.disabled, true);
  assert.equal(await app.onSubmit(event), false);
  await app.close();
  assert.notEqual(app.closed, true);
  saving.resolve({ name: "Rowan", uuid: "Actor.one" });
  assert.equal(await submission, true);
  assert.equal(onImport.mock.callCount(), 1);
  assert.equal(form.submit.disabled, true);
  assert.equal(form.actorFolder.disabled, false);
  assert.equal(app.saving, false);
});
