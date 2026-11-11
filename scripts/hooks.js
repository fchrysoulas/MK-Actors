import { MODULE_ID } from "./constants.js";
import { debugLog } from "./debug.js";
import { MKActorsApi } from "./api.js";

let galleryRefreshTimer = null;

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

export async function ensurePortraitSyncedToTokenImage(actor, changes, options, userId) {
  // Update hooks run on every connected client; only the initiator sends a follow-up.
  if (!userId || userId !== game.user?.id) return;
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

  const header = root.querySelector(".directory-header .header-actions")
    || root.querySelector(".directory-header .header-buttons")
    || root.querySelector(".directory-header")
    || root.querySelector("header");
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

function getControlName(control, key = "") {
  return String(control?.name || control?.id || key || "").toLowerCase();
}

function isTokenControl(control, key = "") {
  const name = getControlName(control, key);
  if (["token", "tokens"].includes(name)) return true;

  const layerName = String(control?.layer?.name || control?.layer || "").toLowerCase();
  return layerName === "tokenlayer";
}

function getSceneControlEntries(controls) {
  if (!controls) return [];
  if (Array.isArray(controls)) return controls.map((control, index) => [String(index), control]);
  if (controls instanceof Map) return Array.from(controls.entries());
  if (typeof controls === "object") return Object.entries(controls);
  return [];
}

function findSceneControlGroup(controls) {
  const entries = getSceneControlEntries(controls);
  const tokenGroup = entries.find(([key, control]) => isTokenControl(control, key));
  if (tokenGroup?.[1]) return tokenGroup[1];

  const nestedControls = controls?.controls || controls?.groups;
  if (nestedControls && nestedControls !== controls) {
    const nestedGroup = findSceneControlGroup(nestedControls);
    if (nestedGroup) return nestedGroup;
  }

  return entries.find(([, control]) => control?.tools)?.[1] || null;
}

function hasSceneControlTool(tools, name) {
  if (Array.isArray(tools)) return tools.some((tool) => tool.name === name || tool.id === name);
  if (tools instanceof Map) return tools.has(name);
  return Boolean(tools?.[name]);
}

function getNextSceneControlToolOrder(tools) {
  const entries = Array.isArray(tools)
    ? tools
    : tools instanceof Map
      ? Array.from(tools.values())
      : Object.values(tools || {});
  const orders = entries.map((tool) => Number(tool?.order)).filter(Number.isFinite);
  return orders.length ? Math.max(...orders) + 1 : entries.length;
}

function addSceneControlTool(group, tool) {
  if (!group) return false;
  if (!group.tools) group.tools = Array.isArray(group) ? [] : {};

  if (hasSceneControlTool(group.tools, tool.name)) return false;

  if (Array.isArray(group.tools)) {
    group.tools.push(tool);
    return true;
  }

  if (group.tools instanceof Map) {
    group.tools.set(tool.name, tool);
    return true;
  }

  group.tools[tool.name] = tool;
  return true;
}

export function addSceneControlButton(controls) {
  const title = game.i18n.localize("MKACTORS.Open");
  const tool = {
    name: "mk-actors",
    id: "mk-actors",
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

  const group = findSceneControlGroup(controls);
  tool.order = getNextSceneControlToolOrder(group?.tools);
  if (addSceneControlTool(group, tool)) {
    debugLog("Scene control button added", { group: group?.name || group?.id || "" });
  }
}

export function scheduleActorGalleryRefresh(_actor, changes = {}) {
  // Combat statistics do not change gallery cards, permissions, or filters.
  if (!Object.keys(changes).some((key) => /^(name|img|type|folder|ownership|permission|prototypeToken)(\.|$)/.test(key))) return;
  scheduleGalleryRefresh();
}

export function scheduleGalleryRefresh() {
  clearTimeout(galleryRefreshTimer);
  galleryRefreshTimer = setTimeout(() => {
    galleryRefreshTimer = null;
    MKActorsApi.refresh({ open: false });
  }, 100);
}
