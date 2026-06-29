# MK Actors

A system-agnostic Foundry VTT module for v12-v13 that gives the GM a searchable visual gallery of Actor documents. You can drag an Actor card onto the active Scene to create a token.

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
- Filter by source.
- Drag cards onto a Scene.
- Drag from an Actor portrait as part of the card.
- Double-click an Actor card to open its sheet.
- Right-click an Actor portrait to open a context menu for editing portrait image, token dimensions, fit mode, anchor, and scale.
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

You can open it through any of these paths:

1. Actors Directory button, when the button is injected successfully.
2. Scene controls button, when the current Foundry control structure accepts the hook.
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
- Right-clicking a gallery portrait opens a context menu with a prototype token appearance editor for that Actor. The editor sets the Actor portrait image path, token width, token height, token texture fit mode, anchor, and scale. The prototype token image path is synced from the portrait image automatically.
- The **Sync portrait to token image** setting updates an Actor's prototype token image when that Actor's portrait image changes. It does not rewrite existing Actors until their portraits are changed, and it does not update tokens already placed on Scenes.
- Enable **Debug mode** in the module settings to log MK Actors settings changes, UI actions, Actor resolution, drag actions, and portrait sync hooks to the browser console with the `MK Actors |` prefix.
- The module is intentionally conservative: it avoids system-specific stats, CR fields, levels, or NPC sheet assumptions.

## File structure

```text
mk-actors/
  AGENTS.md
  CHANGELOG.md
  module.json
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
  scripts/token-portrait-dialog.js
  styles/gallery.css
  templates/gallery.hbs
  templates/token-portrait-dialog.hbs
```

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
