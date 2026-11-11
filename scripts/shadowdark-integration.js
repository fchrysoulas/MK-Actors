import { MK_SHADOWDARK_ID, MK_SHADOWDARK_SHADOWS_MENU, MODULE_ID } from "./constants.js";
import { debugLog } from "./debug.js";
import { localize } from "./utils.js";

function getTokenShadowSettingsMenu() {
  if (!globalThis.game?.modules?.get?.(MK_SHADOWDARK_ID)?.active) return null;
  const menu = game.settings?.menus?.get?.(`${MK_SHADOWDARK_ID}.${MK_SHADOWDARK_SHADOWS_MENU}`);
  return typeof menu?.type === "function" ? menu : null;
}

export function canConfigureTokenShadows() {
  return globalThis.game?.user?.isGM === true && Boolean(getTokenShadowSettingsMenu());
}

export async function openTokenShadowSettings() {
  if (!globalThis.game?.user?.isGM) {
    ui.notifications.warn(localize("TokenShadowsGMOnly"));
    return null;
  }
  const menu = getTokenShadowSettingsMenu();
  if (!menu) {
    ui.notifications.warn(localize("TokenShadowsUnavailable"));
    return null;
  }
  try {
    // Reuse the registered menu so MK Shadowdark owns its settings and redraws.
    const app = new menu.type();
    await app.render(true);
    debugLog("Opened MK Shadowdark Token Shadows settings");
    return app;
  } catch (error) {
    console.error(`${MODULE_ID} | Could not open MK Shadowdark Token Shadows settings.`, error);
    ui.notifications.error(localize("TokenShadowSettingsFailed"));
    return null;
  }
}
