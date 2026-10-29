# MK Actors

A system-agnostic Foundry VTT module for v12-v13 that provides a searchable visual gallery of Actor documents. GMs and players can browse Actors they are allowed to see and drag Actor cards onto the active Scene.

## Compatibility

- Foundry VTT: v12-v13
- Systems: system agnostic
- Documents used: Foundry `Actor` documents only
- No Shadowdark, D&D5e, PF2e, or other system dependency

The module uses Foundry's standard Actor drag data shape, `{ type: "Actor", uuid: "..." }`, so the Scene handles the drop the same way it handles Actors dragged from the sidebar or a compendium.

## Features

- Browse world Actors.
- Browse visible Actor compendiums.
- Search by name, Actor type, source, or compendium ID.
- Filter by Actor type.
- Filter by source from a left tree view with World folders, unfiled World actors, and Actor compendiums.
- Render large result sets in batches while loading Actor compendium indexes concurrently.
- Keep the current gallery scroll position when loading more Actor cards.
- Show each Actor as a square 1:1 portrait card with only its name as visible metadata.
- Use a card-based dark glassmorphism interface tailored to Foundry ApplicationV2.
- Keep the gallery's vertical scrollbar visible so card columns do not shift as results change.
- Drag cards onto a Scene.
- Drag from an Actor portrait as part of the card.
- Double-click an Actor card to open its sheet.
- Right-click an Actor card to edit its portrait image, token dimensions, fit mode, anchor, and scale in a separate, movable, resizable popup window.
- Keep the gallery at its current scroll position when the editor opens, applies changes, or closes. Left-clicking does not open the editor.
- Open an Actor sheet from the gallery.
- Configurable included and excluded Actor type IDs.
- Client-side card size setting.
- Client-side debug mode for tracing module actions in the browser console.
- World setting to sync Actor portrait changes to prototype token images.

## System-agnostic filtering

Foundry systems use different Actor type IDs. Examples:

- `npc`
- `monster`
- `creature`
- `character`
- `pc`

By default, this module includes all Actor types except common player-character type IDs:

```text
character,pc,player
```

To hard-limit the gallery to a specific system's NPC/monster types, go to:

```text
Configure Settings > Module Settings > MK Actors > Included actor types
```

Then enter a comma-separated list such as:

```text
npc,monster,creature
```

Leave the field empty to include all Actor types.

## How to open the gallery

Users can open it through any of these paths:

1. Actors Directory button, when the button is injected successfully.
2. Scene controls button on the Token controls.
3. Configure Settings > Module Settings > MK Actors > Open Actors Gallery.
4. Keybinding: `Ctrl + Shift + G` by default.
5. Macro or console:

```js
game.modules.get("mk-actors").api.open();
```

or:

```js
MKActors.open();
```

## Installation

Copy the `mk-actors` folder into:

```text
FoundryVTT/Data/modules/
```

Then restart Foundry, enable **MK Actors** in your world, and open the gallery.

## Notes

- Dragging a compendium Actor onto a Scene follows Foundry's normal Actor drop behavior.
- World Actors are shown to non-GM users only when they have at least Limited permission. Compendiums follow Foundry's pack visibility.
- Right-clicking an Actor card opens the prototype token appearance popup when the user can update that Actor. Right-clicking the same Actor again brings its existing popup to the front. The editor validates token dimensions, fit mode, anchor, and scale. The prototype token image path is synced from the portrait image automatically.
- The gallery cache refreshes after Actor, Actor folder, or compendium changes. The Refresh button remains available for external changes which do not emit a Foundry document hook.
- Refreshing while compendium indexes are loading discards outdated results and warnings. Concurrent gallery loads share the current index requests.
- If an Actor source becomes unavailable, sheet and editor actions show a resolution warning. Saving a popup for an unavailable Actor closes it. `MKActors.resolveActor(uuid)` returns `null` when lookup fails.
- The **Sync portrait to token image** setting updates an Actor's prototype token image when that Actor's portrait image changes. It does not rewrite existing Actors until their portraits are changed, and it does not update tokens already placed on Scenes.
- Any portrait-sync follow-up update runs only on the client that initiated the Actor change, avoiding duplicate requests from other connected users.
- Enable **Debug mode** in the module settings to log MK Actors settings changes, UI actions, Actor resolution, drag actions, and portrait sync hooks to the browser console with the `MK Actors |` prefix.
- The module is intentionally conservative: it avoids system-specific stats, CR fields, levels, or NPC sheet assumptions.

## Repository structure

```text
mk-actors/
  AGENTS.md
  CHANGELOG.md
  LICENSE
  module.json
  package.json
  README.md
  lang/en.json
  scripts/actor-helpers.js
  scripts/api.js
  scripts/constants.js
  scripts/debug.js
  scripts/documents.js
  scripts/gallery-app.js
  scripts/hooks.js
  scripts/main.js
  scripts/settings.js
  scripts/file-picker.js
  scripts/token-portrait-editor.js
  styles/gallery.css
  templates/gallery.hbs
  templates/token-portrait-editor.hbs
  tests/module.test.js
  docs/UI_STYLE_RULES.md
```

## Development

Run the dependency-free Node test suite with:

```text
npm test
```

## License

MK Actors is released under the MIT License. See `LICENSE`.

## Version history

See `CHANGELOG.md` for release notes and versioning guidance.

## Suggested next upgrades

- Favorites / pinned creatures.
- Encounter tray before dropping.
- Tagging by folder or custom flags.
- Pack whitelist / blacklist.
- Random encounter roll table integration.
- Drag multiple selected actors as an encounter group.
- Scene drop preview with token footprint.
