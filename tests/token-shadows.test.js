import assert from "node:assert/strict";
import test from "node:test";
import { TOKEN_SHADOW_SETTINGS } from "../scripts/constants.js";
import { clearTokenShadows, refreshTokenShadow, refreshTokenShadows, registerTokenShadowHooks, removeTokenShadow } from "../scripts/token-shadows.js";

function setup(t) {
  const previous = { game: globalThis.game, canvas: globalThis.canvas, PIXI: globalThis.PIXI, Hooks: globalThis.Hooks };
  const values = Object.fromEntries(TOKEN_SHADOW_SETTINGS.map((setting) => [setting.key, setting.default]));
  values.tokenShadowsEnabled = true;
  class Graphics {
    clearCount = 0;
    destroyed = false;
    filters = null;
    clear() { this.clearCount += 1; }
    beginFill(color, alpha) { this.fill = { color, alpha }; }
    drawEllipse(...ellipse) { this.ellipse = ellipse; }
    endFill() {}
    destroy() { this.destroyed = true; }
  }
  class BlurFilter {
    blur = 0;
    quality = 0;
    destroyCount = 0;
    destroy() { this.destroyCount += 1; }
  }
  const token = {
    w: 200, h: 100, children: [],
    addChildAt(child, index) { this.children.splice(index, 0, child); child.parent = this; },
    addChild(child) { this.addChildAt(child, this.children.length); },
    removeChild(child) { this.children.splice(this.children.indexOf(child), 1); child.parent = null; }
  };
  const hooks = new Map();
  globalThis.Hooks = { on: (name, callback) => hooks.set(name, callback) };
  globalThis.PIXI = { Graphics, filters: { BlurFilter } };
  globalThis.canvas = { ready: true, grid: { size: 100 }, tokens: { placeables: [token] } };
  globalThis.game = {
    user: { isGM: false }, system: { id: "another-system" }, modules: new Map(),
    settings: { settings: new Map(), get: (namespace, key) => namespace === "mk-actors" ? values[key] : false }
  };
  t.after(() => { clearTokenShadows(); Object.assign(globalThis, previous); });
  return { values, token, hooks, BlurFilter };
}

test("standalone shadows reproduce the source ellipse geometry and blur on any system and client", (t) => {
  const { token } = setup(t);
  refreshTokenShadow(token);
  const shadow = token.children[0];
  assert.equal(shadow.name, "mk-actors-token-shadow");
  assert.deepEqual(shadow.fill, { color: 0x000000, alpha: 0.55 });
  assert.equal(shadow.ellipse[0], 100);
  assert.ok(Math.abs(shadow.ellipse[1] - 86.8) < 0.000001);
  assert.deepEqual(shadow.ellipse.slice(2), [150, 12]);
  assert.equal(shadow.eventMode, "none");
  assert.equal(shadow.filters[0].blur, 5);
  assert.equal(shadow.filters[0].quality, 2);
  assert.equal(shadow.filters[0].padding, 15);
});

test("movement reuses geometry and filters while resizing and setting changes redraw", (t) => {
  const { token, values } = setup(t);
  refreshTokenShadow(token);
  const shadow = token.children[0];
  const filter = shadow.filters[0];
  token.x = 100;
  refreshTokenShadow(token);
  assert.equal(shadow.clearCount, 1);
  token.w = 300;
  refreshTokenShadow(token);
  assert.equal(shadow.clearCount, 2);
  assert.equal(shadow.ellipse[0], 150);
  assert.equal(shadow.ellipse[2], 225);
  values.tokenShadowAlpha = 0.8;
  refreshTokenShadows();
  assert.equal(shadow.fill.alpha, 0.8);
  assert.equal(shadow.filters[0], filter);
  assert.equal(token.children.length, 1);
});

test("disabling shadows releases graphics and blur filters exactly once", (t) => {
  const { token, values } = setup(t);
  refreshTokenShadow(token);
  const shadow = token.children[0];
  const filter = shadow.filters[0];
  values.tokenShadowsEnabled = false;
  refreshTokenShadows();
  assert.equal(token.children.length, 0);
  assert.equal(shadow.destroyed, true);
  assert.equal(filter.destroyCount, 1);
  removeTokenShadow(token);
  assert.equal(filter.destroyCount, 1);
});

test("zero opacity, zero blur, absent blur support, and both PIXI filter namespaces work", (t) => {
  const { token, values, BlurFilter } = setup(t);
  delete PIXI.filters;
  PIXI.BlurFilter = BlurFilter;
  refreshTokenShadow(token);
  const shadow = token.children[0];
  assert.equal(shadow.filters[0] instanceof BlurFilter, true);
  values.tokenShadowBlur = 0;
  refreshTokenShadow(token);
  assert.equal(shadow.filters, null);
  delete PIXI.BlurFilter;
  values.tokenShadowBlur = 5;
  refreshTokenShadow(token);
  assert.equal(shadow.visible, true);
  assert.equal(shadow.filters, null);
  values.tokenShadowAlpha = 0;
  refreshTokenShadow(token);
  assert.equal(shadow.visible, false);
});

test("invalid rendering values fall back or clamp to the original shadow limits", (t) => {
  const { token, values } = setup(t);
  Object.assign(values, { tokenShadowWidthFactor: NaN, tokenShadowHeightGridFactor: Infinity, tokenShadowAlpha: 9, tokenShadowBlur: -1 });
  refreshTokenShadow(token);
  const shadow = token.children[0];
  assert.deepEqual(shadow.ellipse.slice(2), [150, 12]);
  assert.equal(shadow.fill.alpha, 1);
  assert.equal(shadow.filters, null);
});

test("MK Actors yields to enabled MK Shadowdark shadows and resumes when they are disabled", (t) => {
  const { token, hooks } = setup(t);
  registerTokenShadowHooks();
  refreshTokenShadow(token);
  const original = token.children[0];
  game.modules.set("mk-shadowdark", { active: true });
  game.settings.settings.set("mk-shadowdark.tokenShadowsEnabled", {});
  const get = game.settings.get;
  let otherEnabled = true;
  game.settings.get = (namespace, key) => namespace === "mk-shadowdark" ? otherEnabled : get(namespace, key);
  hooks.get("updateSetting")({ key: "mk-shadowdark.tokenShadowsEnabled" });
  assert.equal(original.destroyed, true);
  assert.equal(token.children.length, 0);
  otherEnabled = false;
  hooks.get("updateSetting")({ key: "mk-shadowdark.tokenShadowsEnabled" });
  assert.equal(token.children.length, 1);
});

test("lifecycle hooks draw, update, delete, and clean up shadows on scene teardown", (t) => {
  const { token, hooks } = setup(t);
  registerTokenShadowHooks();
  hooks.get("drawToken")(token);
  assert.equal(token.children.length, 1);
  token.h = 200;
  hooks.get("updateToken")({ object: token });
  assert.ok(Math.abs(token.children[0].ellipse[1] - 186.8) < 0.000001);
  hooks.get("deleteToken")({ object: token });
  assert.equal(token.children.length, 0);
  hooks.get("createToken")({ object: token });
  hooks.get("canvasTearDown")();
  assert.equal(token.children.length, 0);
  hooks.get("canvasReady")();
  hooks.get("destroyToken")(token);
  assert.equal(token.children.length, 0);
});

test("a missing canvas, destroyed token, or late document hook is harmless", (t) => {
  const { token, hooks } = setup(t);
  registerTokenShadowHooks();
  canvas.ready = false;
  refreshTokenShadow(token);
  assert.equal(token.children.length, 0);
  canvas.ready = true;
  refreshTokenShadow(token);
  token.destroyed = true;
  refreshTokenShadow(token);
  assert.equal(token.children.length, 0);
  assert.doesNotThrow(() => hooks.get("createToken")({ object: null }));
  globalThis.canvas = undefined;
  assert.doesNotThrow(refreshTokenShadows);
});
