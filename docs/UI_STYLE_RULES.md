# MK Actors UI Style Rules

These rules define the visual language for MK Actors. The target is a compact,
card-based dark glass interface that feels native to a Foundry VTT
`ApplicationV2`, using MK Parallax Scenes as the local family reference.

This is a design contract, not a requirement to copy selectors or markup from
the reference module. MK Actors remains system agnostic and must preserve its
gallery behavior.

## Reference Basis

The rules were derived from:

- Sibling reference `../MK-Parallax-Scenes/styles/mk-parallax-scenes.css`
  - Scoped design tokens on the ApplicationV2 root.
  - Layered translucent surfaces and restrained gradients.
  - Compact controls, accent-led state changes, card borders, and shadows.
  - Stable scroll gutters and container-query responsive layouts.
- Sibling reference `../MK-Parallax-Scenes/templates/parallax-config.hbs`
  - Shell, command bar, card collection, empty state, and footer structure.
  - Icon-only secondary actions with descriptive `title` attributes.
- Sibling reference `../MK-Parallax-Scenes/scripts/mk-parallax-scenes.js`
  - Stable ApplicationV2 `id` and `classes` used as styling boundaries.
  - Resizable window behavior and a single bounded content shell.
- `styles/gallery.css`, `templates/gallery.hbs`, and
  `templates/token-portrait-dialog.hbs`
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
- Accent-led: blue identifies interactive focus and selection; semantic colors
  are reserved for success, warning, and destructive states.
- Layered through tone and elevation, not through heavy outlines or excessive
  decoration.

Do not use large marketing headers, oversized typography, neon glow on every
element, or multiple competing accent colors.

## Canonical Tokens

Define tokens on the ApplicationV2 root so dialogs and gallery components can
reuse the same vocabulary. Token names may be shortened in implementation, but
their meaning and values should remain consistent.

```css
#mk-actors-app {
  /* Color */
  --mka-bg: rgba(20, 23, 29, 0.90);
  --mka-surface: rgba(255, 255, 255, 0.055);
  --mka-surface-strong: rgba(255, 255, 255, 0.085);
  --mka-surface-hover: rgba(255, 255, 255, 0.12);
  --mka-surface-dark: rgba(0, 0, 0, 0.18);
  --mka-border: rgba(255, 255, 255, 0.14);
  --mka-border-soft: rgba(255, 255, 255, 0.085);
  --mka-text: #edf1f5;
  --mka-text-strong: #f7f9fb;
  --mka-text-muted: rgba(237, 241, 245, 0.66);
  --mka-primary: #5c9fe8;
  --mka-primary-strong: #2f78c8;
  --mka-success: #55a46f;
  --mka-warning: #d6a54d;
  --mka-danger: #cf5f58;

  /* Shape */
  --mka-radius-control: 6px;
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
- If using glass blur, apply it only to bounded surfaces. Provide the
  translucent background as the fallback:

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
      rgba(92, 159, 232, 0.13), transparent 34%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.025), transparent 32%),
    var(--mka-bg);
}

@supports (backdrop-filter: blur(1px)) {
  .mk-actors {
    backdrop-filter: saturate(1.08) blur(10px);
  }
}
```

## Surface Hierarchy

Use tone, border, and spacing consistently:

1. **Application background** — `--mka-bg` with the subtle shell gradients.
2. **Toolbar and summary rails** — dark translucent overlays with a bottom
   border; they remain visually attached to the shell.
3. **Source panel** — `--mka-surface-dark` plus a separating border.
4. **Cards and form groups** — `--mka-surface`, fine border, inset highlight,
   and card shadow.
5. **Menus and floating overlays** — nearly opaque dark surface, float shadow,
   and a clear border so content behind it never harms readability.

Avoid stacking blur on nested surfaces. The glass effect should come primarily
from transparency, border highlights, and depth.

## Typography

- Inherit Foundry's interface font; do not introduce a module-specific web
  font.
- Body/control text: `0.72rem` to `0.8rem`.
- Actor names: `0.86rem` to `0.95rem`, weight `700` to `750`, line height
  `1.1` to `1.2`.
- Labels and eyebrows: `0.64rem` to `0.68rem`, weight `750` to `800`, modest
  letter spacing, uppercase only for compact utility labels.
- Muted copy uses `--mka-text-muted`; primary content uses `--mka-text`; names
  and headings use `--mka-text-strong`.
- Truncate single-line names and labels with an ellipsis. The full actor name
  remains available through the card title or accessible name.
- Do not add visible subtitles to actor cards.

## Layout and Spacing

- Use CSS grid for the toolbar, source/content split, and actor gallery.
- Use `minmax(0, 1fr)` for flexible grid tracks so long content cannot force
  horizontal overflow.
- Keep dense control gaps between `6px` and `10px`.
- Use `10px` to `12px` padding for major rails and scroll regions.
- The source panel may use a fixed comfortable width on large windows, but the
  actor grid must own the remaining flexible width.
- Keep summary/status rows compact, approximately `28px` to `36px` high.
- Empty states may be more spacious, but they remain an in-window utility state
  rather than a hero section.

## Actor Cards

Actor cards are the main visual surface and follow this contract:

- Use an auto-filling grid with a configurable minimum card width.
- Every grid item contributes a real square height to layout. A safe pattern is
  `aspect-ratio: 1 / 1` on an in-flow block. If all visible children are
  absolutely positioned, retain an in-flow square spacer (for example a
  `::before` block with `padding-top: 100%`) so grid rows cannot collapse.
- Portraits fill the card and use `object-fit: cover`.
- Use `overflow: hidden`, `--mka-radius-card`, a one-pixel border,
  `--mka-shadow-card`, and `--mka-highlight-inset`.
- Place the actor name in a bottom gradient that becomes opaque enough for
  readable text over any portrait.
- Reserve the lower-right corner for the Open Sheet action so the name never
  sits beneath it.
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

- Inputs and selects use a dark inset surface, one-pixel border, `6px` radius,
  and a compact height of approximately `30px`.
- Search retains its leading icon and enough left padding to avoid overlap.
- Icon-only action buttons are square, visually centered, and at least `30px`
  in both dimensions. Each has localized `title` and `aria-label` text.
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

- Source rows are transparent by default and become a light glass surface on
  hover.
- The selected source uses a primary-tinted background and primary-mixed
  border. Selection must not rely on color alone; retain the stronger border,
  font weight, or an existing icon treatment.
- Count pills use a dark translucent background and subdued border.
- Long source names truncate with ellipsis and expose their full text through
  `title`.
- Keep indentation driven by a depth custom property; do not hard-code a
  maximum folder depth.

## Token Portrait Dialog

- Reuse the same color, border, radius, and control tokens as the gallery.
- Group related controls on subtle card surfaces rather than adding heavy
  separators.
- Image path plus Browse remains a flexible text input paired with a square
  icon-only button.
- Dimension and anchor pairs use equal columns; scale uses a flexible range
  track plus a compact numeric input.
- Notes are muted but retain readable contrast and adequate line height.
- At narrow widths, paired fields stack if their usable input width would fall
  below roughly `120px`.
- Native validity, labels, keyboard access, and Foundry v12-v13 behavior take
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

- **Wide (`> 880px`)** — full toolbar, source sidebar, and responsive card
  grid.
- **Medium (`681px` to `880px`)** — tighten gaps, allow filter controls to
  wrap, and reduce the source panel width before reducing card legibility.
- **Narrow (`<= 680px`)** — place search on its own row; stack the source panel
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
- Portraits are cropped, not stretched.
- Only actor names appear as visible card metadata.
- Icon-only actions have localized titles and accessible names.
- Hover, focus-visible, active/drag, selected, disabled, empty, warning, and
  missing-image states are visibly distinct.
- The layout works at wide, medium, and narrow application widths.
- Text truncates safely without forcing horizontal overflow.
- The token portrait dialog uses the same visual vocabulary.
- No selector leaks into other Foundry applications or game-system sheets.
