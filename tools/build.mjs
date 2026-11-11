import { existsSync, lstatSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { prepareRelease } from "./prepare-release.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit", windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed with exit code ${result.status}.`);
}

function checkSyntax(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) checkSyntax(path);
    else if (/\.m?js$/.test(entry.name)) run(process.execPath, ["--check", path]);
  }
}

try {
  const manifest = JSON.parse(readFileSync(join(root, "module.json"), "utf8"));
  const repositoryUrl = new URL(manifest.url);
  if (manifest.id !== "mk-actors" || repositoryUrl.hostname !== "github.com") {
    throw new Error("Expected the MK Actors manifest and GitHub repository URL.");
  }
  run(process.execPath, ["--test"]);
  checkSyntax(join(root, "scripts"));
  checkSyntax(join(root, "tools"));

  const stage = resolve(root, "dist/package");
  if (relative(root, stage).replaceAll("\\", "/") !== "dist/package"
    || (existsSync(stage) && lstatSync(stage).isSymbolicLink())) {
    throw new Error("Release staging must be a directory inside the workspace.");
  }
  rmSync(stage, { recursive: true, force: true });
  const release = prepareRelease({
    root, tag: `v${manifest.version}`, repository: repositoryUrl.pathname.replace(/^\/|\/$/g, "")
  });
  if (process.platform === "win32") {
    run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
      "$ErrorActionPreference = 'Stop'; Compress-Archive -Path 'dist/package/*' -DestinationPath 'dist/mk-actors.zip' -Force"]);
  } else {
    const archive = join(root, "dist/mk-actors.zip");
    rmSync(archive, { force: true });
    run("zip", ["-q", "-r", archive, "."], stage);
  }
  console.log(`Built ${release.tag}: dist/mk-actors.zip and dist/module.json`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
