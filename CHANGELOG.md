

# Changelog

All notable changes to MK Actors will be documented in this file.

This project follows semantic versioning where practical:

- `MAJOR` versions may include breaking compatibility or workflow changes.
- `MINOR` versions add backwards-compatible features.
- `PATCH` versions fix bugs or polish existing behavior.

## Unreleased

- Migrated the gallery and settings launcher from legacy Application classes to Foundry ApplicationV2.
- Moved the prototype token appearance dialog markup into a Handlebars template and compacted the image browse button.

## 0.2.0

- Added double-click opening for Actor cards.
- Improved portrait dragging so dragging from an Actor image uses the Actor card drag data.
- Added GitHub release URLs to the source module manifest.
- Added a world setting to sync Actor portrait changes to prototype token images.
- Added a client debug mode setting that logs module settings changes, UI actions, Foundry document calls, token spawning, and portrait sync hooks.
- Fixed portrait-to-token-image sync to apply after Actor updates when needed.
- Fixed the settings menu launcher to use a valid FormApplication type.
- Added a right-click portrait context menu for portrait image, prototype token dimensions, fit mode, anchor, and scale.

## 0.1.1

- Added shared repository instructions in `AGENTS.md`.
- Added this changelog and versioning notes.
- Added a repository `.gitignore` for local tooling and release artifacts.
- Fixed release note extraction for titled changelog version headings.
- Clarified spawn wording to match view-center behavior.
- Localized remaining gallery summary text.
- Hid the direct spawn button for non-GM users.

## 0.1.0

- Added a system-agnostic Foundry VTT v12-v13 Actor gallery.
- Added support for browsing world Actors.
- Added support for browsing visible Actor compendiums.
- Added search by Actor name, type, source, and compendium ID.
- Added Actor type and source filters.
- Added draggable Actor cards using Foundry's standard Actor drag data.
- Added Actor sheet opening from gallery cards.
- Added GM-only spawn near the current canvas view center.
- Added configurable included and excluded Actor type IDs.
- Added client-side card size setting.
- Added English localization.
