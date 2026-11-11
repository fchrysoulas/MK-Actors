# MK Actors

A system-agnostic Foundry VTT module for v13-v14 that provides a searchable visual gallery of Actor documents. GMs and players can browse Actors they are allowed to see and drag Actor cards onto the active Scene.

## Compatibility

- Foundry VTT: v13-v14 only
- Systems: system agnostic
- Documents used: Foundry `Actor` documents only
- No Shadowdark, D&D5e, PF2e, or other system dependency

The module uses Foundry's standard Actor drag data shape, `{ type: "Actor", uuid: "..." }`, so the Scene handles the drop the same way it handles Actors dragged from the sidebar or a compendium.

## Features

- Browse world Actors.
- Browse visible Actor compendiums.
- Search by name, Actor type, source, or compendium ID.
- Filter by any Actor type found in accessible sources, including player-character types, or select All Types.
- Filter by source from a left tree view with World folders, unfiled World actors, and Actor compendiums.
- Star an Actor card to add it to **Favorites**, then select **Favorites** in Sources to browse starred world and compendium Actors together. Click its star again to remove it. Favorites stay saved on this Foundry client after reopening or reloading and work with search, type filtering, and the collapsed Sources rail.
- Collapse the Sources sidebar to a compact icon rail using its small header toggle to give Actor cards more room. Hover over an icon to see the source name. Source filtering and the selected-source highlight remain available, and the sidebar keeps its state while browsing, refreshing, or reopening the gallery during the current session.
- The compact Sources header aligns with the search header at MK Scene Gallery's height, fills the sidebar width, and stays in place while the source list scrolls.
- Render large result sets in batches while loading Actor compendium indexes concurrently.
- Reuse folder paths and type/source options while browsing cached Actors, and batch Actor Editor preview redraws to the display's animation frames.
- Keep the current gallery scroll position when loading more Actor cards.
- Show each Actor as a square 1:1 portrait card with only its name as visible metadata.
- Use MK Scene Gallery's dark glass and amber styling, with a joined Sources sidebar, compact action bar, and a search header showing the selected source. Result counts stay in the footer.
- Show portraits inside inset square frames without stretching or cropping them; Open Sheet sits in each card's top-right corner.
- Use the same amber controls and token preview styling in Actor Editor.
- Keep window movement and resizing responsive by isolating each window's rendering, avoiding blur over the Scene, skipping offscreen card painting, and simplifying effects while the title bar or resize handle is held. Window geometry follows the pointer without theme easing.
- Move the gallery and Actor Editor without recalculating their layout on every drag frame. Their final positions are committed when the title bar is released; Escape cancels a move.
- Keep the gallery's vertical scrollbar visible so card columns do not shift as results change.
- Drag cards onto a Scene.
- Drag from an Actor portrait as part of the card.
- Double-click an Actor card to open its sheet.
- Right-click an Actor card to open the **Actor Editor**, a separate, movable, resizable popup for its portrait image, token dimensions, fit mode, anchor, and scale.
- Edit **Name** in Actor Editor to update the Actor name and prototype token name together when you click **Save and Close**.
- Position the image visually in the Actor Editor's token preview: drag it to set the anchors, and drag its corner handle or use the mouse wheel to set the scale ratio. Numeric controls stay in sync. Arrow keys move the image; plus and minus adjust scale. Click **Save and Close** to save the changes and close the editor. If saving fails, the editor stays open so you can retry.
- Keep the gallery at its current scroll position when the editor opens, applies changes, or closes. Left-clicking does not open the editor.
- Open an Actor sheet from the gallery.
- Client-side card size setting.
- Client-side debug mode for tracing module actions in the browser console.
- World setting to sync Actor portrait changes to prototype token images.
- Standalone token shadows with GM controls for size, offset, opacity, and blur, available from the gallery toolbar, Actor Editor, and MK Actors module settings. Works with every game system without additional modules.

## System-agnostic filtering

Foundry systems use different Actor type IDs. Examples:

- `npc`
- `monster`
- `creature`
- `character`
- `pc`

The gallery opens with **All Types**, showing every accessible Actor type, including player-character types. The type selector lists every type found in enabled world and compendium sources. Select a specific type to show its Actors, or **All Types** to show every type again. Search and source filters still apply, and source settings and permissions are respected.

**Clear** restores All Types and clears search and source filters. Actor type filtering is controlled directly by the selector; separate included and excluded type settings are no longer used.

## Token shadows

GMs can open **Token shadows** using the half-circle button at the start of the gallery toolbar, Actor Editor's sliders button, or **Configure Settings > Module Settings > MK Actors > Configure token shadows**. Turn on **Enable token shadows**, adjust size, vertical offset, opacity, blur strength, and blur quality, then click **Save and Close**. Shadows are off by default.

MK Actors draws the shadows itself and stores its own world settings. No other module or particular game system is required. Settings affect all Scene tokens, including existing tokens and new Actor drops, and update every viewing client. They save independently of Actor Editor. Shadows follow token movement and resizing and are removed when disabled, when tokens are deleted, or when the Scene is torn down. Actor documents and token textures are unchanged.

If MK Shadowdark is also active with its own Token Shadows enabled, MK Actors yields to that renderer to avoid overlapping shadows. Turn off MK Shadowdark's Token Shadows option to use MK Actors' appearance settings. The two modules keep separate preferences.

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

Install or update through Foundry's module installer using this manifest URL:

```text
https://github.com/fchrysoulas/MK-Actors/releases/latest/download/module.json
```

The module supports Foundry VTT v13-v14 only.

For a manual installation:

Copy the `mk-actors` folder into:

```text
FoundryVTT/Data/modules/
```

Then restart Foundry, enable **MK Actors** in your world, and open the gallery.

## Notes

- Dragging a compendium Actor onto a Scene follows Foundry's normal Actor drop behavior.
- World Actors are shown to non-GM users only when they have at least Limited permission. Compendiums follow Foundry's pack visibility.
- Right-clicking an Actor card opens the **Actor Editor** when the user can update that Actor. Right-clicking the same Actor again brings its existing popup to the front. The editor validates token dimensions, fit mode, anchor, and scale. The prototype token image path is synced from the portrait image automatically.
- The gallery cache refreshes after Actor, Actor folder, or compendium changes. The Refresh button remains available for external changes which do not emit a Foundry document hook.
- Preview anchor and scale fields update immediately during gestures, while visual redraws are batched. Closing the Actor Editor cancels pending preview redraws.
- Refreshing while compendium indexes are loading discards outdated results and warnings. Concurrent gallery loads share the current index requests.
- If an Actor source becomes unavailable, sheet and editor actions show a resolution warning. Saving a popup for an unavailable Actor closes it. `MKActors.resolveActor(uuid)` returns `null` when lookup fails.
- The **Sync portrait to token image** setting updates an Actor's prototype token image when that Actor's portrait image changes. It does not rewrite existing Actors until their portraits are changed, and it does not update tokens already placed on Scenes.
- Any portrait-sync follow-up update runs only on the client that initiated the Actor change, avoiding duplicate requests from other connected users.
- Enable **Debug mode** in the module settings to log MK Actors settings changes, UI actions, Actor resolution, drag actions, and portrait sync hooks to the browser console with the `MK Actors |` prefix.
- The module is intentionally conservative: it avoids system-specific stats, CR fields, levels, or NPC sheet assumptions.

## Repository structure

```text
mk-actors/
  .github/workflows/release.yml
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
  scripts/token-shadow-controls.js
  scripts/token-shadow-settings.js
  scripts/token-shadows.js
  scripts/file-picker.js
  scripts/token-portrait-editor.js
  scripts/token-preview.js
  scripts/window-drag.js
  styles/gallery.css
  templates/gallery.hbs
  templates/token-portrait-editor.hbs
  templates/token-shadow-settings.hbs
  tests/module.test.js
  tests/release.test.js
  tests/token-shadow-controls.test.js
  tests/token-shadows.test.js
  tools/prepare-release.mjs
  docs/UI_STYLE_RULES.md
```

## Development

Run the dependency-free Node test suite with:

```text
npm test
```

## Publishing a release

GitHub Actions builds and publishes the Foundry release assets; no local PowerShell release script is needed.

1. Update `version` in `module.json` and add a dated entry for the same version in `CHANGELOG.md`, moving the relevant Unreleased notes into it.
2. Verify the module in Foundry v13 and v14, run `npm test`, and commit and push the release changes, including the release workflow.
3. Create and push a matching version tag. For example, after setting the version to `0.5.0`:

   ```text
   git tag v0.5.0
   git push origin v0.5.0
   ```

The **Publish Foundry module** workflow checks out that tag, runs the tests and syntax checks, validates localization JSON and packaged manifest paths, and requires matching version and dated changelog entries. It packages the runtime files and module documentation, then creates a GitHub release containing `module.json` and `mk-actors.zip`. The packaged manifest gets download URLs for that repository and tag automatically. Foundry's existing latest-manifest installation URL stays the same.

To publish an existing tag manually, open **Actions > Publish Foundry module > Run workflow**, enter the tag, and optionally select **Create a draft release for review**. Tags with a prerelease suffix, such as `v0.5.0-beta.1`, are marked as prereleases. Existing releases are not overwritten. Publishing uses GitHub's automatic `GITHUB_TOKEN` with `contents: write`; no personal access token is required.

## License

MK Actors is released under the MIT License. See `LICENSE`.

## Version history

See `CHANGELOG.md` for release notes and versioning guidance.

## Suggested next upgrades

- Encounter tray before dropping.
- Tagging by folder or custom flags.
- Pack whitelist / blacklist.
- Random encounter roll table integration.
- Drag multiple selected actors as an encounter group.
- Scene drop preview with token footprint.
