import assert from "node:assert/strict";
import test from "node:test";
import { TOKEN_SHADOW_SETTINGS } from "../scripts/constants.js";
import { TokenShadowPreview } from "../scripts/token-shadow-preview.js";

function setup(t, withRenderer = true) {
  const previous = Object.fromEntries(["PIXI", "game", "requestAnimationFrame", "cancelAnimationFrame"].map((key) => [key, globalThis[key]]));
  const frames = new Map();
  let nextFrame = 0;
  globalThis.requestAnimationFrame = (callback) => { frames.set(++nextFrame, callback); return nextFrame; };
  globalThis.cancelAnimationFrame = (id) => frames.delete(id);
  globalThis.game = {
    modules: new Map([["mk-shadowdark", { active: true }]]),
    i18n: { localize: (key) => key },
    settings: { get: () => false, set: () => assert.fail("A preview must not persist settings") }
  };
  class Graphics {
    destroyCount = 0;
    lineStyle() { return this; }
    drawRect() { return this; }
    drawCircle() { return this; }
    drawRoundedRect() { return this; }
    beginFill(color, alpha) { this.fill = { color, alpha }; return this; }
    drawEllipse(...ellipse) { this.ellipse = ellipse; return this; }
    endFill() { return this; }
    clear() {}
    destroy() { this.destroyCount++; }
  }
  class Container {
    children = [];
    scale = { set() {} };
    position = { set() {} };
    addChild(...children) { this.children.push(...children); }
    destroy() { for (const child of this.children) child.destroy(); }
  }
  class Renderer {
    renderCount = 0;
    destroyCount = 0;
    render() { this.renderCount++; }
    destroy() { this.destroyCount++; }
  }
  class BlurFilter {
    blur = 0;
    quality = 0;
    destroyCount = 0;
    destroy() { this.destroyCount++; }
  }
  globalThis.PIXI = withRenderer ? { Graphics, Container, Renderer, BlurFilter } : undefined;
  const inputs = new Map();
  for (const field of TOKEN_SHADOW_SETTINGS) {
    inputs.set(field.key, { value: String(field.default), checked: field.default, validity: { valid: true },
      dataset: field.range ? { shadowValue: field.key } : {} });
    if (field.range) inputs.set(`${field.key}Range`, { value: String(field.default), validity: { valid: true }, dataset: { shadowSlider: field.key } });
  }
  const canvas = { hidden: false };
  const status = {};
  const form = new EventTarget();
  form.elements = { namedItem: (key) => inputs.get(key) };
  form.querySelector = (selector) => selector.includes("-status") ? status : canvas;
  const preview = new TokenShadowPreview(form);
  const input = (key, value, valid = true) => {
    const target = inputs.get(key);
    target.value = String(value);
    target.checked = value;
    target.validity.valid = valid;
    const event = new Event("input");
    Object.defineProperty(event, "target", { value: target });
    form.dispatchEvent(event);
  };
  const flush = () => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach((callback) => callback()); };
  t.after(() => { preview.destroy(); Object.assign(globalThis, previous); });
  return { preview, inputs, input, flush, frames, status, canvas };
}

test("sliders and numeric values update an isolated preview with the Scene renderer", (t) => {
  const { preview, inputs, input, flush, frames } = setup(t);
  const shadow = preview.shadowState.shadow;
  assert.equal(shadow.visible, false);
  input("tokenShadowsEnabled", true);
  input("tokenShadowWidthFactorRange", 1.2);
  input("tokenShadowAlphaRange", 0.8);
  input("tokenShadowBlur", 12);
  input("tokenShadowBlurQualityRange", 3);
  assert.equal(inputs.get("tokenShadowWidthFactor").value, "1.2");
  assert.equal(inputs.get("tokenShadowBlurRange").value, "12");
  assert.equal(frames.size, 1);
  flush();
  assert.equal(shadow.visible, true);
  assert.deepEqual(shadow.ellipse.slice(2), [120, 12]);
  assert.equal(shadow.fill.alpha, 0.8);
  assert.equal(shadow.filters[0].blur, 12);
  assert.equal(shadow.filters[0].quality, 3);
  assert.equal(preview.renderer.renderCount, 2);
});

test("invalid draft numbers preserve the last preview and disabling hides the shadow", (t) => {
  const { preview, inputs, input, flush, frames, status } = setup(t);
  input("tokenShadowsEnabled", true);
  input("tokenShadowOffsetYFactor", -0.5);
  flush();
  assert.equal(preview.shadowState.shadow.ellipse[1], 106);
  input("tokenShadowAlpha", "", false);
  assert.equal(frames.size, 0);
  assert.equal(inputs.get("tokenShadowAlphaRange").value, "0.55");
  assert.equal(preview.values.tokenShadowAlpha, 0.55);
  input("tokenShadowsEnabled", false);
  flush();
  assert.equal(preview.shadowState.shadow.visible, false);
  assert.match(status.textContent, /TokenShadowPreviewDisabled/);
});

test("closing a preview cancels drawing, removes input listeners, and frees graphics once", (t) => {
  const { preview, input, frames } = setup(t);
  const { renderer, stage, shadowState } = preview;
  const filter = shadowState.blurFilter;
  input("tokenShadowBlurRange", 8);
  assert.equal(frames.size, 1);
  preview.destroy();
  preview.destroy();
  input("tokenShadowBlurRange", 10);
  assert.equal(frames.size, 0);
  assert.equal(preview.values.tokenShadowBlur, 8);
  assert.equal(renderer.destroyCount, 1);
  assert.equal(filter.destroyCount, 1);
  assert.equal(shadowState.shadow.filters, null);
  assert.ok(stage.children.every((child) => child.destroyCount === 1));
});

test("sliders still synchronize when a graphics context cannot be created", (t) => {
  const { input, inputs, canvas, status } = setup(t, false);
  assert.equal(canvas.hidden, true);
  assert.match(status.textContent, /TokenShadowPreviewUnavailable/);
  input("tokenShadowWidthFactorRange", 1.5);
  assert.equal(inputs.get("tokenShadowWidthFactor").value, "1.5");
});
