import { MODULE_ID, TOKEN_SHADOW_SETTINGS } from "./constants.js";
import { debugLog } from "./debug.js";
import { getTokenShadowSetting } from "./token-shadows.js";
import { localize } from "./utils.js";

let settingsApp = null;

export function getTokenShadowFields() {
  return TOKEN_SHADOW_SETTINGS.map((definition) => ({
    key: definition.key, label: localize(definition.label),
    value: getTokenShadowSetting(definition.key), isBoolean: definition.type === Boolean,
    ...definition.range
  }));
}

export async function saveTokenShadowSettings(values) {
  if (!game.user?.isGM) throw new Error(localize("TokenShadowsGMOnly"));
  const updates = getTokenShadowFields().map((field) => {
    const input = values[field.key];
    const value = field.isBoolean ? input : Number(input);
    if (field.isBoolean ? typeof value !== "boolean" : input == null || String(input).trim() === "" || !Number.isFinite(value)
      || value < field.min || value > field.max) {
      throw new Error(localize("TokenShadowInvalidValue"));
    }
    return { key: field.key, value, current: field.value };
  });
  for (const { key, value, current } of updates) {
    if (value !== current) await game.settings.set(MODULE_ID, key, value);
  }
}

export async function openTokenShadowSettings() {
  if (!globalThis.game?.user?.isGM) {
    ui.notifications.warn(localize("TokenShadowsGMOnly"));
    return null;
  }
  try {
    const { MKTokenShadowSettings } = await import("./token-shadow-settings.js");
    const app = settingsApp ??= new MKTokenShadowSettings();
    await app.render(true);
    debugLog("Opened token shadow settings");
    return app;
  } catch (error) {
    console.error(`${MODULE_ID} | Could not open token shadow settings.`, error);
    ui.notifications.error(localize("TokenShadowSettingsFailed"));
    return null;
  }
}
