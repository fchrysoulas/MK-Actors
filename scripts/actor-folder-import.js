import { canImportActors, importActor, parseActorImport } from "./actor-import.js";
import { resolveFilePickerClass } from "./file-picker.js";
import { localize } from "./utils.js";

const IMAGE_EXTENSIONS = new Set(["apng", "avif", "bmp", "gif", "jpeg", "jpg", "png", "svg", "tiff", "webp"]);
const IMAGE_FIELDS = new Set(["img", "image", "icon", "src"]);
const REMOTE_IMAGE = /^(?:https?:|data:|blob:|\/\/)/i;

function normalizePath(path) {
  return String(path).replaceAll("\\", "/").split("/").filter((part) => part && part !== ".").join("/");
}

function decodePath(path) {
  try { return decodeURIComponent(path); } catch (_error) { return path; }
}

export function validateUploadFolder(path) {
  const normalized = normalizePath(path.trim());
  const decoded = decodePath(path.trim());
  if (!normalized || /^[\\/]/.test(decoded) || /[:?#]/.test(decodePath(normalized))
    || normalizePath(decoded).split("/").includes("..")) {
    throw new Error(localize("ImportFolderInvalidDestination"));
  }
  return normalized;
}

export function defaultUploadFolder() {
  return game.world?.id ? `worlds/${game.world.id}/mk-actors-imports` : "mk-actors-imports";
}

export function canUploadActorImages() {
  return game.user?.isGM === true || game.user?.can?.("FILES_UPLOAD") === true;
}

export async function prepareActorFolderImport(files) {
  const plan = { actors: [], images: [], invalid: [], ignored: 0, uploaded: 0, imported: 0, target: null, directories: new Set() };
  const sorted = Array.from(files).sort((a, b) => (a.webkitRelativePath || a.name).localeCompare(b.webkitRelativePath || b.name));
  for (const file of sorted) {
    const path = file.webkitRelativePath || file.name;
    // File paths come from the local directory picker, never from the Actor export.
    if (normalizePath(path).split("/").includes("..") || /[:]/.test(path) || /^[\\/]/.test(path)) {
      plan.invalid.push({ path, error: localize("ImportFolderInvalidPath") });
      continue;
    }
    const entry = { file, path: normalizePath(path), error: null };
    const extension = file.name.split(".").pop().toLowerCase();
    if (extension === "json") {
      try {
        entry.source = parseActorImport(await file.text());
        plan.actors.push(entry);
      } catch (error) {
        plan.invalid.push({ path: entry.path, error: error.message });
      }
    } else if (IMAGE_EXTENSIONS.has(extension)) plan.images.push(entry);
    else plan.ignored += 1;
  }
  return plan;
}

function addIndex(index, key, image) {
  key = key.toLowerCase();
  if (!index.has(key)) index.set(key, new Set());
  index.get(key).add(image);
}

export function createFolderImageResolver(images) {
  const exact = new Map();
  const suffixes = new Map();
  for (const image of images) {
    addIndex(exact, image.path, image);
    const parts = image.path.split("/");
    for (let i = 0; i < parts.length; i++) addIndex(suffixes, parts.slice(i).join("/"), image);
  }
  const unique = (matches) => matches?.size === 1 ? matches.values().next().value : null;
  return (reference, jsonPath) => {
    if (typeof reference !== "string" || !reference || REMOTE_IMAGE.test(reference)) return {};
    const path = normalizePath(decodePath(reference.split(/[?#]/)[0])).toLowerCase();
    const relative = jsonPath.split("/").slice(0, -1);
    for (const part of path.split("/")) {
      if (part === "..") relative.pop();
      else relative.push(part);
    }
    const direct = exact.get(relative.join("/").toLowerCase()) ?? exact.get(path) ?? suffixes.get(path);
    if (direct) return { image: unique(direct), ambiguous: direct.size > 1 };
    // Old Foundry paths may include a world, module, or absolute local prefix.
    const parts = path.split("/");
    for (let i = 1; i < parts.length; i++) {
      const matches = suffixes.get(parts.slice(i).join("/"));
      if (matches) return { image: unique(matches), ambiguous: matches.size > 1 };
    }
    return {};
  };
}

export function remapFolderActorImages(entry, resolveImage, { requireUploaded = false } = {}) {
  const source = structuredClone(entry.source);
  const warnings = new Set();
  const replacements = new Map();
  const find = (reference) => {
    const result = resolveImage(reference, entry.path);
    if (result.ambiguous) warnings.add(reference);
    return result.image;
  };
  const replace = (object) => {
    if (!object || typeof object !== "object") return;
    for (const [key, value] of Object.entries(object)) {
      if (typeof value === "object") replace(value);
      else if (IMAGE_FIELDS.has(key) && typeof value === "string") {
        const image = find(value);
        if (!image) continue;
        replacements.set(image.path, image);
        if (image.uploadedPath) object[key] = image.uploadedPath;
      }
    }
  };
  replace(source);
  // A sibling image named like the JSON is also useful for hand-made exports.
  const portrait = entry.source.img;
  const token = entry.source.prototypeToken?.texture?.src;
  if (!find(portrait) && !find(token) && !warnings.has(portrait) && !warnings.has(token)
    && !REMOTE_IMAGE.test(portrait ?? "") && !REMOTE_IMAGE.test(token ?? "")) {
    const stem = entry.path.replace(/\.json$/i, "");
    const matches = new Set();
    for (const extension of IMAGE_EXTENSIONS) {
      const image = find(`${stem}.${extension}`);
      if (image) matches.add(image);
    }
    if (matches.size === 1) {
      const image = matches.values().next().value;
      replacements.set(image.path, image);
      if (image.uploadedPath) {
        source.img = image.uploadedPath;
        source.prototypeToken ??= {};
        source.prototypeToken.texture ??= {};
        source.prototypeToken.texture.src = image.uploadedPath;
      }
    } else if (matches.size > 1) warnings.add(stem);
  }
  if (requireUploaded) {
    const missing = Array.from(replacements.values()).find((image) => !image.uploadedPath);
    if (missing) throw new Error(game.i18n.format("MKACTORS.ImportFolderImageFailed", { path: missing.path }));
  }
  return { source, warnings: Array.from(warnings) };
}

async function ensureDirectory(FilePickerClass, target, directories) {
  let parent = "";
  for (const part of target.split("/")) {
    const path = parent ? `${parent}/${part}` : part;
    if (!directories.has(path)) {
      const listing = await FilePickerClass.browse("data", parent);
      if (!(listing.dirs ?? []).some((dir) => normalizePath(decodePath(dir)) === path)) {
        await FilePickerClass.createDirectory("data", path);
      }
      directories.add(path);
    }
    parent = path;
  }
}

export async function importActorFolder(plan, { destination = defaultUploadFolder(), onProgress = () => {} } = {}) {
  if (!canImportActors()) throw new Error(localize("CannotImportActor"));
  const FilePickerClass = resolveFilePickerClass();
  if (plan.images.some((image) => !image.uploadedPath)) {
    if (!canUploadActorImages()) throw new Error(localize("ImportFolderCannotUpload"));
    if (!FilePickerClass?.upload || !FilePickerClass.browse || !FilePickerClass.createDirectory) {
      throw new Error(localize("FilePickerUnavailable"));
    }
    const folder = validateUploadFolder(destination);
    // A new directory per batch avoids replacing artwork used by existing Actors.
    if (!plan.target || (plan.uploaded === 0 && plan.destination !== folder)) {
      const batchId = globalThis.crypto?.randomUUID?.() ?? globalThis.foundry?.utils?.randomID?.()
        ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      plan.target = `${folder}/import-${batchId}`;
      plan.destination = folder;
      plan.directories.clear();
    }
  }
  for (const image of plan.images) {
    if (image.uploadedPath) continue;
    image.error = null;
    try {
      if (!canUploadActorImages()) throw new Error(localize("ImportFolderCannotUpload"));
      const directory = `${plan.target}/${image.path.split("/").slice(0, -1).join("/")}`.replace(/\/$/, "");
      await ensureDirectory(FilePickerClass, directory, plan.directories);
      const result = await FilePickerClass.upload("data", directory, image.file, {}, { notify: false });
      if (!result?.path) throw new Error(localize("ImportFolderUploadFailed"));
      image.uploadedPath = result.path;
      plan.uploaded += 1;
    } catch (error) {
      image.error = error.message;
    }
    onProgress(image);
  }
  const resolver = createFolderImageResolver(plan.images);
  for (const entry of plan.actors) {
    if (entry.actor) continue;
    entry.error = null;
    try {
      const { source } = remapFolderActorImages(entry, resolver, { requireUploaded: true });
      entry.actor = await importActor(source);
      plan.imported += 1;
    } catch (error) {
      entry.error = error.message;
    }
    onProgress(entry);
  }
  return plan;
}
