# MK Actors UI Style Rules

These rules define the visual language for MK Actors. The target is a compact,
card-based dark glass interface that feels native to a Foundry VTT
`ApplicationV2`, using MK Scene Gallery as the local family reference.

This is a design contract, not a requirement to copy selectors or markup from
the reference module. MK Actors remains system agnostic and must preserve its
gallery behavior.

## Reference Basis

The rules were derived from:

- Sibling reference `../MK-Scene-Gallery/styles/gallery.css`
  - Scoped design tokens on the ApplicationV2 root.
  - Layered translucent surfaces and restrained gradients.
  - Compact controls, accent-led state changes, card borders, and shadows.
  - Stable scroll gutters and container-query responsive layouts.
- Sibling reference `../MK-Scene-Gallery/templates/gallery.hbs`
  - Shell, command bar, card collection, empty state, and footer structure.
  - Icon-only secondary actions with descriptive `title` attributes.
- Sibling reference `../MK-Scene-Gallery/scripts/app.js`
  - Stable ApplicationV2 `id` and `classes` used as styling boundaries.
  - Resizable window behavior and a single bounded content shell.
- `styles/gallery.css` and `templates/gallery.hbs`
  - Existing MK Actors gallery structure and interaction constraints.

## Non-Negotiable Product Constraints

- Actor cards are always square (`1:1`).
- The actor name is the only metadata visibly overlaid on a card.
- Type, source, UUID, permission, and other metadata may support filtering or
  accessibility but must not appear as visible card badges or secondary text.
- Card actions remain icon-only and have localized `title` and `aria-label`
  text.
- Cards remain draggable using Foundry's standard Actor drag data.
- Portrait interaction and Open Sheet interaction remain independently
  keyboard accessible.
- The gallery remains responsive inside a resizable Foundry window.
- Styling and language remain independent of the active game system.

## Design Character

The interface should feel:

- Dark, quiet, and cinematic rather than pitch black.
- Glass-like through translucency, fine light borders, soft inset highlights,
  and restrained blur.
- Dense enough for an in-game utility while leaving clear separation between
  controls and cards.
- Accent-led: amber identifies interactive focus and selection; semantic colors
  are reserved for success, warning, and destructive states.
- Layered through tone and elevation, not through heavy outlines or excessive
  decoration.

Do not use large marketing headers, oversized typography, neon glow on every
element, or multiple competing accent colors.

## Canonical Tokens

Define tokens on the ApplicationV2 root so gallery components can reuse the
same vocabulary. Token names may be shortened in implementation, but their
meaning and values should remain consistent.

```css
#mk-actors-app {
  /* Color */
  --mka-bg: #080b12;
  --mka-surface: rgba(255, 255, 255, 0.035);
  --mka-surface-strong: rgba(255, 255, 255, 0.075);
  --mka-surface-hover: rgba(255, 255, 255, 0.12);
  --mka-surface-dark: rgba(0, 0, 0, 0.18);
  --mka-border: rgba(255, 255, 255, 0.09);
  --mka-border-soft: rgba(255, 255, 255, 0.06);
  --mka-text: #f4f1eb;
  --mka-text-strong: #f4f1eb;
  --mka-text-muted: #a6adbb;
  --mka-primary: #dda85b;
  --mka-primary-strong: #f1c171;
  --mka-success: #55a46f;
  --mka-warning: #d6a54d;
  --mka-danger: #cf5f58;

  /* Shape */
  --mka-radius-control: 8px;
  --mka-radius-card: 10px;
  --mka-radius-panel: 12px;
  --mka-radius-pill: 999px;

  /* Space */
  --mka-space-1: 4px;
  --mka-space-2: 6px;
  --mka-space-3: 8px;
  --mka-space-4: 10px;
  --mka-space-5: 12px;
  --mka-space-6: 16px;

  /* Elevation and motion */
  --mka-shadow-card: 0 4px 14px rgba(0, 0, 0, 0.22);
  --mka-shadow-float: 0 14px 34px rgba(0, 0, 0, 0.48);
  --mka-highlight-inset: inset 0 1px rgba(255, 255, 255, 0.07);
  --mka-duration-fast: 120ms;
  --mka-duration-ui: 150ms;
}
```

Token rules:

- Use the primary color for focus, active filters, selected sources, and
  informative icons.
- Use semantic colors only for their named purpose.
- Derive component tints with `color-mix()` where useful; retain a readable
  base background so the control still works if a visual effect is unavailable.
- Prefer one-pixel translucent borders. Avoid pure-white borders.
- Use no more than the three elevation levels represented by flat surface,
  card shadow, and floating overlay shadow.

## ApplicationV2 Scoping and Shell

- Set a stable `id` and module class in `DEFAULT_OPTIONS`; all application
  selectors must begin with `#mk-actors-app`, `.mk-actors-app`, or
  `.mk-actors`.
- Never style generic Foundry elements such as `.window-content`, `button`,
  `input`, or `.form-group` without an MK Actors ancestor.
- Reset the application content area with zero padding and hidden outer
  overflow. Exactly one intended child region owns each scrollbar.
- Make the shell fill the content area with `width: 100%`, `height: 100%`, and
  `min-height: 0`.
- Use `container-type: inline-size` on the ApplicationV2 root. Responsive rules
  must react to the application window width, not the browser viewport.
- Use a dark fallback background and layer subtle gradients over it:
  one low-opacity radial accent near the top and one vertical white highlight.
- Use translucent surfaces and gradients for the glass effect, with an opaque
  fallback. Keep backdrop blur off the window and its full content shell:

```css
.mk-actors-app .window-content {
  padding: 0;
  overflow: hidden;
}

#mk-actors-app {
  container-type: inline-size;
}

.mk-actors {
  background:
    radial-gradient(circle at 12% 0%,
      rgba(86, 115, 178, 0.10), transparent 40%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.025), transparent 32%),
    var(--mka-bg);
}

```

## Surface Hierarchy

Use tone, border, and spacing consistently:

1. **Application background** — `--mka-bg` with the subtle shell gradients.
2. **Toolbar, search header, and footer** — dark translucent rails attached to
   the shell. The search header shows the selected source and its source kind;
   result counts and warnings stay in the footer.
3. **Source panel** — `--mka-surface-dark` plus a separating border.
4. **Cards and form groups** — `--mka-surface`, fine border, inset highlight,
   and card shadow.
5. **Menus and floating overlays** — nearly opaque dark surface, float shadow,
   and a clear border so content behind it never harms readability.

Avoid stacking blur on nested surfaces. The glass effect should come primarily
from transparency, border highlights, and depth.

Keep full-window backdrop blur disabled: the Scene behind the window may be
animated, and resizing otherwise repeats an expensive background blur. Use
`content-visibility: auto` on square Actor cards to skip offscreen contents while
retaining their layout. Isolate each window with layout/paint containment and a
single compositor hint on the application root, never on every Actor card.
While the title bar or Foundry resize handle is active, simplify shadows and
disable hover transitions; restore them as soon as it is released. Do not
animate the window's `left`, `top`, `width`, or `height` during pointer movement.
Preserve Foundry's minimize/maximize transitions.

Move expanded windows with a temporary transform, sampling bounds once at the
start and coalescing pointer updates to animation frames. Commit the final
position once through Foundry's public `setPosition` API on release. Preserve
scale, viewport limits, header buttons, double-click minimize, and native
handling of touch and modified gestures. Escape or lost focus cancels the move.
Remove pointer listeners and pending frames when an application closes.

## Typography

- Inherit Foundry's interface font; do not introduce a module-specific web
  font.
- Body/control text: `0.72rem` to `0.8rem`.
- Actor names: `12px`, weight `550`, line height `1.3`.
- Labels and eyebrows: `11px` to `12px`, weight `600` to `650`, modest
  letter spacing, uppercase only for compact utility labels.
- Muted copy uses `--mka-text-muted`; primary content uses `--mka-text`; names
  and headings use `--mka-text-strong`.
- Truncate single-line names and labels with an ellipsis. The full actor name
  remains available through the card title or accessible name.
- Do not add visible subtitles to actor cards.

## Layout and Spacing

- Use wrapping flex rows for the toolbar and search header, and CSS grid for
  the source/content split and actor gallery.
- Use `minmax(0, 1fr)` for flexible grid tracks so long content cannot force
  horizontal overflow.
- Keep dense control gaps between `6px` and `10px`.
- Use `10px` to `12px` padding for major rails and scroll regions.
- The source panel may use a fixed comfortable width on large windows, but the
  actor grid must own the remaining flexible width.
- Keep the action bar approximately `58px`, Sources/search header `51px` to
  match MK Scene Gallery, and footer
  `42px` high. The expanded sidebar is `210px` wide and shares its dividing
  border directly with the gallery; do not frame it as a detached card.
- Empty states may be more spacious, but they remain an in-window utility state
  rather than a hero section.

## Actor Cards

Actor cards are the main visual surface and follow this contract:

- Use an auto-filling grid with a configurable minimum card width.
- Every grid item contributes a real square height to layout. A safe pattern is
  `aspect-ratio: 1 / 1` on an in-flow block. If all visible children are
  absolutely positioned, retain an in-flow square spacer (for example a
  `::before` block with `padding-top: 100%`) so grid rows cannot collapse.
- Portraits sit inside a `6px` inset frame and use `object-fit: contain`.
- Use `overflow: hidden`, `--mka-radius-card`, a one-pixel border,
  `--mka-shadow-card`, and `--mka-highlight-inset`.
- Place the actor name in a bottom gradient that becomes opaque enough for
  readable text over any portrait.
- Put the Open Sheet action in the top-right corner, away from the name.
- Put an always-visible Favorites star in the top-left corner. Use an outlined
  star when unselected and a filled amber star when selected; expose its toggle
  state and localized action through accessible labels and `aria-pressed`.
- Do not show type, source, compendium, or system data on the card.
- Keep the default state quiet. On hover or keyboard focus, brighten the border
  toward `--mka-primary`, slightly strengthen the shadow, and optionally lift
  the card by at most `1px`.
- Use `:focus-within` so keyboard focus receives the same visual emphasis as
  hover.
- On drag/active state, use the grabbing cursor and a small reduction in
  opacity or scale; never obscure the card's identity.
- Missing portraits use a dark neutral placeholder with a subdued image or
  user icon. Do not introduce game-system imagery.

Recommended state behavior:

```css
.mk-actors__card {
  border: 1px solid var(--mka-border);
  background: var(--mka-surface);
  box-shadow: var(--mka-shadow-card), var(--mka-highlight-inset);
  transition:
    transform var(--mka-duration-ui) ease,
    border-color var(--mka-duration-ui) ease,
    box-shadow var(--mka-duration-ui) ease;
}

.mk-actors__card:hover,
.mk-actors__card:focus-within {
  border-color: color-mix(in srgb, var(--mka-primary) 68%, white 8%);
  box-shadow:
    0 6px 18px rgba(0, 0, 0, 0.30),
    0 0 0 1px color-mix(in srgb, var(--mka-primary) 28%, transparent),
    var(--mka-highlight-inset);
  transform: translateY(-1px);
}
```

## Controls and Actions

- Inputs and selects use a dark surface, one-pixel border, `8px` radius,
  and a compact height of approximately `34px`.
- Search retains its leading icon and enough left padding to avoid overlap.
- Icon-only action buttons are visually centered and normally at least `30px`
  in both dimensions. The card's Open Sheet button is `26px` and the Sources
  toggle is `24px`, matching the compact preview. Each has localized `title`
  and `aria-label` text.
- Secondary buttons use `--mka-surface-strong`; hover mixes in the primary
  accent.
- Primary actions may use a vertical primary-to-primary-strong gradient with a
  small inset highlight.
- Destructive actions use danger-colored text or border, not a full red fill
  unless confirming an irreversible operation.
- Disabled controls use reduced opacity and a default/not-allowed cursor while
  remaining legible.
- Pills are reserved for counts, toggles, or compact status. They must not
  become actor-card metadata badges.
- Focus uses `:focus-visible` with a two-pixel primary outline or equivalent
  high-contrast ring. Never remove an outline without replacing it.

## Source Tree and Selection

- Include a Favorites row with a star and a count of accessible starred Actors.
  Favorites use the same source selection and collapsed icon rail as other rows,
  and combine with search and type filters. Store Actor UUIDs in a hidden client
  setting so favorites do not alter Actor documents or other clients' choices.
- Source rows are transparent by default and become a light glass surface on
  hover.
- The selected source uses a primary-tinted background and primary-mixed
  border. Selection must not rely on color alone; retain the stronger border,
  font weight, or an existing icon treatment.
- Count pills use a dark translucent background and subdued border.
- Long source names truncate with ellipsis and expose their full text through
  `title`.
- The Sources header includes a toggle for an icon-only sidebar. Keep the
  selected source visible, expose each source name through `title` and
  `aria-label`, and preserve filtering and keyboard access in both states.
- Use a compact 44px collapsed rail, 30px source buttons, and a 24px header
  toggle. The header toggle is an exception to the usual 30px action size.
  Do not reserve empty scrollbar gutters in the collapsed rail; let the list
  show its scrollbar only when it overflows.
- Collapsing the sidebar updates its layout in place and gives the Actor grid
  the remaining width. Keep the toggle reachable and the icon rail on the left
  at narrow window widths.
- Keep the Sources header outside the scrolling source list so its background
  spans the full panel width. Reserve the scrollbar gutter on the list only.
- Keep indentation driven by a depth custom property; do not hard-code a
  maximum folder depth.

## Prototype Token Appearance Popup

- Reuse the same color, border, radius, and control tokens as the gallery.
- Open a separate, movable, resizable ApplicationV2 popup only on an Actor
  card's context-menu action. Left-clicking must not open the editor.
- Preserve the gallery's visual scroll position when the popup opens,
  saves changes, or closes; opening and closing must not rerender the gallery.
- Reuse the existing popup when the same Actor is right-clicked again.
- Scope popup tokens and window styling under `.mk-actors-token-editor-app`.
- Keep the popup's form scrollable at narrow widths and small window heights.
- Group related controls on subtle card surfaces rather than adding heavy
  separators.
- Put a required Name field above the token preview. Save it to the Actor name
  and prototype token name together; reject blank or whitespace-only names.
- Image path plus Browse remains a flexible text input paired with a square
  icon-only button.
- Dimension and anchor pairs use equal columns; scale uses a flexible range
  track plus a compact numeric input.
- The Actor Editor includes an interactive image preview with a visible token
  footprint. Dragging the image updates its anchors; the corner handle and
  mouse wheel update its scale. Numeric controls and preview stay in sync.
- Support arrow keys for positioning, plus/minus for scale, and Escape to
  cancel a drag. Preview gestures remain unsaved until Save and Close is used.
  Close the editor after a successful save; keep it open if saving fails.
- Notes are muted but retain readable contrast and adequate line height.
- Keep the GM Token Shadows section and gallery toolbar shortcut available for
  every game system. Open MK Actors' own settings window for its standalone
  renderer. Explain that these world settings affect all Scene tokens and save
  independently of Actor Editor. Keep controls hidden for players. When another
  supported renderer is active, explain which renderer controls the appearance.
- At narrow widths, paired fields stack if their usable input width would fall
  below roughly `120px`.
- Native validity, labels, keyboard access, and Foundry v13-v14 behavior take
  priority over visual styling.

## Scrollbars

- The actor grid always displays its vertical scrollbar:
  `overflow-y: scroll`.
- Use `scrollbar-gutter: stable` to prevent the card columns from shifting as
  results change.
- The source panel should also reserve a stable gutter when independently
  scrollable.
- Keep scrollbar styling subtle and scoped. Use a dark track and a
  medium-contrast thumb with a brighter hover state.
- Do not hide scrollbars, use zero-width scrollbars, or place a scrollbar on
  the whole ApplicationV2 window when only the grid should scroll.

## Accessibility

- Maintain at least WCAG AA contrast for text and essential control boundaries.
  Glass translucency never excuses low contrast.
- Every icon-only action requires both `title` and `aria-label`.
- Decorative icons use `aria-hidden="true"` when they do not carry additional
  meaning.
- Interactive portraits remain reachable by keyboard and expose the actor name
  in their accessible label.
- Provide visible `:focus-visible` states for cards, portraits, tree rows,
  inputs, selects, and buttons.
- Hover-only affordances must also appear on keyboard focus.
- Do not encode warning, success, selection, or disabled state through color
  alone.
- Preserve a logical DOM/tab order that matches the visible layout.
- Respect reduced-motion preferences:

```css
@media (prefers-reduced-motion: reduce) {
  .mk-actors *,
  .mk-actors *::before,
  .mk-actors *::after {
    scroll-behavior: auto;
    transition-duration: 0.01ms;
    animation-duration: 0.01ms;
    animation-iteration-count: 1;
  }
}
```

## Responsive Behavior

Use container queries because the application is independently resizable:

- **Wide (`> 730px`)** — full toolbar, source sidebar, and responsive card
  grid.
- **Medium (`521px` to `730px`)** — place search on its own row, hide usage
  hints, and reduce the source panel width to `172px`.
- **Narrow (`<= 520px`)** — stack the expanded source panel
  above the gallery with a bounded height; keep clear/refresh actions square.
- Allow the actor grid to reduce column count naturally. Do not distort the
  square card ratio to preserve a column.
- Keep the summary readable and allow warnings to wrap instead of overflowing.
- Prefer container breakpoints with a media-query fallback only if Foundry's
  supported runtime requires it.

## Motion

- Use `120ms` to `150ms` ease transitions for hover, focus, selection, and
  compact control state changes.
- Motion should communicate state, not decorate idle UI.
- Card lift is limited to `1px`; avoid continuous card animations.
- New-content or refresh feedback may use one short accent pulse, provided
  reduced-motion preferences disable it.

## Implementation Guardrails

Before accepting a UI change, verify:

- Styles are scoped under the ApplicationV2 id/class or an MK Actors component.
- The shell and each flex/grid ancestor of a scroll region use `min-height: 0`.
- The grid scrollbar is always visible and its gutter is stable.
- Card rows have a real in-flow square size and do not collapse.
- Portraits retain their aspect ratio inside the inset frame.
- Only actor names appear as visible card metadata.
- Icon-only actions have localized titles and accessible names.
- Hover, focus-visible, active/drag, selected, disabled, empty, warning, and
  missing-image states are visibly distinct.
- The layout works at wide, medium, and narrow application widths.
- Text truncates safely without forcing horizontal overflow.
- The prototype token appearance popup uses the same visual vocabulary.
- No selector leaks into other Foundry applications or game-system sheets.
