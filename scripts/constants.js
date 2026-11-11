export const MODULE_ID = "mk-actors";
export const DEFAULT_ACTOR_IMAGE = "icons/svg/mystery-man.svg";
export const GALLERY_PAGE_SIZE = 200;
export const MK_SHADOWDARK_ID = "mk-shadowdark";
export const TOKEN_SHADOW_SETTINGS = Object.freeze([
  { key: "tokenShadowsEnabled", label: "TokenShadowsEnabled", type: Boolean, default: false },
  { key: "tokenShadowWidthFactor", label: "TokenShadowWidth", type: Number, default: 0.75, range: { min: 0.1, max: 2, step: 0.05 } },
  { key: "tokenShadowHeightGridFactor", label: "TokenShadowHeight", type: Number, default: 0.12, range: { min: 0.01, max: 1, step: 0.01 } },
  { key: "tokenShadowOffsetYFactor", label: "TokenShadowOffset", type: Number, default: 1.1, range: { min: -1, max: 2, step: 0.05 } },
  { key: "tokenShadowAlpha", label: "TokenShadowOpacity", type: Number, default: 0.55, range: { min: 0, max: 1, step: 0.05 } },
  { key: "tokenShadowBlur", label: "TokenShadowBlur", type: Number, default: 5, range: { min: 0, max: 40, step: 1 } },
  { key: "tokenShadowBlurQuality", label: "TokenShadowBlurQuality", type: Number, default: 2, range: { min: 1, max: 4, step: 1 } }
]);
