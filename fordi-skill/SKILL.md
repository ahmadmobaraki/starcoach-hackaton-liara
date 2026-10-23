---
name: fordi
description: Turns a raw product idea into a researched idea, a chosen visual direction with design tokens, user flows with per-screen content, and a clickable Persian/RTL HTML + Tailwind prototype ready to convert to code. Use for /fordi and its commands idea, direction, flows, refs, prototype.
argument-hint: "[idea \"…\" · direction · flows · refs · prototype · (none = status)]"
user-invocable: true
metadata:
  version: 1.0.0
---

# fordi

Pipeline: **idea → direction → flows → refs → prototype**. Each stage reads only the files of
earlier stages, so each can run in a fresh session.

`<skill-dir>` is this file's folder. Run every script from the user's project folder as
`node "<skill-dir>/scripts/fordi.mjs" <cmd>`. The commands are `status`, `check <stage>`,
`scaffold <stage>`, `roll`, `tokens`, `components` and `flowmap`.

| Command | Before acting, read only |
|---|---|
| `/fordi` | nothing. Run `status`; tell the user in Persian which stages are done or stale and the next command. |
| `/fordi idea "…"` | `commands/idea.md` |
| `/fordi direction` | `commands/direction.md` |
| `/fordi flows` | `commands/flows.md` |
| `/fordi refs` | `commands/refs.md` |
| `/fordi prototype` | `commands/prototype.md` |

Text after a command (for example `/fordi flows "add a weekly report"`) is a change request. Revise
that stage's file and keep the rest. Then run `status` to name the stages that became stale.

## Always
- Talk to the user in Persian, in plain words. Write the files in Persian; keep ids, code and file
  names in English.
- Read only the command file and the files it names. Do not load other stages' instructions.
- Never invent facts: no products, numbers, users or quotes that you did not find or were not told.
  Unknowns go under فرض‌ها or سؤال‌های باز.
- A stage is done only when `check <stage>` exits 0. Show the user its result; never claim a pass.
- Never overwrite the user's files silently. `scaffold` never overwrites, and a re-run revises the
  existing file.
- If an earlier stage a command needs is missing, name it and stop.
