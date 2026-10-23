# /fordi direction

Chooses the visual world with the user and commits it as tokens. It reads `ux/idea.md` and
`rules/design.md`, and writes `ux/direction.html`, `ux/direction.md` and `ux/tokens.css`.

## 1. Ground
Run `status`; `idea` must be done. Read `ux/idea.md` and `rules/design.md`. In your reply, state in
at most five lines:
- the visitor mode
- the scene sentence
- the product's mechanism
- the category default and its opposite

## 2. Candidates and roll
Derive the 7 ranked candidates as described in "Direction round". Run `roll`. Keep the whole list and
the roll result: both go into the candidates table in `direction.md`.

## 3. Decision page
Run `scaffold direction`, then fill `ux/direction.html`:
- One card each for the lead, the two alternates, the pick (if your rank 1 was not dealt) and the
  canon.
- Each card's viewport is the product's main screen (the first main job) at phone width, drawn in
  that card's palette and faces, with real Persian content and the type sample from
  `rules/design.md`.
- Load every face in one Google Fonts link.
- Below the hand, add one line per dealt candidate that lost, saying what the lead kept from it.

Open the page in the browser pane and look at it: every face renders the Persian sample correctly,
and the cards stack at 375px. Replace any face that fails.

## 4. Choose
Use AskUserQuestion. The options are the lead, the two alternates, and the pick or the canon. The
question text says the user may also type «جسورتر», «امن‌تر» or «دوباره» to re-roll.
- To re-roll, run `roll --exclude <all ranks shown so far>`, rebuild the cards and ask again. After
  two re-rolls, ask what quality is missing before rolling a third time.
- The user may also mix: "the first card's palette with the third one's type". Honor it.

## 5. Commit
- Fill `ux/direction.md`: every section plus the candidates table with the roll result.
- Fill `ux/tokens.css` from the chosen card, expanded into the full set:
  - surface, muted, line
  - danger, success, warning
  - radii and the card shadow
  - easing and the entrance animation, tuned to the signature moment
- Values are real colors (hex), real faces and real sizes.
- Run `check direction`. It also measures contrast. Fix every error.

Show the user the chosen direction in three lines and suggest `/fordi flows`.
