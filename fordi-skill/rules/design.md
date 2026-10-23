# Design rules

Distilled and adapted for Persian/RTL from Impeccable (Apache-2.0, see NOTICE.md). Read by
`direction` and `prototype` only.

## Visitor mode
Pick one: **Operate** (do a task: most apps), **Read** (understand content), **Persuade** (act on an
offer), **Experience** (the work itself leads). It sets the color strategy, the faces and the motion.

## Direction round
1. Write one line each: the product's unique mechanism; the audience's real scene; their cultural
   home. Name the look this category always ships and its predictable opposite. Both are excluded.
2. List 7 concrete sources from the audience's own world: objects, places, rituals, and the print or
   screen traditions they read daily. Rank them by resonance. They must span at least 3 material
   families; near-duplicates count once. A literal reading of the product name gets at most one slot.
3. Run `fordi.mjs roll`. It deals the lead and two alternates. You do not choose. If your rank 1 was
   not dealt, add it as a card «انتخاب fordi», with an honest risk line when it is familiar.
4. Always add the **canon** card: the category standard, played straight and well. It is the user's
   exit. Never recommend it and never weaken the dealt cards to make it look better.
5. Every card has the same anatomy: idea, palette (bg / ink / accent), faces, the product's first
   screen rendered with real Persian content, the signature moment, and an honest risk.
6. Re-roll on the user's word: `roll --exclude <every rank already shown>`. «جسورتر» means only
   unfamiliar forms. «امن‌تر» means conventional candidates plus the canon. After two re-rolls, ask
   what quality is missing. Taste is never your reason to re-roll; only a factual failure is.

## Color
- Choose the strategy before the colors: **Restrained** (neutrals plus one accent; the default for
  Operate and Read), **Committed** (one color covers 30–60% of the surface), **Full palette** (3–4 named
  roles), or **Drenched** (the surface is the color).
- Light or dark comes from the scene sentence (who, where, what light), never from the category.
- Text contrast is at least 4.5:1 (`check direction` measures it). Secondary text on a colored surface is
  tinted from that surface, never flat gray.
- AI-default looks, used only when the idea asks for them: cream + serif + terracotta; near-black +
  neon glow; editorial hairlines + italic serif + mono labels. If someone could guess the look from
  the category alone, rework it.

## Persian type
- Faces must carry پ چ ژ گ ی ک and Persian digits. Vazirmatn is the known-good default. Accept any
  other face only after the sample «پژوهش گچ‌بری ژاله · ۱۴۰۵/۰۷/۰۲ · ۱۲٬۵۰۰ تومان» renders correctly
  in the browser (joined letters, no boxes, no fallback font).
- No letter-spacing and no italics on Persian text: both break the joined script.
- Body line-height is at least 1.8. Measure is 60–75 characters. Size and weight steps are obvious.

## Craft floor (verify on the built prototype)
- Spacing: tight inside a group, generous between groups, more space above a heading than below it.
- Depth: every shadow has an offset and a soft blur.
- Every control draws hover, focus-visible, disabled and loading. Every screen draws its states.
- The browser's own surfaces carry the design: selection, caret, focus ring, scrollbars (the template
  sets them).
- Copy: a control names its action (verb first, at most 3 words). An error names the problem and the
  way out. Content is real Persian at short, typical and long lengths.

## Refuse (unless the idea explicitly earns it)
- Same-size cards of icon + heading + text as the page structure. Nested cards.
- The hero-metric template: a big number, a small label, supporting stats.
- An eyebrow or kicker label above a heading. Always refused.
- Section numbers (۰۱ / ۰۲) unless the order itself is information.
- A modal for a task that needs neither interruption nor protected focus.
- Gradient text; glass or blur as decoration; a colored side border wider than 1px on cards or
  alerts; zero-blur offset shadows; emoji or Unicode glyphs as icons (use one library, one stroke
  weight); monospace as a costume.

## Motion
- Only for a purpose: acknowledge an action, explain a state change, keep continuity, direct
  attention, or embody the world. There is **one** authored signature moment; everything else is
  quiet.
- Timing: 100–150ms feedback · 150–300ms state change · 300–500ms layout or overlay · 500–800ms the
  signature entrance only. Exits are faster than entrances.
- Easing is `ease-out` from tokens (cubic-bezier(0.16, 1, 0.3, 1)). No bounce by reflex.
- Animate transform, opacity, filter or clip-path, never width, height, top or margins.
- Content is visible by default; never hidden until a script runs.
- Every animation sits behind `motion-safe:` or has a `motion-reduce:` alternative that keeps the
  state feedback.

## RTL in Tailwind
- Use only logical utilities: `ms- me- ps- pe- start- end- text-start text-end border-s rounded-s`.
  `check prototype` flags `ml- mr- pl- pr- left- right- text-left text-right`.
- Directional icons flip with `rtl:-scale-x-100`. Logos, checkmarks and media icons do not flip.
- Never `tabular-nums` on Persian digits. It is a hard error.
