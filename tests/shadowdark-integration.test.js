import assert from "node:assert/strict";
import test from "node:test";

import { canConfigureTokenShadows, openTokenShadowSettings } from "../scripts/shadowdark-integration.js";

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

test("token shadow integration stays unavailable with missing or inactive MK Shadowdark", async (t) => {
  const { warnings } = setup(t, { active: false });
  assert.equal(canConfigureTokenShadows(), false);
  assert.equal(await openTokenShadowSettings(), null);
  game.modules.clear();
  assert.equal(canConfigureTokenShadows(), false);
  assert.equal(await openTokenShadowSettings(), null);
  assert.deepEqual(warnings, ["MKACTORS.TokenShadowsUnavailable", "MKACTORS.TokenShadowsUnavailable"]);
});

test("token shadow integration rejects active versions without a usable registered menu", async (t) => {
  const { warnings } = setup(t, { Menu: undefined });
  game.settings.menus.clear();
  assert.equal(canConfigureTokenShadows(), false);
  assert.equal(await openTokenShadowSettings(), null);
  game.settings.menus.set("mk-shadowdark.tokenShadowsSettings", { type: {} });
  assert.equal(canConfigureTokenShadows(), false);
  assert.equal(await openTokenShadowSettings(), null);
  assert.equal(warnings.length, 2);
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
  assert.equal(await openTokenShadowSettings(), null);
  assert.deepEqual(warnings, ["MKACTORS.TokenShadowsUnavailable"]);
});

test("a failing external shadow settings window reports an error without rejecting", async (t) => {
  class ShadowMenu {
    async render() { throw new Error("External menu failed."); }
  }
  const { errors } = setup(t, { Menu: ShadowMenu });
  t.mock.method(console, "error", () => {});
  assert.equal(await openTokenShadowSettings(), null);
  assert.deepEqual(errors, ["MKACTORS.TokenShadowSettingsFailed"]);
});
