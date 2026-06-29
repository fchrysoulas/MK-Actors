# AGENTS.md

Shared instructions for AI agents working on this repository.

## Project

MK Actors is a system-agnostic Foundry VTT module for Foundry v12-v13. It provides a searchable visual gallery of Foundry `Actor` documents from the world and visible Actor compendiums. Users can drag Actor cards onto the active Scene or, as a GM, spawn an Actor token at the Scene center.

Keep the module independent of any specific game system. Do not add assumptions for Shadowdark, D&D5e, PF2e, or any other system unless the requested change explicitly introduces optional system-specific behavior.

## Repository Structure

```text
module.json              Foundry module manifest
README.md                User-facing documentation
CHANGELOG.md             Release notes and version history
lang/en.json             English localization strings
scripts/main.js          Module logic and Foundry hook registration
styles/gallery.css       Application styling
templates/gallery.hbs    Handlebars application template
```

## Foundry Compatibility

- Preserve support for Foundry VTT v12-v13 unless the user explicitly changes the compatibility target.
- Prefer defensive code around Foundry APIs that changed between v12 and v13.
- Keep drag data compatible with Foundry's standard Actor shape:

```js
{ type: "Actor", uuid: "..." }
```

- Use Foundry document APIs such as `fromUuid`, `Actor.create`, `actor.getTokenDocument`, and `canvas.scene.createEmbeddedDocuments` where appropriate.
- Avoid relying on private Foundry internals unless there is already a fallback path and a clear reason.

## Design Principles

- Actor documents are the only supported document type.
- The module must remain system agnostic.
- Actor type filtering should use raw type IDs such as `npc`, `monster`, `creature`, `character`, or `pc`.
- Default behavior should include all Actor types except common player-character type IDs.
- Compendium Actors must be imported to a world Actor before direct token creation.
- Non-GM users may browse and drag when permissions allow it, but direct spawn actions must stay GM-gated.

## Coding Style

- Use plain JavaScript modules loaded through `module.json` `esmodules`.
- Keep constants such as `MODULE_ID` and fallback asset paths near the top of `scripts/main.js`.
- Prefer small static helpers on `MKActorsApi` for reusable Foundry-facing behavior.
- Keep UI state inside `MKActorsApp`.
- Use `game.i18n.localize` for user-facing text from JavaScript.
- Add or update `lang/en.json` keys whenever visible UI text changes.
- Avoid broad refactors unless they are needed for the requested change.
- Keep comments concise and only where they clarify non-obvious Foundry behavior.

## Foundry VTT Dev
https://foundryvtt.wiki/en/development/getting-started-with-development

## UI And Styling

- The app is a Foundry `Application` using `templates/gallery.hbs`.
- Keep CSS scoped under `.mk-actors` or `.mk-actors-app` where possible.
- Preserve draggable Actor cards and icon-only action buttons with meaningful `title` attributes.
- Maintain responsive behavior for narrow Foundry windows.
- Do not add large marketing-style UI; this is an in-game utility window.

## Verification

There is no automated test suite in this repository at the moment. For code changes, do the strongest practical verification available:

1. Check JSON validity for `module.json` and localization files.
2. Review JavaScript syntax for obvious parse errors.
3. If Foundry is available, install or symlink the module into `FoundryVTT/Data/modules/mk-actors`, enable it in a world, and verify:
   - The gallery opens from configured entry points.
   - World Actors and visible Actor compendiums appear.
   - Search, type filter, source filter, clear, and refresh work.
   - Actor cards drag onto a Scene.
   - Open Sheet resolves both world and compendium Actors.
   - Spawn at Scene Center works for a GM and warns non-GM users.

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
