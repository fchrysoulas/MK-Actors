# Changelog

All notable changes to MK Actors will be documented in this file.

This project follows semantic versioning where practical:

- `MAJOR` versions may include breaking compatibility or workflow changes.
- `MINOR` versions add backwards-compatible features.
- `PATCH` versions fix bugs or polish existing behavior.

## Unreleased

- Added a left source tree that filters by all sources, World folders, unfiled World actors, and Actor compendiums.
- Simplified Actor cards to square 1:1 portrait previews with name-only metadata.
- Kept the gallery's vertical scrollbar visible to prevent layout shifts between result sets.
- Improved Actor Directory and Scene Controls button injection across Foundry v12-v13 control layouts, including the ordered v13 tool shape.
- Kept all gallery launch paths available to non-GM users while filtering world Actors by Foundry visibility permissions.
- Restricted prototype token appearance editing to users who can update the selected Actor.
- Prevented settings and document refreshes from opening a closed gallery.
- Added automatic cache invalidation for Actor, Actor folder, and compendium changes.
- Loaded compendium indexes concurrently and rendered large Actor result sets in batches.
- Migrated the prototype token appearance editor to DialogV2 and added validation, bounds, and appropriate rounding for token values.
- Localized unnamed Actor fallbacks and added accessible labels and keyboard portrait editing.
- Added the MIT license text and a dependency-free Node test suite.

## 0.2.1

- Migrated the gallery and settings launcher from legacy Application classes to Foundry ApplicationV2.
- Moved the prototype token appearance dialog markup into a Handlebars template and compacted the image browse button.
- Removed the direct spawn-at-view-center action and related API helpers.
- Split the module JavaScript into focused files for API, settings, hooks, gallery UI, dialog logic, helpers, and constants.

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
