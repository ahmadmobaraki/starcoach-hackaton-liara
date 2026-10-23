# /fordi refs

Collects the user's visual references per screen block and writes `ux/refs.md`. It reads
`ux/flows.md`.

## 1. Setup
Run `status`; `flows` must be done. Run `scaffold refs` and create the folder `ux/refs/`.

Tell the user once, with the absolute path of `ux/refs/`: an image sent in chat can only be
described, and it is lost when the session ends. To keep the file itself, save it into that folder
and name it here.

## 2. Screen by screen, most used first
Show one compact line per screen: `S1 · <title> — بلوک‌ها: ۱) … ۲) … ۳) …`.

Ask with AskUserQuestion. The options are «عکس می‌فرستم», «از Mobbin پیدا کن» and «رد کن».

**Image.** Look at it. For the block it serves, write:
- **بگیر:** the layout, density, hierarchy and interaction it shows.
- **نگیر:** its colors, fonts and brand, which always come from `ux/tokens.css`, and anything that
  conflicts with the screen's blocks.

If the file is in `ux/refs/`, give its path. Otherwise write `(در چت)`.

**Mobbin.** Run at most 2 `search_screens` calls for that block. Show the 3 best results with
their links and let the user pick. Record the link and what to take from it.

**Skip.** Write `- رد شد`.

Keep each entry to one line.

## 3. Close
Run `check refs` and fix every error. Warnings about `(در چت)` images are fine once the user has
been told. Suggest `/fordi prototype`.
