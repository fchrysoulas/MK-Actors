import { MODULE_ID } from "./constants.js";
import { MKActorsApi } from "./api.js";
import { debugLog } from "./debug.js";
import { registerKeybinding, registerSettings } from "./settings.js";
import { refreshTokenShadows, registerTokenShadowHooks } from "./token-shadows.js";
import {
  addDirectoryButton,
  addSceneControlButton,
  ensurePortraitSyncedToTokenImage,
  scheduleGalleryRefresh,
  syncPortraitToTokenImage
} from "./hooks.js";

Hooks.once("init", () => {
  registerSettings();
  registerKeybinding();
  debugLog("Init hook complete");
});

Hooks.once("ready", () => {
  globalThis.MKActors = MKActorsApi;
  const module = game.modules.get(MODULE_ID);
  if (module) module.api = MKActorsApi;
  refreshTokenShadows();
  debugLog("Ready hook complete", { moduleId: MODULE_ID, apiRegistered: Boolean(module) });
});

Hooks.on("renderActorDirectory", addDirectoryButton);
registerTokenShadowHooks();
Hooks.on("getSceneControlButtons", addSceneControlButton);
Hooks.on("preUpdateActor", syncPortraitToTokenImage);
Hooks.on("updateActor", ensurePortraitSyncedToTokenImage);

for (const hook of [
  "createActor",
  "updateActor",
  "deleteActor",
  "createFolder",
  "updateFolder",
  "deleteFolder",
  "createCompendium",
  "updateCompendium",
  "deleteCompendium"
]) {
  Hooks.on(hook, scheduleGalleryRefresh);
}
