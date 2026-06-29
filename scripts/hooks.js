import { MODULE_ID } from "./constants.js";
import { debugLog } from "./debug.js";
import { MKActorsApi } from "./api.js";

function setUpdateProperty(changes, path, value) {
  changes[path] = value;
}

function shouldSyncPortraitToTokenImage(changes, options = {}) {
  if (options.mkActorsSyncPortraitToTokenImage) {
    debugLog("Portrait sync skipped: update was created by MK Actors sync", { changes });
    return false;
  }
  const enabled = options.mkActorsForcePortraitToTokenImage || game.settings.get(MODULE_ID, "syncPortraitToTokenImage");
  if (!enabled) {
    debugLog("Portrait sync skipped: setting disabled", { changes });
    return false;
  }
  if (!Object.prototype.hasOwnProperty.call(changes, "img")) {
    debugLog("Portrait sync skipped: Actor image not changed", { changes });
    return false;
  }
  if (typeof changes.img !== "string") {
    debugLog("Portrait sync skipped: Actor image change was not a string", { image: changes.img });
    return false;
  }
  if (!changes.img) {
    debugLog("Portrait sync skipped: Actor image change was empty");
    return false;
  }
  return true;
}

export function syncPortraitToTokenImage(actor, changes, options) {
  if (!shouldSyncPortraitToTokenImage(changes, options)) return;

  setUpdateProperty(changes, "prototypeToken.texture.src", changes.img);
  debugLog("Portrait sync applied before Actor update", {
    actorId: actor?.id,
    actorUuid: actor?.uuid,
    image: changes.img
  });
}

export async function ensurePortraitSyncedToTokenImage(actor, changes, options) {
  if (!shouldSyncPortraitToTokenImage(changes, options)) return;

  const portraitImage = actor.img || changes.img;
  const tokenImage = actor.prototypeToken?.texture?.src || "";
  if (!portraitImage || tokenImage === portraitImage) {
    debugLog("Portrait sync follow-up skipped: prototype token already matches", {
      actorId: actor.id,
      actorUuid: actor.uuid,
      portraitImage,
      tokenImage
    });
    return;
  }

  try {
    debugLog("Portrait sync follow-up updating prototype token image", {
      actorId: actor.id,
      actorUuid: actor.uuid,
      portraitImage,
      tokenImage
    });
    await actor.update(
      { "prototypeToken.texture.src": portraitImage },
      { mkActorsSyncPortraitToTokenImage: true }
    );
    debugLog("Portrait sync follow-up complete", {
      actorId: actor.id,
      actorUuid: actor.uuid,
      portraitImage
    });
  } catch (err) {
    debugLog("Portrait sync follow-up failed", {
      actorId: actor.id,
      actorUuid: actor.uuid,
      error: err
    });
    console.warn("MK Actors | Failed to sync portrait to token image.", err);
  }
}

export function addDirectoryButton(_app, html) {
  const root = html?.[0] || html;
  if (!root?.querySelector) return;
  if (root.querySelector(".mk-actors-directory-button")) return;

  const header = root.querySelector(".directory-header .header-actions") || root.querySelector(".directory-header");
  if (!header) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "mk-actors-directory-button";
  button.title = game.i18n.localize("MKACTORS.Open");
  button.innerHTML = `<i class="fas fa-users-viewfinder"></i>`;
  button.addEventListener("click", () => {
    debugLog("Actor Directory button clicked");
    MKActorsApi.open();
  });
  header.appendChild(button);
  debugLog("Actor Directory button added");
}

export function addSceneControlButton(controls) {
  const title = game.i18n.localize("MKACTORS.Open");
  const tool = {
    name: "mk-actors",
    title,
    icon: "fas fa-users-viewfinder",
    button: true,
    visible: true,
    onClick: () => {
      debugLog("Scene control button clicked");
      MKActorsApi.open();
    },
    onChange: () => {
      debugLog("Scene control changed");
      MKActorsApi.open();
    }
  };

  if (Array.isArray(controls)) {
    const group = controls.find((control) => ["token", "tokens"].includes(control.name)) || controls[0];
    if (Array.isArray(group?.tools) && !group.tools.some((existing) => existing.name === tool.name)) {
      group.tools.push(tool);
      debugLog("Scene control button added", { group: group.name || "" });
    }
    return;
  }

  const tokenControls = controls?.tokens || controls?.token;
  if (!tokenControls?.tools) return;

  if (Array.isArray(tokenControls.tools)) {
    if (!tokenControls.tools.some((existing) => existing.name === tool.name)) {
      tokenControls.tools.push(tool);
      debugLog("Scene control button added", { shape: "array" });
    }
  } else if (!tokenControls.tools[tool.name]) {
    tokenControls.tools[tool.name] = tool;
    debugLog("Scene control button added", { shape: "object" });
  }
}
