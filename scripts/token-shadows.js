// Adapted from MK Shadowdark's MIT-licensed renderer; see THIRD_PARTY_NOTICES.md.
import { MK_SHADOWDARK_ID, MODULE_ID, TOKEN_SHADOW_SETTINGS } from "./constants.js";
import { debugLog } from "./debug.js";

const shadowStates = new WeakMap();
const shadowTokens = new Set();

export function getTokenShadowSetting(key) {
  const definition = TOKEN_SHADOW_SETTINGS.find((setting) => setting.key === key);
  try {
    return game.settings.get(MODULE_ID, key) ?? definition.default;
  } catch (_error) {
    return definition.default;
  }
}

export function isShadowdarkDrawingShadows() {
  if (!globalThis.game?.modules?.get?.(MK_SHADOWDARK_ID)?.active) return false;
  try {
    return game.settings.settings?.has?.(`${MK_SHADOWDARK_ID}.tokenShadowsEnabled`)
      && game.settings.get(MK_SHADOWDARK_ID, "tokenShadowsEnabled") === true;
  } catch (_error) {
    return false;
  }
}

function shadowNumber(key, getValue) {
  const definition = TOKEN_SHADOW_SETTINGS.find((setting) => setting.key === key);
  const value = Number(getValue(key) ?? definition.default);
  return Number.isFinite(value)
    ? Math.min(definition.range.max, Math.max(definition.range.min, value)) : definition.default;
}

export function getTokenShadowAppearance({ width, height, gridSize }, getValue = getTokenShadowSetting) {
  const radiusX = Math.max(2, width * shadowNumber("tokenShadowWidthFactor", getValue));
  const radiusY = Math.max(1, gridSize * shadowNumber("tokenShadowHeightGridFactor", getValue));
  return {
    x: width / 2, y: height - radiusY * shadowNumber("tokenShadowOffsetYFactor", getValue), radiusX, radiusY,
    alpha: shadowNumber("tokenShadowAlpha", getValue), blur: shadowNumber("tokenShadowBlur", getValue),
    quality: Math.round(shadowNumber("tokenShadowBlurQuality", getValue))
  };
}

function getBlurFilterClass() {
  return globalThis.PIXI?.BlurFilter ?? globalThis.PIXI?.filters?.BlurFilter ?? null;
}

export function removeTokenShadow(token) {
  const state = shadowStates.get(token);
  if (!state) return;
  const { shadow, blurFilter } = state;
  if (!shadow.destroyed && "cacheAsBitmap" in shadow) shadow.cacheAsBitmap = false;
  shadow.filters = null;
  try { blurFilter?.destroy?.(); } catch (_error) { /* The canvas may have already destroyed the filter. */ }
  if (!shadow.destroyed) {
    shadow.parent?.removeChild(shadow);
    shadow.destroy({ children: true, texture: false, baseTexture: false });
  }
  shadowStates.delete(token);
  shadowTokens.delete(token);
}

function ensureTokenShadow(token) {
  let state = shadowStates.get(token);
  if (state && !state.shadow.destroyed) return state;
  if (state) removeTokenShadow(token);
  const Graphics = globalThis.PIXI?.Graphics;
  if (!Graphics) return null;
  const shadow = new Graphics();
  shadow.name = "mk-actors-token-shadow";
  shadow.interactive = false;
  shadow.interactiveChildren = false;
  shadow.eventMode = "none";
  try { token.addChildAt(shadow, 0); } catch (_error) { token.addChild(shadow); }
  state = { shadow, blurFilter: null, drawState: null };
  shadowStates.set(token, state);
  shadowTokens.add(token);
  return state;
}

export function refreshTokenShadow(token) {
  if (!token) return;
  if (!globalThis.canvas?.ready || token.destroyed || !getTokenShadowSetting("tokenShadowsEnabled") || isShadowdarkDrawingShadows()) {
    removeTokenShadow(token);
    return;
  }
  refreshTokenShadowWithSettings(token, getTokenShadowSetting);
}

function readTokenShadowSettings() {
  if (!getTokenShadowSetting("tokenShadowsEnabled") || isShadowdarkDrawingShadows()) return null;
  return Object.fromEntries(TOKEN_SHADOW_SETTINGS.filter((field) => field.range)
    .map((field) => [field.key, getTokenShadowSetting(field.key)]));
}

function refreshTokenShadowWithSettings(token, getValue) {
  if (token.destroyed) return removeTokenShadow(token);
  const state = ensureTokenShadow(token);
  if (!state) return;
  const gridSize = canvas.grid?.size ?? 100;
  drawTokenShadow(state, getTokenShadowAppearance({ width: token.w ?? gridSize, height: token.h ?? gridSize, gridSize }, getValue));
}

export function drawTokenShadow(state, { x, y, radiusX, radiusY, alpha, blur, quality }) {
  const { shadow } = state;
  const BlurFilter = getBlurFilterClass();
  const drawState = [x, y, radiusX, radiusY, alpha, blur, quality, BlurFilter];
  // Movement and hover refreshes do not change the token's local shadow geometry.
  if (state.drawState && drawState.every((value, index) => value === state.drawState[index])) return;
  const canCache = "cacheAsBitmap" in shadow;
  if (canCache) shadow.cacheAsBitmap = false;
  shadow.clear();
  shadow.visible = alpha > 0;
  shadow.alpha = 1;
  shadow.filters = null;
  if (alpha > 0) {
    shadow.beginFill(0x000000, alpha);
    shadow.drawEllipse(x, y, radiusX, radiusY);
    shadow.endFill();
    if (blur > 0 && BlurFilter) {
      try {
        state.blurFilter ??= new BlurFilter();
        const filter = state.blurFilter;
        if ("blur" in filter) filter.blur = blur;
        if ("blurX" in filter) filter.blurX = blur;
        if ("blurY" in filter) filter.blurY = blur;
        if ("quality" in filter) filter.quality = quality;
        filter.padding = Math.ceil(blur * 3);
        shadow.filters = [filter];
      } catch (error) {
        debugLog("Token shadow blur unavailable", { error });
      }
    }
  }
  if (canCache && shadow.filters?.length) {
    // Bake small blurred ellipses once; large shadows retain the normal filter path.
    const cacheWidth = Math.ceil(radiusX * 2 + blur * 6);
    const cacheHeight = Math.ceil(radiusY * 2 + blur * 6);
    shadow.cacheAsBitmapResolution = 1;
    shadow.cacheAsBitmap = cacheWidth * cacheHeight <= 65536;
  }
  state.drawState = drawState;
}

export function clearTokenShadows() {
  for (const token of shadowTokens) removeTokenShadow(token);
}

export function refreshTokenShadows() {
  if (!globalThis.canvas?.ready) return clearTokenShadows();
  const values = readTokenShadowSettings();
  if (!values) return clearTokenShadows();
  const getValue = (key) => values[key];
  for (const token of new Set([...shadowTokens, ...(canvas.tokens?.placeables ?? [])])) refreshTokenShadowWithSettings(token, getValue);
}

export function registerTokenShadowHooks() {
  Hooks.on("canvasReady", refreshTokenShadows);
  Hooks.on("canvasTearDown", clearTokenShadows);
  Hooks.on("drawToken", refreshTokenShadow);
  Hooks.on("refreshToken", refreshTokenShadow);
  Hooks.on("destroyToken", removeTokenShadow);
  Hooks.on("updateToken", (document) => refreshTokenShadow(document?.object));
  Hooks.on("createToken", (document) => refreshTokenShadow(document?.object));
  Hooks.on("deleteToken", (document) => removeTokenShadow(document?.object));
  Hooks.on("updateSetting", (setting) => {
    if (setting.key === `${MK_SHADOWDARK_ID}.tokenShadowsEnabled`) refreshTokenShadows();
  });
}
