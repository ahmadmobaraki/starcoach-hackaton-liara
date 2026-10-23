# /fordi prototype

Builds the clickable prototype in HTML + Tailwind v4 from the committed tokens, then records
`DESIGN.md` from what was built.

- **Reads:** `ux/tokens.css`, `ux/direction.md`, `ux/flows.md`, `ux/refs.md`, `rules/design.md`,
  `rules/persian-rtl.md`.
- **Writes:** `ux/prototype/`, `DESIGN.md` at the project root.

## 1. Setup
Run `status`. `direction`, `flows` and `refs` must be done; `design` is this command's last step.

Then:
- Run `scaffold prototype`, then `tokens`.
- Point the fonts link at the faces named in `ux/tokens.css`.
- Icons come from one library: Lucide via `https://cdn.jsdelivr.net/npm/lucide@latest/dist/umd/lucide.min.js`,
  `<i data-lucide="name">`, and `lucide.createIcons()` at the end of the body.

## 2. Build screen by screen, in flow order
For every screen in `ux/flows.md`:
- One `<section class="screen" data-screen="S<n>" data-title="…">`.
- Inside it, one `<div class="state" data-state="…">` for `default` and for every state that is not
  N/A.
- Blocks keep the order and the real content of `flows.md`; long-range content appears in at least
  one state.
- Apply `ux/refs.md`: take what it says to take and nothing else.
- Style with Tailwind utilities from the tokens only (`bg-surface text-ink rounded-md shadow-card
  font-display`). No inline `style`, no raw hex, no extra CSS beyond the template's base layer.
- Use only logical direction utilities. Every button has `whitespace-nowrap` and `min-h-11`; controls
  in one row share their height; toolbars `flex flex-wrap items-stretch`.
- A reusable piece carries `data-component="PascalName"` and the same markup every time it appears.
  This is what makes the prototype convertible to components.
- Actions put `data-goto="S2"` (or `S2/empty`) on the real control.

After each screen, run `check prototype`. Errors for screens not built yet are expected; everything
else is fixed now.

## 3. Motion
Build the signature moment from `direction.md`, then the feedback and state transitions described in
"Motion" in `rules/design.md`. Nothing more.

## 4. Verify in the browser
Open `ux/prototype/index.html` in the browser pane and run `window.fordiCheck()` with the JavaScript
tool. Fix every problem it reports (overflow, clipped or wrapped buttons, targets under 44px, uneven
rows) and run it again until it returns no problems.

Then screenshot the main screen at 375px and compare it with:
- "اولین نما" in `direction.md`;
- "Refuse" in `rules/design.md`;
- "Craft floor" in `rules/design.md`.

Fix what fails.

## 5. Record
Run `components`. It writes `ux/prototype/components.md`.

Write `DESIGN.md` at the project root from what was built, in the DESIGN.md format.

The YAML frontmatter holds only:
- `name`, `description`
- `colors` (every `--color-*` from `ux/tokens.css`)
- `typography`, `rounded`, `spacing`
- `components` (variants as sibling keys, such as `button-primary-hover`), using at most these
  props: backgroundColor, textColor, typography, rounded, padding, size, height, width

The body has these sections, in this order, and omits any that do not apply:
1. `## Overview`
2. `## Colors`
3. `## Typography`
4. `## Layout`
5. `## Elevation & Depth`
6. `## Shapes`
7. `## Components`
8. `## Do's and Don'ts`

Lead each value with its role, then the exact value in parentheses. Add 1–2 named rules
(`**The … Rule.** …`) where the build shows one. Document only components that exist.

Run `check design`, then `check prototype`. Both must pass.

## 6. Report
Tell the user in Persian:
- how to open the prototype;
- what was verified, with the command output;
- what was not;
- how to take it to code: `ux/tokens.css` is a Tailwind v4 `@theme` block; `components.md` lists the
  components to create; `DESIGN.md` keeps later screens on-brand.
