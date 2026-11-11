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

function shadowNumber(key) {
  const definition = TOKEN_SHADOW_SETTINGS.find((setting) => setting.key === key);
  const value = Number(getTokenShadowSetting(key));
  return Number.isFinite(value)
    ? Math.min(definition.range.max, Math.max(definition.range.min, value)) : definition.default;
}

function getBlurFilterClass() {
  return globalThis.PIXI?.filters?.BlurFilter ?? globalThis.PIXI?.BlurFilter ?? null;
}

export function removeTokenShadow(token) {
  const state = shadowStates.get(token);
  if (!state) return;
  const { shadow, blurFilter } = state;
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
  const state = ensureTokenShadow(token);
  if (!state) return;
  const { shadow } = state;
  const gridSize = canvas.grid?.size ?? 100;
  const width = token.w ?? gridSize;
  const height = token.h ?? gridSize;
  const radiusX = Math.max(2, width * shadowNumber("tokenShadowWidthFactor"));
  const radiusY = Math.max(1, gridSize * shadowNumber("tokenShadowHeightGridFactor"));
  const x = width / 2;
  const y = height - radiusY * shadowNumber("tokenShadowOffsetYFactor");
  const alpha = shadowNumber("tokenShadowAlpha");
  const blur = shadowNumber("tokenShadowBlur");
  const quality = Math.round(shadowNumber("tokenShadowBlurQuality"));
  const BlurFilter = getBlurFilterClass();
  const drawState = [x, y, radiusX, radiusY, alpha, blur, quality, BlurFilter];
  // Movement and hover refreshes do not change the token's local shadow geometry.
  if (state.drawState && drawState.every((value, index) => value === state.drawState[index])) return;
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
  state.drawState = drawState;
}

export function clearTokenShadows() {
  for (const token of shadowTokens) removeTokenShadow(token);
}

export function refreshTokenShadows() {
  if (!globalThis.canvas?.ready) return clearTokenShadows();
  for (const token of new Set([...shadowTokens, ...(canvas.tokens?.placeables ?? [])])) refreshTokenShadow(token);
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
