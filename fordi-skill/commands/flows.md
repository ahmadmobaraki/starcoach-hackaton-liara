# /fordi flows

Writes `ux/flows.md`: the user flows and, for every screen, what it holds from top to bottom. Reads
`ux/idea.md` and `rules/persian-rtl.md`. Structure only; no visual decisions.

## 1. Setup
Run `status`; `idea` must be done. Run `scaffold flows`. If the file already held content, revise
it; do not start over.

## 2. Flows: one per main job
- The header line is `- کاربر: <role> · کار: <job number in idea.md>`. `check` matches every job to a
  flow by this number.
- Steps are numbered; each ends in `→ S<n>`, the screen where it happens.
- Failure and edge branches are sub-bullets under their step: `- اگر <condition>: <what happens> → S<n>`.
  Cover what the traits imply, for example saving while offline, a slot taken at the same moment, or
  a missing permission.
- Add one `mermaid` `flowchart RL` per flow: the happy path plus its branches.
- Optional, for the hardest flow only: at most 2 Mobbin `search_flows` calls to see how established
  apps structure it. Note the pattern in one line; never copy a screen.

## 3. Screens
Merge steps that land on the same screen. Keep version 1 to about 8 screens, and say so if the scope
needs more. For each screen:
- `هدف`: the one task the user finishes here.
- `در فلو`: the steps that land here, such as `F1.2`.
- `بلوک‌ها`: numbered in order from the top. Each is a named block with its real content and its
  ranges: short and long names, large numbers, an empty list.
- `اکشن‌ها`: the exact button label (verb first, at most 3 words) and its target `→ S<n>`.
- `stateها`: `empty`, `loading`, `error`, plus every state the traits add (`check` lists them). Each
  is described in one line (what the user sees and their way forward) or marked `N/A: <reason>`.

Apply `rules/persian-rtl.md`:
- Describe each toolbar with 1, 2 and 3 controls.
- Make sure nothing sits under the keyboard.
- Use Solar Hijri dates and Persian digits in the examples.

## 4. Close
Run `check flows` and fix every error; treat warnings as questions for the user. Run `flowmap` and
tell the user to open `ux/flow-map.html`. Ask: تأیید / اصلاح. On approval, suggest `/fordi refs`.
