import { DEFAULT_ACTOR_IMAGE } from "./constants.js";

export function splitSetting(value) {
  return String(value ?? "")
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

export function getActorImage(actorOrIndex) {
  return actorOrIndex?.img
    || actorOrIndex?.prototypeToken?.texture?.src
    || actorOrIndex?.texture?.src
    || DEFAULT_ACTOR_IMAGE;
}

export function titleCase(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  return raw
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function getUuidForIndex(pack, indexEntry) {
  return indexEntry.uuid || `Compendium.${pack.collection}.${indexEntry._id}`;
}

export function canViewActor(actor) {
  if (game.user?.isGM) return true;
  if (!actor?.testUserPermission) return true;
  try {
    return actor.testUserPermission(game.user, "OBSERVER");
  } catch (_err) {
    return true;
  }
}
