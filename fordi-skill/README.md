# fordi

**A Persian-first skill for [Claude Code](https://claude.com/claude-code) that takes you from a raw idea
to a clickable prototype you can turn into code.**

It asks the questions that change the design and researches the market. It helps you choose a visual
direction and writes the user flows and the content of every screen. Last, it builds an
HTML + Tailwind prototype with every state. Scripts check each step; the model's own judgment is not
trusted.

[فارسی ↓](#فارسی)

> **Status: 1.0.0.** Every script is covered by 34 passing tests. The whole pipeline was run on a sample
> project with the scripts and checked in a real browser: Tailwind tokens, fonts, icons, navigation,
> and the 375px check. The five commands have not yet been run end to end by a fresh Claude session
> on a real idea. See [What is verified](#what-is-verified-and-what-is-not).

---

## The pipeline

```text
/fordi idea "…"  →  /fordi direction  →  /fordi flows  →  /fordi refs  →  /fordi prototype
```

| Command | What happens | What you do | Output |
|---|---|---|---|
| `/fordi` | Shows which stages are done or stale and the next command | nothing | – |
| `/fordi idea "…"` | Up to 2 rounds of at most 4 questions, then market research (5 searches, sources linked, nothing invented) | Answer, approve | `ux/idea.md` (one page) |
| `/fordi direction` | Derives 7 visual candidates from your audience's own world. A dice roll deals 3, plus the category standard, drawn as real screens on one page | Pick one, or ask for «جسورتر» / «امن‌تر» | `ux/direction.md`, `ux/tokens.css` (Tailwind v4 `@theme`) |
| `/fordi flows` | One flow per main job. For each screen: its goal, its blocks from top to bottom with real content, its actions, and every state (empty, loading, error, offline…) | Open the flow map, approve | `ux/flows.md`, `ux/flow-map.html` |
| `/fordi refs` | Asks, screen by screen: "this screen has these blocks; which one do you have a reference for?" | Send screenshots, let it search Mobbin, or skip | `ux/refs.md` |
| `/fordi prototype` | Builds every screen and state in HTML + Tailwind from your tokens, adds purposeful motion, runs the 375px check, then records the design system | Click through it, ask for changes | `ux/prototype/`, `components.md`, `DESIGN.md` |

Each stage reads only the files of earlier stages, so every command can run in a **fresh session**.
That is the main token saving. To change something, re-run the command with the change:
`/fordi flows "add a weekly report screen"`. `/fordi` then tells you which later stages are stale.

## Install

Requirements: Claude Code and Node.js 18 or newer. Optional: a Mobbin MCP connection, used for
references and flow patterns.

```bash
git clone https://github.com/fordi1/fordi-skill.git
```

Link it into your Claude Code skills folder (a junction on Windows, no admin needed), so that
`git pull` updates the skill:

```bash
node fordi-skill/scripts/install.mjs
```

This installs `/fordi` and one shortcut per command: `/fordi-idea`, `/fordi-direction`,
`/fordi-flows`, `/fordi-refs` and `/fordi-prototype`. The shortcuts show up in the slash menu and are
user-only, so they add nothing to the model's context. `/fordi idea "…"` works the same way.
The installer never replaces an existing folder.

Open a new Claude Code session **in your project folder** and type `/fordi`.

## What makes the output not generic

- **Questions before assumptions.** Traits such as offline-first, scheduling or roles are detected
  from the idea. Each one adds required states that every screen must answer (for example `offline`,
  `pending-sync`, `conflict`), or the screen must say `N/A` with a reason.
- **A direction you choose, not the model's default.** The roll breaks the habit of always proposing
  the same look. The category standard is always offered, never recommended.
- **Rules from Impeccable, adapted for Persian.** They include a craft floor, a list of refused
  patterns, and motion with purpose. See [NOTICE.md](NOTICE.md).
- **Checks are code.** `check <stage>` rejects:
  - missing sections, unsourced market rows and unfilled template text;
  - flows that skip a main job, links to screens that do not exist, and missing states;
  - text contrast below 4.5:1;
  - `tabular-nums` on Persian digits, and physical `ml-`/`pr-` utilities in RTL;
  - dead prototype links, and states that were specified but never built;
  - a `DESIGN.md` whose tokens drift from `tokens.css`.
- **The 375px check runs in the browser.** It flags horizontal overflow, clipped or two-line
  buttons, targets under 44px, and uneven rows.

## From prototype to code

- `ux/tokens.css` is a Tailwind v4 `@theme` block. Paste it into your app's CSS.
- `ux/prototype/components.md` lists every reusable component (from `data-component`) and the screens
  that use it.
- The prototype markup uses only Tailwind utilities from the tokens and no inline styles, so a screen
  converts to a React or Vue component by moving markup, not by redesigning.
- `DESIGN.md` (Google's DESIGN.md format) keeps screens built later consistent with the system.

## Scripts

`node scripts/fordi.mjs <command> [--root <project>]`

| Command | Does |
|---|---|
| `status` | Stage states (missing / done / stale) and the next command |
| `check <stage>` | Validates `idea`, `direction`, `flows`, `refs`, `prototype` or `design`; exits 1 on errors |
| `scaffold <stage>` | Copies that stage's templates; never overwrites |
| `roll [--n 7] [--exclude 1,2]` | Deals the direction round |
| `tokens` | Copies `ux/tokens.css` into the prototype |
| `components` | Writes `ux/prototype/components.md` |
| `flowmap` | Renders `ux/flow-map.html` |

## Layout

```text
SKILL.md              router: the command table and the always-on rules (~2KB)
shortcuts/            /fordi-idea … /fordi-prototype, each pointing at its playbook
commands/*.md         one playbook per command (each under 4KB)
rules/design.md       direction, color, Persian type, craft floor, refuse list, motion
rules/persian-rtl.md  Persian and RTL requirements
templates/            the file contracts, plus the prototype shell and viewer
scripts/              fordi.mjs, check.mjs and their tests
```

## What is verified, and what is not

| Verified | How |
|---|---|
| Every check, parser and CLI command | 34 unit tests (`node --test "scripts/*.test.mjs"`) |
| Tailwind v4 CDN reads the tokens (colors, radius, shadow, animation) | Computed styles in a real browser |
| Vazirmatn loads with Persian glyphs; Lucide icons render | Browser |
| Logical `border-s` lands on the right in RTL | Browser |
| The viewer navigates with `data-goto`; the 375px check finds planted problems (two-line button, 32px target) | Browser |

**Not verified yet:**
- a fresh Claude session running all five commands on a real idea;
- the quality of its questions and research;
- how good the directions look.

Please report issues.

## Development

```bash
node --test "scripts/*.test.mjs"
```

The scripts have no dependencies. The previous, heavier design is tagged `v0.7.0`.

## License

MIT, see [LICENSE](LICENSE). Credits for adapted ideas are in [NOTICE.md](NOTICE.md).

---

<div dir="rtl">

## فارسی

**fordi** یک اسکیل برای Claude Code است. ایده‌ی خام را قدم‌به‌قدم به یک پرتوتایپ قابل کلیک می‌رساند
که بشود مستقیم تبدیلش کرد به کد: اول سؤال و تحقیق بازار، بعد جهت بصری، بعد فلو و محتوای هر صفحه،
و در آخر پرتوتایپ. هر مرحله را یک اسکریپت چک می‌کند و قضاوت خود مدل ملاک نیست.

### نصب

```bash
git clone https://github.com/fordi1/fordi-skill.git
```

بعد این دستور، اسکیل و میان‌برهایش را در پوشه‌ی skills نصب می‌کند:

```bash
node fordi-skill/scripts/install.mjs
```

حالا با تایپ `/fordi` شش دستور در لیست می‌آید: `/fordi` و `/fordi-idea`، `/fordi-direction`،
`/fordi-flows`، `/fordi-refs`، `/fordi-prototype`. یک جلسه‌ی تازه‌ی Claude Code را **داخل پوشه‌ی
پروژه‌تان** باز کنید.

### دستورها

| دستور | چه می‌کند | کار شما |
|---|---|---|
| `/fordi` | نشان می‌دهد کجای کار هستید و دستور بعدی چیست | – |
| `/fordi-idea "ایده"` | حداکثر ۲ دور سؤال، بعد تحقیق بازار با منبع | جواب دادن و تأیید |
| `/fordi-direction` | ۷ کاندید بصری از دنیای مخاطب؛ تاس ۳ تا را انتخاب می‌کند و استاندارد رایج این دسته هم کنارشان می‌آید | انتخاب، یا «جسورتر» و «امن‌تر» |
| `/fordi-flows` | فلوها، و برای هر صفحه هدف، بلوک‌ها، دکمه‌ها و stateها | دیدن نقشه‌ی فلو و تأیید |
| `/fordi-refs` | صفحه‌به‌صفحه می‌پرسد از کدام بلوک نمونه دارید | فرستادن عکس، جستجو در Mobbin یا رد کردن |
| `/fordi-prototype` | پرتوتایپ HTML + Tailwind با همه‌ی stateها و انیمیشن، چک ۳۷۵، و در آخر `DESIGN.md` | کلیک کردن و درخواست اصلاح |

هر دستور را ترجیحاً در یک **جلسه‌ی تازه** اجرا کنید؛ هر مرحله فقط فایل‌های مرحله‌های قبل را می‌خواند
و این‌طوری توکن کمتری مصرف می‌شود. برای تغییر، همان دستور را با توضیح بزنید:
`/fordi flows "صفحه‌ی گزارش هفتگی اضافه شود"`.

### قوانین فارسی که اجباری‌اند
- اعداد فارسی هیچ‌وقت `tabular-nums` نمی‌گیرند.
- ردیف ابزارها روی یک خط و هم‌ارتفاع می‌مانند.
- متن دکمه دو خطی نمی‌شود و ارتفاع هر کنترل حداقل ۴۴px است.
- همه‌چیز اول در عرض ۳۷۵ درست می‌شود.
- در Tailwind فقط کلاس‌های منطقی (`ms-`، `pe-`، `text-start`) به کار می‌روند.

</div>
