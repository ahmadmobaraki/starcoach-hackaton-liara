# /fordi idea "<idea>"

Turns a raw idea into `ux/idea.md`: one page, researched, with every decision, assumption and gap
visible. Reads nothing else.

## 1. Right folder
Run `status`. If `ux/` does not exist and `foreign` is not empty, show those names and ask
(AskUserQuestion) whether this folder is the project's home. If the answer is no, stop and tell the
user to open the project folder first.

## 2. Start or revise
Run `scaffold idea`. If `ux/idea.md` already held content, this run is a revision: apply what the user
asked, keep everything else, and move any contradicted line out.

## 3. Ask (at most 2 rounds, at most 4 questions each)
Ask only what changes screens or scope:
- who uses it, where, and in what state (standing at a counter, on the phone, at a desk);
- the 2–5 main jobs, and which one matters most;
- platform: phone, desktop or both;
- scope of the first version: what is in and what is out;
- Persian specifics only when they apply: Toman or Rial, Solar Hijri only or both calendars.

Detect traits from the idea: `offline`, `scheduling`, `roles` (users with different rights),
`messages` (SMS or notifications), `money`, `personal-data`, `branches`. When a trait hides a design
choice, ask it. Examples: for offline, can two devices edit the same record? For scheduling, what
happens when a slot is taken while the form is open?

Format: AskUserQuestion with 2–4 concrete options. Put the recommended option first with
«(پیشنهادی)». Its description says why, and when another option is better. State obvious facts as
assumptions instead of asking about them. Never ask about colors, fonts or style; that is
`direction`. Run round 2 only if round 1 exposed a gap that changes screens.

## 4. Market research (budget: 5 searches, 3 page reads)
Search in Persian first, then English, for 3–6 real products that do this job. For each product
record: who it is for, one real strength, one real gap, and the link. If nothing is found, write so;
never invent products, prices, user counts or quotes. Screenshot libraries such as Mobbin show
patterns, not demand; save them for `flows`.

## 5. Write `ux/idea.md` in Persian (about 60 lines)
- The differentiation must follow from the gaps in the market table.
- Main jobs are numbered, one line each: user + verb + result. `flows` covers each by its number.
- `ویژگی‌های اثرگذار`: one line per detected trait, key first (`- offline: …`), or `- ندارد`.
- Decisions are what the user answered. Assumptions are what you assumed, each with how to verify
  it. Open questions are what is still unknown.

## 6. Close
Run `check idea` and fix every error. Show a five-line summary in Persian, then ask: تأیید / اصلاح.
On approval, suggest `/fordi direction`, ideally in a new session.
