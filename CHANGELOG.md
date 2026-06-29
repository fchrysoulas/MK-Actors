# Changelog

All notable changes to MK Actors will be documented in this file.

This project follows semantic versioning where practical:

- `MAJOR` versions may include breaking compatibility or workflow changes.
- `MINOR` versions add backwards-compatible features.
- `PATCH` versions fix bugs or polish existing behavior.

## Unreleased

- Added double-click opening for Actor cards.
- Improved portrait dragging so dragging from an Actor image uses the Actor card drag data.
- Added GitHub release URLs to the source module manifest.

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
