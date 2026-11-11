import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { prepareRelease } from "../tools/prepare-release.mjs";

const fixtureParent = fileURLToPath(new URL("../tmp/", import.meta.url));

function fixture(t, { version = "1.2.3", notes = "- Improved the gallery." } = {}) {
  mkdirSync(fixtureParent, { recursive: true });
  const root = mkdtempSync(join(fixtureParent, "release-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const files = {
    "module.json": JSON.stringify({
      id: "mk-actors", version,
      compatibility: { minimum: "13", verified: "14", maximum: "14" },
      esmodules: ["scripts/main.js"], styles: ["styles/gallery.css"],
      languages: [{ lang: "en", path: "lang/en.json" }]
    }),
    "CHANGELOG.md": `# Changelog\n\n## Unreleased\n\n- Not yet released.\n\n## ${version} - 2026-11-11\n\n${notes}\n\n## 1.0.0 - 2026-01-01\n\n- Older changes.\n`,
    "README.md": "# MK Actors\n",
    "LICENSE": "MIT License\n",
    "THIRD_PARTY_NOTICES.md": "# Notices\n",
    "scripts/main.js": "export const ready = true;\n",
    "styles/gallery.css": ".mk-actors {}\n",
    "templates/gallery.hbs": "<div></div>\n",
    "lang/en.json": "{}\n",
    "tools/private.js": "development tooling\n",
    "tests/private.test.js": "development tests\n"
  };
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

function build(root, tag = "v1.2.3") {
  return prepareRelease({ root, tag, repository: "owner/MK-Actors" });
}

test("release staging includes runtime files and matching manifests with release-specific URLs", (t) => {
  const root = fixture(t);
  const original = readFileSync(join(root, "module.json"), "utf8");
  assert.deepEqual(build(root), { tag: "v1.2.3", id: "mk-actors", prerelease: false });
  const output = join(root, "dist");
  const manifestText = readFileSync(join(output, "module.json"), "utf8");
  assert.equal(readFileSync(join(output, "package/module.json"), "utf8"), manifestText);
  const manifest = JSON.parse(manifestText);
  assert.equal(manifest.manifest, "https://github.com/owner/MK-Actors/releases/latest/download/module.json");
  assert.equal(manifest.download, "https://github.com/owner/MK-Actors/releases/download/v1.2.3/mk-actors.zip");
  assert.deepEqual(manifest.compatibility, { minimum: "13", verified: "14", maximum: "14" });
  assert.equal(readFileSync(join(output, "release-notes.md"), "utf8"), "- Improved the gallery.\n");
  assert.deepEqual(readdirSync(join(output, "package")).sort(), [
    "CHANGELOG.md", "LICENSE", "README.md", "THIRD_PARTY_NOTICES.md", "lang", "module.json", "scripts", "styles", "templates"
  ]);
  assert.equal(readFileSync(join(root, "module.json"), "utf8"), original);
});

test("release preparation rejects a tag that differs from the manifest before staging", (t) => {
  const root = fixture(t);
  assert.throws(() => build(root, "v1.2.4"), /does not match manifest version/);
  assert.equal(existsSync(join(root, "dist")), false);
});

test("release preparation requires dated, nonempty notes for the matching version", (t) => {
  const missing = fixture(t);
  writeFileSync(join(missing, "CHANGELOG.md"), "## Unreleased\n\n- Work in progress.\n");
  assert.throws(() => build(missing), /dated CHANGELOG.md entry/);
  const empty = fixture(t, { notes: "" });
  assert.throws(() => build(empty), /has no release notes/);
});

test("prereleases use their own tag and bracketed changelog heading", (t) => {
  const root = fixture(t, { version: "1.2.3-beta.1" });
  writeFileSync(join(root, "CHANGELOG.md"), "## [v1.2.3-beta.1] - 2026-11-11\r\n\r\n- Beta changes.\r\n");
  assert.equal(build(root, "v1.2.3-beta.1").prerelease, true);
});

test("release preparation rejects invalid localization JSON and missing packaged entry points", (t) => {
  const invalidJson = fixture(t);
  writeFileSync(join(invalidJson, "lang/en.json"), "{broken}");
  assert.throws(() => build(invalidJson), SyntaxError);
  const missingFile = fixture(t);
  rmSync(join(missingFile, "scripts/main.js"));
  assert.throws(() => build(missingFile), /ENOENT/);
  assert.equal(existsSync(join(missingFile, "dist/module.json")), false);
});

test("release preparation rejects manifest paths outside the package", (t) => {
  const root = fixture(t);
  const manifest = JSON.parse(readFileSync(join(root, "module.json"), "utf8"));
  manifest.esmodules = ["../private.js"];
  writeFileSync(join(root, "module.json"), JSON.stringify(manifest));
  assert.throws(() => build(root), /must be inside the package/);
});
