import { appendFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const runtimeDirectories = ["scripts", "styles", "templates", "lang"];
const optionalDirectories = ["assets", "icons", "packs", "languages"];
const documentation = ["README.md", "CHANGELOG.md", "LICENSE", "THIRD_PARTY_NOTICES.md"];

function validateJsonDirectory(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) validateJsonDirectory(path);
    else if (entry.name.endsWith(".json")) JSON.parse(readFileSync(path, "utf8"));
  }
}

function validatePackagePath(root, path) {
  if (typeof path !== "string" || !path || path.includes("\\") || isAbsolute(path)) {
    throw new Error(`Invalid manifest file path: ${path}`);
  }
  const file = resolve(root, path);
  const relativePath = relative(root, file);
  if (relativePath.startsWith("..") || isAbsolute(relativePath) || !statSync(file).isFile()) {
    throw new Error(`Manifest file must be inside the package: ${path}`);
  }
}

export function prepareRelease({ root = process.cwd(), tag, repository }) {
  root = resolve(root);
  const manifest = JSON.parse(readFileSync(join(root, "module.json"), "utf8"));
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(manifest.id ?? "")) {
    throw new Error("The manifest must have a valid module id.");
  }
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(manifest.version ?? "")) {
    throw new Error("The manifest version must use major.minor.patch, optionally followed by a prerelease suffix.");
  }
  if (tag !== `v${manifest.version}`) {
    throw new Error(`Tag ${tag} does not match manifest version v${manifest.version}.`);
  }
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? "")) {
    throw new Error("A GitHub repository in owner/name format is required.");
  }

  const changelog = readFileSync(join(root, "CHANGELOG.md"), "utf8").split(/\r?\n/);
  const escapedVersion = manifest.version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const heading = new RegExp(`^##\\s+\\[?v?${escapedVersion}\\]?\\s+-\\s+\\d{4}-\\d{2}-\\d{2}\\s*$`);
  const start = changelog.findIndex((line) => heading.test(line));
  if (start === -1) throw new Error(`Add a dated CHANGELOG.md entry for ${manifest.version} before publishing.`);
  const end = changelog.findIndex((line, index) => index > start && /^##\s/.test(line));
  const notes = changelog.slice(start + 1, end === -1 ? undefined : end).join("\n").trim();
  if (!notes) throw new Error(`The changelog entry for ${manifest.version} has no release notes.`);

  validateJsonDirectory(join(root, "lang"));
  const output = join(root, "dist");
  const stage = join(output, "package");
  mkdirSync(output, { recursive: true });
  // Refuse to reuse staging files from an earlier build.
  mkdirSync(stage);
  for (const directory of runtimeDirectories) cpSync(join(root, directory), join(stage, directory), { recursive: true });
  for (const directory of optionalDirectories) {
    if (existsSync(join(root, directory))) cpSync(join(root, directory), join(stage, directory), { recursive: true });
  }
  for (const file of documentation) cpSync(join(root, file), join(stage, file));

  const base = `https://github.com/${repository}`;
  manifest.url = base;
  manifest.manifest = `${base}/releases/latest/download/module.json`;
  manifest.download = `${base}/releases/download/${tag}/${manifest.id}.zip`;
  const manifestJson = `${JSON.stringify(manifest, null, 2)}\n`;
  writeFileSync(join(stage, "module.json"), manifestJson);
  for (const path of [
    ...(manifest.esmodules ?? []),
    ...(manifest.styles ?? []).map((style) => typeof style === "string" ? style : style.src),
    ...(manifest.languages ?? []).map((language) => language.path)
  ]) validatePackagePath(stage, path);
  writeFileSync(join(output, "module.json"), manifestJson);
  writeFileSync(join(output, "release-notes.md"), `${notes}\n`);
  return { tag, id: manifest.id, prerelease: manifest.version.includes("-") };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const release = prepareRelease({ tag: process.argv[2], repository: process.argv[3] });
    if (process.env.GITHUB_OUTPUT) {
      appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(release).map(([key, value]) => `${key}=${value}\n`).join(""));
    }
    console.log(`Prepared ${release.tag}: dist/module.json and dist/package/`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
