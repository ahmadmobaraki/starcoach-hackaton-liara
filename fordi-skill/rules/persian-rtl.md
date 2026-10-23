# Persian and RTL requirements

These are UX requirements, written into flows.md from the start, not fixed at the end.
Rules 1–4 come from bugs that already shipped; they are hard rules.

## Hard rules

1. **Persian digits are proportional, never tabular.** Never specify `tabular-nums` for Persian
   numeric text (prices, totals, dates, counters, badges). Only exception: a grid that truly needs
   vertical column alignment, scoped to that element alone.
2. **Toolbar and search rows stay on one aligned row.** A wrapping row with the filter growing and
   buttons sized to content. Never a rigid rule that forces one child full-width and orphans a
   half-width button. Screens must describe the row with 1, 2 and 3 controls.
3. **Button labels never wrap.** Controls in a row share one height, at least 44px.
4. **375px first.** Every toolbar, header, row and sheet is designed at 375px: no horizontal
   overflow, nothing hidden under the keyboard, controls aligned and equal height, text not clipped.

## Content

- Persian `ی` and `ک`, never the Arabic forms. Correct half-spaces (ZWNJ): می‌شود, کتاب‌ها.
- Digits: Persian digits in the UI. Inputs accept both Persian and Latin digits and normalize them.
- Dates: Solar Hijri by default. Decide in `idea` whether Gregorian is also needed.
- Currency: decide **Toman or Rial** in `idea` and use it everywhere. Specify thousands separators.
- Phone numbers: `09xx xxx xxxx`; accept `+98` and Persian digits.
- Mixed direction: English brand names, URLs, codes and emails inside Persian text must be
  direction-isolated, and screens must include one such example.
- Content ranges use real Persian text: short, typical and long names, addresses and product titles.
  Never lorem ipsum.

## Direction

- Reading order, alignment and progress run right to left.
- Mirror icons that imply direction (back/forward arrows, chevrons, progress). Do not mirror logos,
  check marks, media play icons, or icons of real-world objects.
- Swipe gestures follow reading direction.
