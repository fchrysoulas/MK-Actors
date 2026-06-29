# MK Actors

A system-agnostic Foundry VTT module for v12-v13 that gives the GM a searchable visual gallery of Actor documents. You can drag an Actor card onto the active Scene to create a token, or use the crosshair button to spawn it near the current canvas view center.

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
- Open an Actor sheet from the gallery.
- GM-only action to spawn an Actor near the current canvas view center.
- Configurable included and excluded Actor type IDs.
- Client-side card size setting.

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
- The **Spawn at View Center** button imports a compendium Actor into the world first, because placed tokens need a world Actor reference.
- The module is intentionally conservative: it avoids system-specific stats, CR fields, levels, or NPC sheet assumptions.

## File structure

```text
mk-actors/
  AGENTS.md
  CHANGELOG.md
  module.json
  README.md
  lang/en.json
  scripts/main.js
  styles/gallery.css
  templates/gallery.hbs
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
