# AGENTS.md

Shared instructions for AI agents working on this repository.

## Project

MK Actors is a system-agnostic Foundry VTT module for Foundry v13-v14. It provides a searchable visual gallery of Foundry `Actor` documents from the world and visible Actor compendiums. Users can drag Actor cards onto the active Scene using Foundry's standard Actor drag data.

Keep the module independent of any specific game system. Do not add assumptions for Shadowdark, D&D5e, PF2e, or any other system unless the requested change explicitly introduces optional system-specific behavior.

## Repository Structure

```text
module.json              Foundry module manifest
README.md                User-facing documentation
CHANGELOG.md             Release notes and version history
lang/en.json             English localization strings
scripts/actor-helpers.js Actor display and filtering helpers
scripts/api.js           Public module API
scripts/constants.js     Shared constants
scripts/debug.js         Debug logging helpers
scripts/documents.js     Foundry document resolution helpers
scripts/gallery-app.js   ApplicationV2 gallery implementation
scripts/hooks.js         Foundry hook callbacks
scripts/main.js          Module entry point and hook registration
scripts/settings.js      Settings and keybinding registration
scripts/shadowdark-integration.js Optional MK Shadowdark Token Shadows settings integration
scripts/file-picker.js   Foundry FilePicker compatibility resolver
scripts/token-preview.js Interactive token image preview and fitting geometry
scripts/window-drag.js  Composited window movement with Foundry position commits
styles/gallery.css       Application styling
templates/gallery.hbs    Handlebars application template
docs/UI_STYLE_RULES.md   Reusable ApplicationV2 UI design contract
```

## Foundry Compatibility

- Preserve support for Foundry VTT v13-v14 only unless the user explicitly changes the compatibility target.
- Prefer defensive code around Foundry APIs that changed between v13 and v14.
- Keep drag data compatible with Foundry's standard Actor shape:

```js
{ type: "Actor", uuid: "..." }
```

- Use Foundry document APIs such as `fromUuid` where appropriate.
- Avoid relying on private Foundry internals unless there is already a fallback path and a clear reason.

## Design Principles

- Actor documents are the only supported document type.
- The module must remain system agnostic.
- Actor type filtering should use raw type IDs such as `npc`, `monster`, `creature`, `character`, or `pc`.
- Default behavior includes all accessible Actor types, including player-character types. The type selector offers All Types and individual type IDs.
- Actor placement is handled by Foundry's normal drag-and-drop workflow, not by direct token creation helpers.
- Non-GM users may browse and drag when permissions allow it.

## Coding Style

- Use plain JavaScript modules imported from `scripts/main.js`.
- Keep constants such as `MODULE_ID` and fallback asset paths in `scripts/constants.js`.
- Keep `MKActorsApi` focused on public module actions such as opening, refreshing, and resolving Actors.
- Keep UI state inside `MKActorsApp`.
- Use `game.i18n.localize` for user-facing text from JavaScript.
- Add or update `lang/en.json` keys whenever visible UI text changes.
- Avoid broad refactors unless they are needed for the requested change.
- Keep comments concise and only where they clarify non-obvious Foundry behavior.

## Foundry VTT Dev
https://foundryvtt.wiki/en/development/getting-started-with-development

## UI And Styling

- The app is a Foundry `ApplicationV2` using `templates/gallery.hbs`.
- Follow `docs/UI_STYLE_RULES.md` for the shared card-based dark glassmorphism design contract.
- Keep CSS scoped under `.mk-actors` or `.mk-actors-app` where possible.
- Preserve draggable Actor cards and icon-only action buttons with meaningful `title` attributes.
- Maintain responsive behavior for narrow Foundry windows.
- Do not add large marketing-style UI; this is an in-game utility window.

## Verification

The repository includes a dependency-free Node test suite. For code changes, do the strongest practical verification available:

1. Run `npm test`.
2. Check JSON validity for `module.json` and localization files.
3. Review JavaScript syntax for obvious parse errors.
4. Always sync the current module files to the local Foundry installation after module changes, even when Foundry is not running. The local test module directory is `C:\Users\flasx\AppData\Local\FoundryVTT\Data\modules\mk-actors` (Foundry application: `E:\Foundry Virtual Tabletop`). Copy `module.json`, `scripts/`, `styles/`, `templates/`, `lang/`, and the module documentation; verify the copied files match the repository. Keep this directory current without asking for confirmation again, and do not modify other modules or world data.
5. If Foundry is available, enable the updated module in a world and verify:
   - The gallery opens from configured entry points.
   - World Actors and visible Actor compendiums appear.
   - Search, type filter, source filter, clear, and refresh work.
   - Actor cards drag onto a Scene.
   - Open Sheet resolves both world and compendium Actors.

If Foundry is not available, state that manual in-Foundry verification was not run.

## Documentation

When behavior changes, update `README.md` in the same change. Keep installation and compatibility notes aligned with `module.json`.

## Release Notes

When preparing a release:

- Bump `version` in `module.json`.
- Add a dated entry in `CHANGELOG.md` for the same version.
- Keep `compatibility.minimum` and `compatibility.verified` accurate.
- Fill in `url`, `manifest`, and `download` only when real release URLs exist.
- Do not invent hosting or package URLs.

# Changelog

All notable changes to MK Actors will be documented in this file.

This project follows semantic versioning where practical:

- `MAJOR` versions may include breaking compatibility or workflow changes.
- `MINOR` versions add backwards-compatible features.
- `PATCH` versions fix bugs or polish existing behavior.
