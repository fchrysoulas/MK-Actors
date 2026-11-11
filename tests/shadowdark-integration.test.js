import assert from "node:assert/strict";
import test from "node:test";

import { canConfigureTokenShadows, getTokenShadowFields, openTokenShadowSettings, saveTokenShadowSettings } from "../scripts/shadowdark-integration.js";

globalThis.foundry = { applications: { api: { ApplicationV2: class {
  render() { this.context = this._prepareContext(); this.rendered = true; return this; }
  async close() { this.rendered = false; return this; }
} } } };

function setup(t, { active = true, isGM = true, Menu = class {} } = {}) {
  const priorGame = globalThis.game;
  const priorUi = globalThis.ui;
  const warnings = [];
  const errors = [];
  globalThis.game = {
    user: { isGM },
    modules: new Map([["mk-shadowdark", { active }]]),
    settings: {
      menus: new Map([["mk-shadowdark.tokenShadowsSettings", { type: Menu, restricted: true }]]),
      settings: new Map(),
      get: t.mock.fn(() => false),
      set: t.mock.fn()
    },
    i18n: { localize: (key) => key }
  };
  globalThis.ui = { notifications: { warn: (message) => warnings.push(message), error: (message) => errors.push(message) } };
  t.after(() => {
    if (priorGame === undefined) delete globalThis.game;
    else globalThis.game = priorGame;
    if (priorUi === undefined) delete globalThis.ui;
    else globalThis.ui = priorUi;
  });
  return { warnings, errors };
}

test("token shadow integration opens MK Shadowdark's registered settings menu without copying settings", async (t) => {
  let rendered = false;
  class ShadowMenu {
    render(force) { rendered = force; return this; }
  }
  setup(t, { Menu: ShadowMenu });
  assert.equal(canConfigureTokenShadows(), true);
  const app = await openTokenShadowSettings();
  assert.equal(app instanceof ShadowMenu, true);
  assert.equal(rendered, true);
  assert.equal(game.settings.set.mock.callCount(), 0);
  assert.equal(game.settings.get.mock.calls.some(({ arguments: [namespace] }) => namespace === "mk-shadowdark"), false);
});

test("missing or inactive MK Shadowdark opens a visible prerequisite explanation", async (t) => {
  const { warnings } = setup(t, { active: false });
  assert.equal(canConfigureTokenShadows(), false);
  const app = await openTokenShadowSettings();
  assert.equal(app.rendered, true);
  assert.equal(app.context.available, false);
  assert.equal(app.context.unavailable, "MKACTORS.TokenShadowsModuleRequired");
  game.modules.clear();
  assert.equal(canConfigureTokenShadows(), false);
  assert.equal((await openTokenShadowSettings()).context.available, false);
  assert.deepEqual(warnings, []);
});

test("an unavailable custom submenu opens the fallback window instead of hiding the interface", async (t) => {
  const { warnings } = setup(t, { Menu: undefined });
  game.settings.menus.clear();
  assert.equal(canConfigureTokenShadows(), false);
  assert.equal((await openTokenShadowSettings()).context.unavailable, "MKACTORS.TokenShadowsSettingsRequired");
  game.settings.menus.set("mk-shadowdark.tokenShadowsSettings", { type: {} });
  assert.equal(canConfigureTokenShadows(), false);
  assert.equal((await openTokenShadowSettings()).context.available, false);
  assert.equal(warnings.length, 0);
});

test("non-GMs cannot open world shadow controls even through a direct handler call", async (t) => {
  const constructed = t.mock.fn();
  class ShadowMenu {
    constructor() { constructed(); }
  }
  const { warnings } = setup(t, { isGM: false, Menu: ShadowMenu });
  assert.equal(canConfigureTokenShadows(), false);
  assert.equal(await openTokenShadowSettings(), null);
  assert.equal(constructed.mock.callCount(), 0);
  assert.deepEqual(warnings, ["MKACTORS.TokenShadowsGMOnly"]);
});

test("token shadow opening rechecks availability after the editor was rendered", async (t) => {
  const { warnings } = setup(t);
  assert.equal(canConfigureTokenShadows(), true);
  game.modules.get("mk-shadowdark").active = false;
  assert.equal((await openTokenShadowSettings()).context.available, false);
  assert.deepEqual(warnings, []);
});

function registerSharedSettings(t) {
  const values = { tokenShadowsEnabled: false, tokenShadowAlpha: 0.55 };
  game.settings.menus.clear();
  game.settings.settings = new Map([
    ["mk-shadowdark.tokenShadowsEnabled", { type: Boolean }],
    ["mk-shadowdark.tokenShadowAlpha", { type: Number, range: { min: 0, max: 1, step: 0.05 } }]
  ]);
  game.settings.get = (namespace, key) => namespace === "mk-shadowdark" ? values[key] : false;
  game.settings.set = t.mock.fn(async (namespace, key, value) => {
    assert.equal(namespace, "mk-shadowdark");
    values[key] = value;
  });
  return values;
}

test("fallback controls read and update the original shared settings without a custom submenu", async (t) => {
  setup(t);
  const values = registerSharedSettings(t);
  assert.equal(canConfigureTokenShadows(), true);
  const app = await openTokenShadowSettings();
  assert.equal(app.context.available, true);
  assert.equal(app.context.fields.find((field) => field.key === "tokenShadowAlpha").value, 0.55);
  assert.equal(app.context.fields.find((field) => field.isBoolean).value, false);
  const inputs = { tokenShadowsEnabled: { checked: true }, tokenShadowAlpha: { value: "0.7" } };
  assert.equal(await app.onSubmit({ preventDefault() {}, currentTarget: {
    reportValidity: () => true, elements: { namedItem: (key) => inputs[key] }
  } }), true);
  assert.deepEqual(values, { tokenShadowsEnabled: true, tokenShadowAlpha: 0.7 });
  assert.equal(app.rendered, false);
  assert.equal(game.settings.set.mock.callCount(), 2);
  await saveTokenShadowSettings({ tokenShadowsEnabled: true, tokenShadowAlpha: 0.7 });
  assert.equal(game.settings.set.mock.callCount(), 2);
});

test("invalid shadow values and non-GM saves are rejected before writing any setting", async (t) => {
  setup(t);
  registerSharedSettings(t);
  assert.equal(getTokenShadowFields().length, 2);
  await assert.rejects(saveTokenShadowSettings({ tokenShadowsEnabled: true, tokenShadowAlpha: 2 }), /TokenShadowInvalidValue/);
  assert.equal(game.settings.set.mock.callCount(), 0);
  game.user.isGM = false;
  await assert.rejects(saveTokenShadowSettings({ tokenShadowsEnabled: true, tokenShadowAlpha: 0.5 }), /TokenShadowsGMOnly/);
  assert.equal(game.settings.set.mock.callCount(), 0);
});

test("a failing external shadow settings window opens the native controls", async (t) => {
  class ShadowMenu {
    async render() { throw new Error("External menu failed."); }
  }
  const { errors } = setup(t, { Menu: ShadowMenu });
  registerSharedSettings(t);
  game.settings.menus.set("mk-shadowdark.tokenShadowsSettings", { type: ShadowMenu });
  t.mock.method(console, "warn", () => {});
  assert.equal((await openTokenShadowSettings()).context.available, true);
  assert.deepEqual(errors, []);
});
