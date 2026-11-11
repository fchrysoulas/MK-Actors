import assert from "node:assert/strict";
import test from "node:test";
import { TOKEN_SHADOW_SETTINGS } from "../scripts/constants.js";
import { getTokenShadowFields, openTokenShadowSettings, saveTokenShadowSettings } from "../scripts/token-shadow-controls.js";

globalThis.foundry = { applications: { api: { ApplicationV2: class {
  render() { this.context = this._prepareContext(); this.rendered = true; return this; }
  async close() { this.rendered = false; return this; }
} } } };

function setup(t, isGM = true) {
  const previous = { game: globalThis.game, ui: globalThis.ui };
  const values = Object.fromEntries(TOKEN_SHADOW_SETTINGS.map((setting) => [setting.key, setting.default]));
  const warnings = [];
  globalThis.game = {
    user: { isGM }, modules: new Map(), system: { id: "another-system" },
    i18n: { localize: (key) => key },
    settings: {
      get: (namespace, key) => namespace === "mk-actors" ? values[key] : undefined,
      set: t.mock.fn(async (namespace, key, value) => { assert.equal(namespace, "mk-actors"); values[key] = value; })
    }
  };
  globalThis.ui = { notifications: { warn: (message) => warnings.push(message), error: t.mock.fn() } };
  t.after(() => Object.assign(globalThis, previous));
  return { values, warnings };
}

function submission(values) {
  const inputs = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { value: String(value), checked: value }]));
  return { preventDefault() {}, currentTarget: { reportValidity: () => true, elements: { namedItem: (key) => inputs[key] } } };
}

test("standalone shadow controls open and save without MK Shadowdark or its settings registry", async (t) => {
  const { values } = setup(t);
  const app = await openTokenShadowSettings();
  assert.equal(app.context.available, true);
  assert.equal(app.context.fields.length, 7);
  assert.equal(app.context.fields.filter((field) => field.isBoolean).length, 1);
  assert.equal(app.context.fields.find((field) => field.key === "tokenShadowsEnabled").value, false);
  assert.equal(app.context.fields.find((field) => field.key === "tokenShadowAlpha").value, 0.55);
  assert.equal(await app.onSubmit(submission({ ...values, tokenShadowsEnabled: true, tokenShadowAlpha: 0.7 })), true);
  assert.equal(values.tokenShadowsEnabled, true);
  assert.equal(values.tokenShadowAlpha, 0.7);
  assert.equal(game.settings.set.mock.callCount(), 2);
  assert.equal(app.rendered, false);
  await saveTokenShadowSettings({ ...values });
  assert.equal(game.settings.set.mock.callCount(), 2);
});

test("invalid shadow values are rejected before any setting is changed", async (t) => {
  const { values } = setup(t);
  for (const invalid of [2, "", "  ", "invalid", Infinity]) {
    await assert.rejects(saveTokenShadowSettings({ ...values, tokenShadowsEnabled: true, tokenShadowAlpha: invalid }), /TokenShadowInvalidValue/);
  }
  assert.equal(game.settings.set.mock.callCount(), 0);
});

test("players cannot open or save world shadow controls", async (t) => {
  const { values, warnings } = setup(t, false);
  assert.equal(await openTokenShadowSettings(), null);
  assert.deepEqual(warnings, ["MKACTORS.TokenShadowsGMOnly"]);
  await assert.rejects(saveTokenShadowSettings({ ...values, tokenShadowsEnabled: true }), /TokenShadowsGMOnly/);
  assert.equal(game.settings.set.mock.callCount(), 0);
});

test("MK Shadowdark never replaces the standalone settings window or receives its writes", async (t) => {
  const { values } = setup(t);
  const constructed = t.mock.fn();
  game.modules.set("mk-shadowdark", { active: true });
  game.settings.settings = new Map([["mk-shadowdark.tokenShadowsEnabled", {}]]);
  game.settings.menus = new Map([["mk-shadowdark.tokenShadowsSettings", { type: class { constructor() { constructed(); } } }]]);
  const get = game.settings.get;
  game.settings.get = (namespace, key) => namespace === "mk-shadowdark" ? true : get(namespace, key);
  const app = await openTokenShadowSettings();
  assert.equal(app.context.available, true);
  assert.equal(app.context.notice, "MKACTORS.TokenShadowsOtherRenderer");
  assert.equal(constructed.mock.callCount(), 0);
  await saveTokenShadowSettings({ ...values, tokenShadowBlur: 8 });
  assert.deepEqual(game.settings.set.mock.calls[0].arguments, ["mk-actors", "tokenShadowBlur", 8]);
});

test("failed setting writes keep the standalone settings window open", async (t) => {
  const { values } = setup(t);
  game.settings.set = async () => { throw new Error("Save failed"); };
  t.mock.method(console, "error", () => {});
  const app = await openTokenShadowSettings();
  assert.equal(await app.onSubmit(submission({ ...values, tokenShadowsEnabled: true })), false);
  assert.equal(app.rendered, true);
  assert.equal(ui.notifications.error.mock.callCount(), 1);
  assert.equal(getTokenShadowFields().length, 7);
});
