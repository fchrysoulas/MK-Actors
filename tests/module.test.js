import assert from "node:assert/strict";
import test from "node:test";

import { canModifyActor, canViewActor } from "../scripts/actor-helpers.js";
import { normalizeNumber } from "../scripts/utils.js";

globalThis.foundry = {
  applications: {
    api: {
      ApplicationV2: class {}
    }
  }
};

globalThis.game = {
  user: { isGM: false },
  i18n: {
    localize: (key) => key
  }
};

const { MKActorsApi } = await import("../scripts/api.js");
const { MKActorsApp } = await import("../scripts/gallery-app.js");
const { addSceneControlButton } = await import("../scripts/hooks.js");
const { openTokenPortraitDialog } = await import("../scripts/token-portrait-dialog.js");

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

test("DialogV2 token editor submits validated normalized updates", async () => {
  let dialogOptions = null;
  let submittedUpdates = null;
  let closeCount = 0;

  foundry.applications.api.DialogV2 = class {
    constructor(options) {
      dialogOptions = options;
      this.element = {
        querySelector: () => null
      };
    }

    async render() {
      return this;
    }
  };
  globalThis.renderTemplate = async () => "<div></div>";
  globalThis.ui = {
    notifications: {
      info: () => {},
      warn: () => {},
      error: () => {}
    }
  };
  game.i18n.format = (key) => key;

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
    update: async (updates) => {
      submittedUpdates = updates;
    }
  };

  await openTokenPortraitDialog(actor);
  assert.ok(dialogOptions);
  assert.equal(dialogOptions.form.closeOnSubmit, false);

  const values = {
    "#mk-portrait-img": "updated.webp",
    "#mk-token-width": "1.26",
    "#mk-token-height": "0.1",
    "#mk-token-fit": "cover",
    "#mk-token-anchor-x": "-1",
    "#mk-token-anchor-y": "2",
    "#mk-token-scale": "4"
  };
  const form = {
    reportValidity: () => true,
    querySelector: (selector) => ({ value: values[selector] })
  };
  const dialogElement = {
    close: () => { closeCount += 1; }
  };

  const result = await dialogOptions.buttons[0].callback(null, { form }, dialogElement);
  assert.equal(result, true);
  assert.equal(closeCount, 1);
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
