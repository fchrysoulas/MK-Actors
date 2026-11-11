import { MK_SHADOWDARK_ID, MK_SHADOWDARK_SHADOWS_MENU, MODULE_ID } from "./constants.js";
import { debugLog } from "./debug.js";
import { localize } from "./utils.js";

const shadowFields = [
  ["tokenShadowsEnabled", "TokenShadowsEnabled"],
  ["tokenShadowWidthFactor", "TokenShadowWidth"],
  ["tokenShadowHeightGridFactor", "TokenShadowHeight"],
  ["tokenShadowOffsetYFactor", "TokenShadowOffset"],
  ["tokenShadowAlpha", "TokenShadowOpacity"],
  ["tokenShadowBlur", "TokenShadowBlur"],
  ["tokenShadowBlurQuality", "TokenShadowBlurQuality"]
];

let fallbackApp = null;

export function getTokenShadowFields() {
  if (!globalThis.game?.modules?.get?.(MK_SHADOWDARK_ID)?.active) return [];
  const settings = game.settings?.settings;
  if (!settings?.has?.(`${MK_SHADOWDARK_ID}.tokenShadowsEnabled`)) return [];
  return shadowFields.flatMap(([key, label]) => {
    const definition = settings.get(`${MK_SHADOWDARK_ID}.${key}`);
    if (!definition) return [];
    return [{ key, label: localize(label), value: game.settings.get(MK_SHADOWDARK_ID, key),
      isBoolean: definition.type === Boolean, ...definition.range }];
  });
}

export async function saveTokenShadowSettings(values) {
  if (!game.user?.isGM) throw new Error(localize("TokenShadowsGMOnly"));
  const fields = getTokenShadowFields();
  if (!fields.length) throw new Error(localize("TokenShadowsUnavailable"));
  const updates = fields.map((field) => {
    const input = values[field.key];
    const value = field.isBoolean ? input : Number(input);
    if (field.isBoolean ? typeof value !== "boolean" : input === "" || input == null || !Number.isFinite(value)
      || value < (field.min ?? -Infinity) || value > (field.max ?? Infinity)) {
      throw new Error(localize("TokenShadowInvalidValue"));
    }
    return { key: field.key, value, current: field.value };
  });
  for (const { key, value, current } of updates) {
    if (value !== current) await game.settings.set(MK_SHADOWDARK_ID, key, value);
  }
}

function getTokenShadowSettingsMenu() {
  if (!globalThis.game?.modules?.get?.(MK_SHADOWDARK_ID)?.active) return null;
  const menu = game.settings?.menus?.get?.(`${MK_SHADOWDARK_ID}.${MK_SHADOWDARK_SHADOWS_MENU}`);
  return typeof menu?.type === "function" ? menu : null;
}

export function canConfigureTokenShadows() {
  return globalThis.game?.user?.isGM === true && Boolean(getTokenShadowSettingsMenu() || getTokenShadowFields().length);
}

export async function openTokenShadowSettings() {
  if (!globalThis.game?.user?.isGM) {
    ui.notifications.warn(localize("TokenShadowsGMOnly"));
    return null;
  }
  const menu = getTokenShadowSettingsMenu();
  try {
    if (menu) {
      try {
        const app = new menu.type();
        await app.render(true);
        debugLog("Opened MK Shadowdark Token Shadows settings");
        return app;
      } catch (error) {
        console.warn(`${MODULE_ID} | MK Shadowdark Token Shadows menu failed; opening fallback.`, error);
      }
    }
    // Some MK Shadowdark versions expose settings without a working custom submenu.
    const { MKTokenShadowSettings } = await import("./token-shadow-settings.js");
    const app = fallbackApp ??= new MKTokenShadowSettings();
    await app.render(true);
    debugLog("Opened MK Shadowdark Token Shadows settings");
    return app;
  } catch (error) {
    console.error(`${MODULE_ID} | Could not open MK Shadowdark Token Shadows settings.`, error);
    ui.notifications.error(localize("TokenShadowSettingsFailed"));
    return null;
  }
}
