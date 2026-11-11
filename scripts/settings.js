import { MODULE_ID, TOKEN_SHADOW_SETTINGS } from "./constants.js";
import { debugLog } from "./debug.js";
import { MKActorsApi } from "./api.js";
import { openTokenShadowSettings } from "./token-shadow-controls.js";
import { refreshTokenShadows } from "./token-shadows.js";

class MKActorsOpenGalleryMenu extends foundry.applications.api.ApplicationV2 {
  render(_force, _options = {}) {
    debugLog("Settings menu launcher opened");
    MKActorsApi.open();
    return this;
  }
}

class MKActorsTokenShadowsMenu extends foundry.applications.api.ApplicationV2 {
  render() {
    void openTokenShadowSettings();
    return this;
  }
}

function refreshAfterSettingChange(setting, value) {
  debugLog("Setting changed", { setting, value });
  MKActorsApi.refresh({ open: false });
}

export function registerSettings() {
  for (const definition of TOKEN_SHADOW_SETTINGS) {
    game.settings.register(MODULE_ID, definition.key, {
      name: game.i18n.localize(`MKACTORS.${definition.label}`),
      scope: "world", config: false, type: definition.type,
      default: definition.default, ...(definition.range ? { range: { ...definition.range } } : {}),
      onChange: refreshTokenShadows
    });
  }
  game.settings.register(MODULE_ID, "favoriteActors", {
    name: game.i18n.localize("MKACTORS.FavoriteActors"),
    hint: game.i18n.localize("MKACTORS.FavoriteActorsHint"),
    scope: "client",
    config: false,
    type: Array,
    default: []
  });

  game.settings.register(MODULE_ID, "includeWorldActors", {
    name: game.i18n.localize("MKACTORS.IncludeWorldActors"),
    hint: game.i18n.localize("MKACTORS.IncludeWorldActorsHint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    onChange: (value) => refreshAfterSettingChange("includeWorldActors", value)
  });

  game.settings.register(MODULE_ID, "includeCompendiumActors", {
    name: game.i18n.localize("MKACTORS.IncludeCompendiumActors"),
    hint: game.i18n.localize("MKACTORS.IncludeCompendiumActorsHint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    onChange: (value) => refreshAfterSettingChange("includeCompendiumActors", value)
  });

  game.settings.register(MODULE_ID, "showOnlyVisiblePacks", {
    name: game.i18n.localize("MKACTORS.ShowOnlyVisiblePacks"),
    hint: game.i18n.localize("MKACTORS.ShowOnlyVisiblePacksHint"),
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange: (value) => refreshAfterSettingChange("showOnlyVisiblePacks", value)
  });

  game.settings.register(MODULE_ID, "cardSize", {
    name: game.i18n.localize("MKACTORS.CardSize"),
    hint: game.i18n.localize("MKACTORS.CardSizeHint"),
    scope: "client",
    config: true,
    type: Number,
    default: 150,
    range: {
      min: 120,
      max: 260,
      step: 10
    },
    onChange: (value) => refreshAfterSettingChange("cardSize", value)
  });

  game.settings.register(MODULE_ID, "syncPortraitToTokenImage", {
    name: game.i18n.localize("MKACTORS.SyncPortraitToTokenImage"),
    hint: game.i18n.localize("MKACTORS.SyncPortraitToTokenImageHint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: (value) => debugLog("Setting changed", { setting: "syncPortraitToTokenImage", value })
  });

  game.settings.register(MODULE_ID, "debugMode", {
    name: game.i18n.localize("MKACTORS.DebugMode"),
    hint: game.i18n.localize("MKACTORS.DebugModeHint"),
    scope: "client",
    config: true,
    type: Boolean,
    default: false,
    onChange: (value) => debugLog("Debug mode changed", { enabled: value })
  });

  game.settings.registerMenu(MODULE_ID, "openGallery", {
    name: game.i18n.localize("MKACTORS.Open"),
    label: game.i18n.localize("MKACTORS.Open"),
    hint: game.i18n.localize("MKACTORS.OpenHint"),
    icon: "fas fa-users-viewfinder",
    type: MKActorsOpenGalleryMenu,
    restricted: false
  });
  game.settings.registerMenu(MODULE_ID, "tokenShadows", {
    name: game.i18n.localize("MKACTORS.TokenShadowSettings"),
    label: game.i18n.localize("MKACTORS.ConfigureTokenShadows"),
    hint: game.i18n.localize("MKACTORS.TokenShadowSettingsHint"),
    icon: "fas fa-circle-half-stroke",
    type: MKActorsTokenShadowsMenu,
    restricted: true
  });
  debugLog("Settings registered");
}

export function registerKeybinding() {
  if (!game.keybindings) return;

  game.keybindings.register(MODULE_ID, "openGallery", {
    name: game.i18n.localize("MKACTORS.Open"),
    hint: game.i18n.localize("MKACTORS.OpenHint"),
    editable: [
      {
        key: "KeyG",
        modifiers: ["CONTROL", "SHIFT"]
      }
    ],
    onDown: () => {
      debugLog("Open gallery keybinding pressed");
      MKActorsApi.open();
      return true;
    },
    restricted: false,
    precedence: CONST.KEYBINDING_PRECEDENCE?.NORMAL ?? 0
  });
  debugLog("Keybinding registered", { id: "openGallery" });
}
