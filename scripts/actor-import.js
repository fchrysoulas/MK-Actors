import { localize } from "./utils.js";

function actorClass() {
  return game.actors?.documentClass ?? globalThis.CONFIG?.Actor?.documentClass
    ?? globalThis.Actor?.implementation ?? globalThis.foundry?.documents?.Actor?.implementation;
}

export function canImportActors() {
  try {
    return actorClass()?.canUserCreate(game.user) === true;
  } catch (_error) {
    return false;
  }
}

function validateActorImport(source) {
  if (!source || Array.isArray(source) || typeof source !== "object"
    || typeof source.name !== "string" || !source.name.trim()
    || typeof source.type !== "string" || !source.type
    || !source.system || typeof source.system !== "object" || Array.isArray(source.system)
    || !Array.isArray(source.items) || (source.documentName && source.documentName !== "Actor")) {
    throw new Error(localize("ImportActorInvalidJSON"));
  }
  const sourceSystem = source._stats?.exportSource?.systemId ?? source._stats?.systemId
    ?? source.flags?.exportSource?.system;
  if (sourceSystem && game.system?.id && sourceSystem !== game.system.id) {
    throw new Error(game.i18n.format("MKACTORS.ImportActorSystemMismatch", {
      source: sourceSystem, target: game.system.id
    }));
  }
  const types = game.documentTypes?.Actor;
  if (Array.isArray(types) && types.length && !types.includes(source.type)) {
    throw new Error(game.i18n.format("MKACTORS.ImportActorTypeUnavailable", { type: source.type }));
  }
  return source;
}

export function parseActorImport(json) {
  let source;
  try {
    source = JSON.parse(json);
  } catch (_error) {
    throw new Error(localize("ImportActorInvalidJSON"));
  }
  return validateActorImport(source);
}

export async function importActor(source, { imagePath = "" } = {}) {
  if (!canImportActors()) throw new Error(localize("CannotImportActor"));
  validateActorImport(source);
  const ActorClass = actorClass();
  // Preserve export metadata until Foundry has applied core and system migrations.
  const document = await ActorClass.fromImport(structuredClone(source));
  const data = game.actors.fromCompendium(document, { clearFolder: true, clearOwnership: true, keepId: false });
  const image = imagePath.trim();
  if (image) {
    data.img = image;
    data.prototypeToken ??= {};
    data.prototypeToken.texture ??= {};
    data.prototypeToken.texture.src = image;
  }
  if (!canImportActors()) throw new Error(localize("CannotImportActor"));
  const actor = await ActorClass.create(data, { renderSheet: false, keepId: false, keepEmbeddedIds: true });
  if (!actor) throw new Error(localize("ImportActorInvalidJSON"));
  return actor;
}
