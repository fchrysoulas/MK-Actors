# Changelog

All notable changes to MK Actors will be documented in this file.

This project follows semantic versioning where practical:

- `MAJOR` versions may include breaking compatibility or workflow changes.
- `MINOR` versions add backwards-compatible features.
- `PATCH` versions fix bugs or polish existing behavior.

## Unreleased

## 0.5.0 - 2026-11-11

- Replaced the local PowerShell release script with a GitHub Actions workflow that validates, packages, and publishes version tags, with manual draft publishing available.
- Restricted Foundry VTT compatibility to v13-v14 only.
- Added a Name field to Actor Editor that updates the Actor and prototype token names together on Save and Close.
- Added a star button to Actor cards and a Favorites group in Sources, matching MK Scene Gallery. Favorites persist on the current client, work with search and type filters, and remain available in the collapsed Sources rail.
- Fixed the manifest license link to point to the bundled license file.

## 0.4.0 - 2026-10-29

- Restyled the gallery and Actor Editor to match MK Scene Gallery's compact dark surfaces and amber controls, including aligned Sources and search headers.
- Added a compact Sources icon rail with a smaller collapse button, accessible source labels, and preserved filtering and session state.
- Included all accessible Actor types by default, including player-character types, and removed the separate included/excluded type settings. The selector offers All Types and every available raw type ID.
- Renamed the appearance popup to Actor Editor and added an interactive token preview. Drag the image to set its anchors, and use the corner handle, mouse wheel, or keyboard to adjust scale.
- Replaced Apply with Save and Close, which closes the editor after a successful update and keeps it open when an update fails.
- Reduced browsing and preview work by caching folder paths and filter options and batching visual preview updates to animation frames.
- Improved resizing and window movement by avoiding full-window blur and geometry easing, skipping offscreen card painting, and committing title-bar movement once on release. Escape cancels a move, and native header controls and minimize/restore remain available.
- Moved prototype token appearance editing to a separate, resizable popup opened only by right-clicking an Actor card. Repeated right-clicks focus the Actor's existing popup.
- Prevented in-flight compendium loads from overwriting refreshed gallery results or reporting outdated source warnings, and shared concurrent index requests.
- Preserved the gallery scroll position when loading more Actor cards.
- Handled failed Actor lookups without interrupting the gallery render or leaving sheet actions rejected.
- Restricted portrait-to-token-image sync follow-ups to the user who initiated the Actor update.
- Included third-party notices in the Foundry release archive.

## 0.3.0 - 2026-07-29

- Added a left source tree that filters by all sources, World folders, unfiled World actors, and Actor compendiums.
- Simplified Actor cards to square 1:1 portrait previews with name-only metadata.
- Restyled the gallery and inline prototype token editor with a card-based dark glassmorphism ApplicationV2 interface.
- Kept the gallery's vertical scrollbar visible to prevent layout shifts between result sets.
- Improved Actor Directory and Scene Controls button injection across Foundry v12-v13 control layouts, including the ordered v13 tool shape.
- Kept all gallery launch paths available to non-GM users while filtering world Actors by Foundry visibility permissions.
- Restricted prototype token appearance editing to users who can update the selected Actor.
- Prevented settings and document refreshes from opening a closed gallery.
- Added automatic cache invalidation for Actor, Actor folder, and compendium changes.
- Loaded compendium indexes concurrently and rendered large Actor result sets in batches.
- Moved prototype token appearance editing into a validated right-side gallery inspector opened by left-clicking an Actor portrait.
- Preserved the selected Actor card's visual scroll position when opening, applying, or closing the inline inspector.
- Fixed image browsing in the inline prototype token editor on Foundry v12 while preserving the v13 FilePicker path.
- Localized unnamed Actor fallbacks and added accessible labels and keyboard portrait selection.
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
