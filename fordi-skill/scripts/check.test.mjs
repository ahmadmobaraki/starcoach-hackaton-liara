import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  lintText, sections, checkIdea, parseFlows, requiredStates, checkFlows, checkRefs,
  parsePrototype, checkPrototype, checkDirection, checkDesign, checkStage,
} from './check.mjs';

const codes = (list) => list.map((e) => e.code).sort();

const IDEA = `# نوبت‌یار

> مدیر سالن نوبت پرسنل را بدون اینترنت هم می‌چیند.

## مسئله
نوبت‌ها در دفتر کاغذی گم می‌شوند.

## کاربران
- مدیر سالن: پشت پیشخوان، بین دو مشتری.

## کارهای اصلی
1. مدیر نوبت تازه را برای یک پرسنل ثبت می‌کند.
2. پرسنل برنامه‌ی امروزش را می‌بیند.

## بازار
| محصول | برای چه کسی | قوت | جای خالی | منبع |
|---|---|---|---|---|
| نوبتیکا | سالن‌ها | رزرو آنلاین | بدون حالت آفلاین | https://example.com/a |
| Fresha | سالن‌های خارجی | تقویم قوی | فارسی ندارد | https://example.com/b |

## تمایز
کار کامل بدون اینترنت.

## دامنه‌ی نسخه‌ی اول
- داخل: ثبت نوبت
- بیرون: پرداخت آنلاین

## ویژگی‌های اثرگذار
- offline: بیشتر سالن‌ها اینترنت ناپایدار دارند
- scheduling: دو نوبت نباید روی هم بیفتند

## تصمیم‌ها
- تاریخ فقط شمسی است.

## فرض‌ها
- هر سالن یک دستگاه دارد. راه تأیید: پرسیدن از ۳ سالن.
`;

const FLOWS = `# فلوها و صفحه‌ها

## فلوها

### F1: ثبت نوبت تازه
- کاربر: مدیر سالن · کار: ۱

\`\`\`mermaid
flowchart RL
  a --> b
\`\`\`

1. مدیر تقویم امروز را باز می‌کند → S1
2. زمان خالی را انتخاب و فرم را پر می‌کند → S2
   - اگر زمان پر شده باشد: پیام «این زمان گرفته شد» → S2

### F2: دیدن برنامه‌ی امروز
- کاربر: پرسنل · کار: 2

1. پرسنل برنامه را باز می‌کند → S1

## صفحه‌ها

### S1: تقویم امروز
- هدف: دیدن نوبت‌های امروز همه‌ی پرسنل
- در فلو: F1.1, F2.1
- بلوک‌ها:
  1. هدر تاریخ: امروز به شمسی و دکمه‌ی روز بعد
  2. ستون‌های پرسنل با کارت نوبت
- اکشن‌ها:
  - نوبت تازه → S2
- stateها:
  - empty: هنوز نوبتی ثبت نشده، دکمه‌ی «نوبت تازه»
  - loading: اسکلت ستون‌ها
  - error: خواندن داده از دستگاه شکست خورد
  - offline: نوار بالای صفحه «بدون اینترنت؛ ذخیره روی دستگاه»
  - pending-sync: N/A: این صفحه چیزی نمی‌نویسد
  - conflict: N/A: این صفحه چیزی نمی‌نویسد
  - slot-taken: N/A: انتخاب زمان در S2 است

### S2: فرم نوبت
- هدف: ثبت یک نوبت
- در فلو: F1.2
- بلوک‌ها:
  1. انتخاب پرسنل و خدمت
- اکشن‌ها:
  - ذخیره → S1
- stateها:
  - empty: فرم خالی
  - loading: N/A: فرم محلی است
  - error: ذخیره شکست خورد
  - offline: ذخیره روی دستگاه
  - pending-sync: برچسب «در صف همگام‌سازی»
  - conflict: دو دستگاه یک نوبت را عوض کرده‌اند
  - slot-taken: این زمان همین الان گرفته شد
`;

test('1. lintText flags vague words, placeholders, lorem and Arabic letters; fenced code is ignored', () => {
  const text = ['تجربه‌ای یکپارچه', '- کاربر: {one action}', 'TODO later', 'Lorem ipsum', 'كتاب', '```', '{x}', '```',
    'نمی‌خواهیم «مدرن» باشد <!-- slop-ok -->'].join('\n');
  assert.deepEqual(codes(lintText(text, 'a.md')), ['ARABIC_CHAR', 'LOREM', 'PLACEHOLDER', 'PLACEHOLDER', 'VAGUE']);
});

test('2. sections splits a document by its level-2 headings', () => {
  const s = sections('# t\n\n## الف\nیک\n\n## ب\nدو\n### زیر\nسه\n');
  assert.deepEqual(Object.keys(s), ['الف', 'ب']);
  assert.match(s['ب'], /سه/);
});

test('3. a complete idea passes and exposes its jobs and traits', () => {
  const r = checkIdea(IDEA);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.jobs, [1, 2]);
  assert.deepEqual(r.traits, ['offline', 'scheduling']);
});

test('4. idea errors: missing section, empty section, unsourced market, unknown trait', () => {
  const bad = IDEA
    .replace(/## تمایز\n.*\n/, '')
    .replace('- هر سالن یک دستگاه دارد. راه تأیید: پرسیدن از ۳ سالن.', '')
    .replace('https://example.com/b', '')
    .replace('- scheduling:', '- teleport:');
  assert.deepEqual(codes(checkIdea(bad).errors), ['EMPTY_SECTION', 'MARKET_UNSOURCED', 'MISSING_SECTION', 'UNKNOWN_TRAIT']);
});

test('5. a market row may say it has no source only explicitly', () => {
  const r = checkIdea(IDEA.replace('https://example.com/b', 'منبع ندارد: از تجربه‌ی کاربر'));
  assert.deepEqual(r.errors, []);
});

test('6. parseFlows reads flows, steps, targets, screens, blocks, actions and states', () => {
  const { flows, screens } = parseFlows(FLOWS);
  assert.deepEqual(flows.map((f) => f.id), ['F1', 'F2']);
  assert.deepEqual(flows[0].jobs, [1]);
  assert.deepEqual(flows[1].jobs, [2]);
  assert.equal(flows[0].steps, 2);
  assert.deepEqual(flows[0].targets, ['S1', 'S2', 'S2']);
  assert.match(flows[0].mermaid[0], /flowchart RL/);
  assert.deepEqual(screens.map((s) => s.id), ['S1', 'S2']);
  const s1 = screens[0];
  assert.equal(s1.title, 'تقویم امروز');
  assert.equal(s1.blocks.length, 2);
  assert.deepEqual(s1.actions, [{ label: 'نوبت تازه', target: 'S2' }]);
  assert.equal(s1.states.offline, 'نوار بالای صفحه «بدون اینترنت؛ ذخیره روی دستگاه»');
  assert.equal(s1.states['pending-sync'], 'N/A: این صفحه چیزی نمی‌نویسد');
});

test('7. requiredStates = base states plus the states each trait adds', () => {
  assert.deepEqual(requiredStates([]), ['empty', 'loading', 'error']);
  assert.deepEqual(requiredStates(['offline', 'roles']),
    ['empty', 'loading', 'error', 'offline', 'pending-sync', 'conflict', 'permission-denied']);
});

test('8. complete flows pass against the idea', () => {
  const r = checkFlows(FLOWS, checkIdea(IDEA));
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
});

test('9. flow errors: unknown screen, job without a flow, missing state, bare N/A, screen without blocks', () => {
  const bad = FLOWS
    .replace('فرم را پر می‌کند → S2', 'فرم را پر می‌کند → S9')
    .replace('- کاربر: پرسنل · کار: 2', '- کاربر: پرسنل')
    .replace('  - slot-taken: این زمان همین الان گرفته شد\n', '')
    .replace('  - loading: N/A: فرم محلی است', '  - loading: N/A')
    .replace('- بلوک‌ها:\n  1. انتخاب پرسنل و خدمت\n', '');
  assert.deepEqual(codes(checkFlows(bad, checkIdea(IDEA)).errors),
    ['JOB_UNCOVERED', 'NA_WITHOUT_REASON', 'NO_BLOCKS', 'STATE_MISSING', 'UNKNOWN_SCREEN']);
});

test('10. a screen that no flow or action reaches is a warning', () => {
  const extra = `${FLOWS}\n### S3: تنظیمات\n- هدف: تغییر ساعت کاری\n- بلوک‌ها:\n  1. ساعت‌ها\n- stateها:\n  - empty: N/A: همیشه پر است\n  - loading: N/A: محلی\n  - error: ذخیره نشد\n  - offline: کار می‌کند\n  - pending-sync: در صف\n  - conflict: N/A: فقط یک نفر\n  - slot-taken: N/A: زمان انتخاب نمی‌شود\n`;
  assert.deepEqual(codes(checkFlows(extra, checkIdea(IDEA)).warnings), ['UNREACHED_SCREEN']);
});

test('11. refs: every screen answered; a missing local file is an error, a chat-only image a warning', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fordi-refs-'));
  fs.mkdirSync(path.join(root, 'ux', 'refs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'ux', 'refs', 's1.png'), '');
  const { screens } = parseFlows(FLOWS);
  const ok = '### S1: تقویم\n- بلوک ۲: ux/refs/s1.png — بگیر: ستون‌ها — نگیر: رنگ\n\n### S2: فرم\n- رد شد\n';
  assert.deepEqual(checkRefs(ok, screens, root), { errors: [], warnings: [] });

  const bad = '### S1: تقویم\n- بلوک ۲: ux/refs/nope.png — بگیر: ستون‌ها\n- بلوک ۱: (در چت) — بگیر: هدر\n';
  const r = checkRefs(bad, screens, root);
  assert.deepEqual(codes(r.errors), ['REF_FILE_MISSING', 'SCREEN_UNANSWERED']);
  assert.deepEqual(codes(r.warnings), ['REF_CHAT_ONLY']);
});

const PROTO = `<!doctype html><html lang="fa" dir="rtl"><head>
<style type="text/tailwindcss" id="tokens">
@theme { --color-ink: #111; }
</style></head><body>
<main class="wf-frame">
<section class="screen" data-screen="S1" data-title="تقویم">
  <div class="state" data-state="default"><button data-goto="S2" data-component="Button">نوبت تازه</button>
    <article data-component="AppointmentCard"></article><article data-component="AppointmentCard"></article></div>
  <div class="state" data-state="empty"></div><div class="state" data-state="loading"></div>
  <div class="state" data-state="error"></div><div class="state" data-state="offline"></div>
</section>
<section class="screen" data-screen="S2" data-title="فرم">
  <div class="state" data-state="default"><a data-goto="S1/empty" data-component="Button">ذخیره</a></div>
  <div class="state" data-state="empty"></div><div class="state" data-state="error"></div>
  <div class="state" data-state="offline"></div><div class="state" data-state="pending-sync"></div>
  <div class="state" data-state="conflict"></div><div class="state" data-state="slot-taken"></div>
</section></main></body></html>`;

const TOKENS = '@theme { --color-ink: #111; }\n';

test('12. parsePrototype reads screens, states, gotos and components', () => {
  const p = parsePrototype(PROTO);
  assert.deepEqual(Object.keys(p.screens), ['S1', 'S2']);
  assert.ok(p.screens.S2.has('slot-taken'));
  assert.deepEqual(p.gotos, ['S2', 'S1/empty']);
  assert.deepEqual(p.components, { Button: 2, AppointmentCard: 2 });
  assert.equal(p.tokens.trim(), TOKENS.trim());
});

test('13. a prototype with every screen and non-N/A state, valid links and synced tokens passes', () => {
  const r = checkPrototype(PROTO, parseFlows(FLOWS).screens, TOKENS);
  assert.deepEqual(r.errors, []);
});

test('14. prototype errors: missing screen state, dead link, missing action link, stale tokens, inline style', () => {
  const bad = PROTO
    .replace('<div class="state" data-state="slot-taken"></div>', '')
    .replace('data-goto="S1/empty"', 'data-goto="S7"')
    .replace('<article data-component="AppointmentCard"></article><article', '<article style="color:red"></article><article');
  const r = checkPrototype(bad, parseFlows(FLOWS).screens, '@theme { --color-ink: #222; }');
  assert.deepEqual(codes(r.errors), ['ACTION_NOT_LINKED', 'DEAD_LINK', 'STATE_NOT_BUILT', 'TOKENS_OUT_OF_SYNC']);
  assert.deepEqual(codes(r.warnings), ['INLINE_STYLE']);
});

const DIRECTION = `# جهت بصری: دفتر نوبت

## حالت استفاده
Operate: مدیر سریع نوبت ثبت می‌کند.

## صحنه
پیشخوان روشن سالن، روز، بین دو مشتری؛ پس روشن.

## ایده
## دنیای بصری
برگه‌های دفتر نوبت با نوارهای رنگی پرسنل.

## اولین نما
تقویم امروز با ستون هر پرسنل.

## لحظه‌ی شاخص
کشیدن کارت نوبت بین ستون‌ها.

## رنگ
Restrained

## تایپوگرافی
Vazirmatn

## ریسک
شبیه تقویم‌های معمولی شود.
`;

test('15. direction needs every section filled and tokens with colors and a font', () => {
  const ok = DIRECTION.replace('## ایده\n', '## ایده\nهر پرسنل یک نوار.\n');
  const tokens = '@theme {\n  --color-ink: #1b1b1b;\n  --font-sans: Vazirmatn, sans-serif;\n}\n';
  assert.deepEqual(checkDirection(ok, tokens).errors, []);
  assert.deepEqual(codes(checkDirection(DIRECTION, '@theme { --radius-md: 8px; }').errors),
    ['EMPTY_SECTION', 'TOKENS_NO_COLOR', 'TOKENS_NO_FONT']);
});

test('16. DESIGN.md needs frontmatter tokens, canonical section order and every token color', () => {
  const tokens = '@theme { --color-ink: #1B1B1B; --color-rose: #c2410c; --font-sans: Vazirmatn; }';
  const ok = `---\nname: نوبت‌یار\ncolors:\n  ink: "#1b1b1b"\n  rose: "#C2410C"\ntypography:\n  body:\n    fontFamily: Vazirmatn\n---\n\n# Design System: نوبت‌یار\n\n## Overview\nx\n\n## Colors\nx\n\n## Typography\nx\n\n## Components\nx\n`;
  assert.deepEqual(checkDesign(ok, tokens).errors, []);
  const bad = ok.replace('  rose: "#C2410C"\n', '').replace('## Colors\nx\n\n## Typography', '## Typography\nx\n\n## Colors');
  assert.deepEqual(codes(checkDesign(bad, tokens).errors), ['DESIGN_COLOR_MISSING', 'DESIGN_ORDER']);
  assert.deepEqual(codes(checkDesign('# no frontmatter', tokens).errors), ['DESIGN_NO_FRONTMATTER']);
});

test('17. checkStage reads the project files and lints what the stage wrote', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fordi-stage-'));
  fs.mkdirSync(path.join(root, 'ux'));
  assert.deepEqual(codes(checkStage(root, 'idea').errors), ['FILE_MISSING']);
  fs.writeFileSync(path.join(root, 'ux', 'idea.md'), IDEA);
  assert.equal(checkStage(root, 'idea').ok, true);
  fs.writeFileSync(path.join(root, 'ux', 'idea.md'), IDEA.replace('کار کامل بدون اینترنت.', 'تجربه‌ای یکپارچه'));
  assert.deepEqual(codes(checkStage(root, 'idea').errors), ['VAGUE']);
  fs.writeFileSync(path.join(root, 'ux', 'idea.md'), IDEA);
  fs.writeFileSync(path.join(root, 'ux', 'flows.md'), FLOWS);
  assert.equal(checkStage(root, 'flows').ok, true);
  assert.throws(() => checkStage(root, 'nope'), /unknown stage/);
});

test('18. direction: an unfilled token value in tokens.css is an error', () => {
  const ok = DIRECTION.replace('## ایده\n', '## ایده\nهر پرسنل یک نوار.\n');
  const tokens = '@theme {\n  --color-ink: {main text};\n  --font-sans: Vazirmatn;\n}\n';
  assert.deepEqual(codes(checkDirection(ok, tokens).errors), ['TOKENS_PLACEHOLDER']);
});

test('19. direction: text colors below WCAG contrast on their background are errors', () => {
  const ok = DIRECTION.replace('## ایده\n', '## ایده\nهر پرسنل یک نوار.\n');
  const good = '@theme { --font-sans: Vazirmatn; --color-bg: #ffffff; --color-ink: #1b1b1b; --color-muted: #5f5f5a; --color-accent: #0f5c4d; --color-accent-ink: #ffffff; }';
  assert.deepEqual(checkDirection(ok, good).errors, []);
  const bad = good.replace('#5f5f5a', '#b0b0b0').replace('--color-accent-ink: #ffffff', '--color-accent-ink: #1a6b5c');
  const r = checkDirection(ok, bad).errors;
  assert.deepEqual(codes(r), ['LOW_CONTRAST', 'LOW_CONTRAST']);
  assert.match(r[0].message, /muted on bg/);
});

test('20. prototype: tabular-nums is an error, physical left/right utilities a warning', () => {
  const html = PROTO.replace('<button data-goto="S2"', '<button class="ml-2 text-right tabular-nums" data-goto="S2"');
  const r = checkPrototype(html, parseFlows(FLOWS).screens, TOKENS);
  assert.deepEqual(codes(r.errors), ['TABULAR_NUMS']);
  assert.deepEqual(codes(r.warnings), ['PHYSICAL_DIRECTION']);
  assert.match(r.warnings[0].message, /ml-2, text-right/);
});

test('21. prototype: attributes inside HTML comments are ignored', () => {
  const p = parsePrototype('<!-- Links: data-goto="S2"; pieces carry data-component="PascalName" --><section data-screen="S1"><div data-state="default"></div></section>');
  assert.deepEqual(p.gotos, []);
  assert.deepEqual(p.components, {});
});
