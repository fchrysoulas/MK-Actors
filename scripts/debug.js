import { MODULE_ID } from "./constants.js";

export function isDebugModeEnabled() {
  try {
    return globalThis.game?.settings?.get(MODULE_ID, "debugMode") === true;
  } catch (_err) {
    return false;
  }
}

export function debugLog(message, data = undefined) {
  if (!isDebugModeEnabled()) return;

  if (data === undefined) {
    console.debug(`MK Actors | ${message}`);
  } else {
    console.debug(`MK Actors | ${message}`, data);
  }
}
