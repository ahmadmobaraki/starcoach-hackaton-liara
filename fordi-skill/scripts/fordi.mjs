#!/usr/bin/env node
// fordi CLI: the bookkeeping the model should not do by hand.
//   status              which stage files exist, which are stale, and the next command
//   check <stage>       validate a stage (see check.mjs)
//   scaffold <stage>    copy that stage's templates into the project (never overwrites)
//   roll [--n 7] [--exclude 1,2]   deal the direction round: a lead and two alternates
//   tokens              copy ux/tokens.css into the prototype's tokens block
//   components          write ux/prototype/components.md from data-component attributes
//   flowmap             render ux/flow-map.html from the diagrams in ux/flows.md
// Zero dependencies. Every command takes --root <dir> (default: current directory).

import fs from 'node:fs';
import path from 'node:path';
import { randomInt } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { checkStage, parseFlows, parsePrototype } from './check.mjs';

const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// stage -> the file that proves it, the files it is built from, and the command that makes it
const PIPELINE = [
  { stage: 'idea', file: 'ux/idea.md', from: [], command: 'idea' },
  { stage: 'direction', file: 'ux/tokens.css', from: ['ux/idea.md'], command: 'direction' },
  { stage: 'flows', file: 'ux/flows.md', from: ['ux/idea.md'], command: 'flows' },
  { stage: 'refs', file: 'ux/refs.md', from: ['ux/flows.md'], command: 'refs' },
  { stage: 'prototype', file: 'ux/prototype/index.html', from: ['ux/tokens.css', 'ux/flows.md', 'ux/refs.md'], command: 'prototype' },
  { stage: 'design', file: 'DESIGN.md', from: ['ux/prototype/index.html'], command: 'prototype' },
];
const OWN = new Set(['ux', 'DESIGN.md']);

const mtime = (root, rel) => {
  try { return fs.statSync(path.join(root, rel)).mtimeMs; } catch { return null; }
};

export function status(root) {
  const stages = PIPELINE.map(({ stage, file, from, command }) => {
    const own = mtime(root, file);
    let state = 'missing';
    if (own !== null) {
      const newer = from.filter((dep) => (mtime(root, dep) ?? 0) > own);
      state = newer.length ? 'stale' : 'done';
      return { stage, file, command, state, ...(newer.length && { newer }) };
    }
    return { stage, file, command, state };
  });
  const next = stages.find((s) => s.state !== 'done')?.command ?? null;
  const foreign = fs.existsSync(root)
    ? fs.readdirSync(root).filter((name) => !name.startsWith('.') && !OWN.has(name)).sort()
    : [];
  return { stages, next, foreign };
}

export function roll({ n = 7, exclude = [], random } = {}) {
  const left = Array.from({ length: n }, (_, i) => i + 1).filter((c) => !exclude.includes(c));
  if (left.length === 0) throw new Error('no candidates left; derive new candidates before re-rolling');
  const pick = () => left.splice(random ? Math.floor(random() * left.length) : randomInt(left.length), 1)[0];
  const lead = pick();
  const alternates = [];
  while (alternates.length < 2 && left.length) alternates.push(pick());
  return { lead, alternates };
}

const TOKENS_BLOCK = /(<style[^>]*id="tokens"[^>]*>)[\s\S]*?(<\/style>)/;

export function syncTokens(root) {
  const tokens = fs.readFileSync(path.join(root, 'ux/tokens.css'), 'utf8');
  const file = path.join(root, 'ux/prototype/index.html');
  const html = fs.readFileSync(file, 'utf8');
  if (!TOKENS_BLOCK.test(html)) throw new Error('no tokens block (<style type="text/tailwindcss" id="tokens">) in the prototype');
  fs.writeFileSync(file, html.replace(TOKENS_BLOCK, (_, open, close) => `${open}\n${tokens.trim()}\n${close}`));
  return { synced: 'ux/prototype/index.html' };
}

const TEMPLATES = {
  idea: [['idea.md', 'ux/idea.md']],
  direction: [['direction.md', 'ux/direction.md'], ['tokens.css', 'ux/tokens.css'], ['direction.html', 'ux/direction.html']],
  flows: [['flows.md', 'ux/flows.md']],
  refs: [['refs.md', 'ux/refs.md']],
  prototype: [['prototype/index.html', 'ux/prototype/index.html']],
};
// Generated viewer files: always refreshed, never edited by hand.
const ALWAYS = { prototype: [['prototype/viewer.js', 'ux/prototype/viewer.js'], ['prototype/viewer.css', 'ux/prototype/viewer.css']] };

export function scaffold(root, stage, skillDir = SKILL_DIR) {
  if (!(stage in TEMPLATES)) throw new Error(`nothing to scaffold for "${stage}"; use ${Object.keys(TEMPLATES).join(', ')}`);
  const created = [];
  const kept = [];
  const copy = ([src, dest], overwrite) => {
    const to = path.join(root, dest);
    const existed = fs.existsSync(to);
    if (existed && !overwrite) { kept.push(dest); return; }
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(path.join(skillDir, 'templates', src), to);
    if (!existed) created.push(dest);
  };
  for (const pair of TEMPLATES[stage]) copy(pair, false);
  for (const pair of ALWAYS[stage] ?? []) copy(pair, true);
  return { created, kept };
}

const fa = (n) => n.toLocaleString('fa-IR', { useGrouping: false });

export function components(root) {
  const html = fs.readFileSync(path.join(root, 'ux/prototype/index.html'), 'utf8');
  const { chunks, components: counts } = parsePrototype(html);
  const list = Object.entries(counts).map(([name, count]) => ({
    name,
    count,
    screens: Object.keys(chunks).filter((id) => chunks[id].includes(`data-component="${name}"`)),
  }));
  const rows = list.map((c) => `| ${c.name} | ${fa(c.count)} | ${c.screens.join('، ')} |`).join('\n');
  const md = `# نقشه‌ی کامپوننت‌ها\n\n> ساخته‌شده با \`fordi.mjs components\` از روی \`data-component\`ها؛ دستی ویرایش نکنید.\n> هر ردیف یک کامپوننت قابل‌استفاده‌ی دوباره در کد است.\n\n| کامپوننت | تعداد | صفحه‌ها |\n|---|---|---|\n${rows}\n`;
  fs.writeFileSync(path.join(root, 'ux/prototype/components.md'), md);
  return { components: list };
}

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function renderFlowMap(flows, { projectName, generatedAt }) {
  const nav = flows.map((f) => `<li><a href="#${escapeHtml(f.id)}">${escapeHtml(f.id)} · ${escapeHtml(f.title)}</a></li>`).join('\n');
  const body = flows.map((f) => {
    const diagrams = f.mermaid.length
      ? f.mermaid.map((d) => `<div class="diagram"><pre class="mermaid">${escapeHtml(d)}</pre></div>`).join('\n')
      : '<p class="empty">این فلو هنوز دیاگرام ندارد.</p>';
    return `<section id="${escapeHtml(f.id)}">\n<h2>${escapeHtml(f.id)} · ${escapeHtml(f.title)}</h2>\n${diagrams}\n</section>`;
  }).join('\n');
  return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>نقشه‌ی فلو · ${escapeHtml(projectName)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;700&display=swap">
<style>
  :root { --bg: #f6f6f5; --surface: #ffffff; --text: #1d1d1b; --muted: #6b6b66; --line: #d9d9d4; }
  @media (prefers-color-scheme: dark) { :root { --bg: #161615; --surface: #1f1f1e; --text: #ececea; --muted: #a3a39e; --line: #3a3a37; } }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text); font: 16px/1.8 Vazirmatn, Tahoma, sans-serif; }
  header, main { max-width: 1100px; margin: 0 auto; padding: 16px; }
  h1 { margin: 8px 0 0; font-size: 1.5rem; }
  .meta { color: var(--muted); font-size: .875rem; margin: 4px 0 12px; }
  nav ul { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 8px; }
  nav a { display: inline-block; white-space: nowrap; min-height: 44px; padding: 8px 14px; border: 1px solid var(--line);
          border-radius: 8px; background: var(--surface); color: var(--text); text-decoration: none; }
  section { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 16px; margin: 16px 0; }
  h2 { margin: 0 0 12px; font-size: 1.125rem; }
  .diagram { overflow-x: auto; }
  pre.mermaid { margin: 0; white-space: pre; direction: ltr; text-align: left; }
  .empty { color: var(--muted); }
</style>
</head>
<body>
<header>
<h1>نقشه‌ی فلو</h1>
<p class="meta"><bdi>${escapeHtml(projectName)}</bdi> · ساخته‌شده ${escapeHtml(generatedAt)} · از روی <bdi>ux/flows.md</bdi> ساخته می‌شود؛ دستی ویرایشش نکنید. برای دیاگرام‌ها اینترنت لازم است.</p>
<nav><ul>
${nav}
</ul></nav>
</header>
<main>
${body}
</main>
<script type="module">
  import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  mermaid.initialize({ startOnLoad: true, theme: dark ? 'dark' : 'neutral', fontFamily: 'Vazirmatn, Tahoma, sans-serif' });
</script>
</body>
</html>
`;
}

export function flowMap(root) {
  const { flows } = parseFlows(fs.readFileSync(path.join(root, 'ux/flows.md'), 'utf8'));
  if (flows.length === 0) throw new Error('no "### F1: …" flows in ux/flows.md');
  const ideaPath = path.join(root, 'ux/idea.md');
  const title = fs.existsSync(ideaPath) ? fs.readFileSync(ideaPath, 'utf8').match(/^#\s+(.+)$/m)?.[1]?.trim() : null;
  const html = renderFlowMap(flows, {
    projectName: title || path.basename(path.resolve(root)),
    // Solar Hijri date with Persian digits, e.g. «۲ مهر ۱۴۰۵».
    generatedAt: new Intl.DateTimeFormat('fa-IR-u-ca-persian', { dateStyle: 'long' }).format(new Date()),
  });
  fs.writeFileSync(path.join(root, 'ux/flow-map.html'), html);
  return { path: 'ux/flow-map.html', flows: flows.length };
}

// ---------- CLI ----------
const isMain = process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const flag = (name) => { const i = args.indexOf(`--${name}`); return i === -1 ? undefined : args[i + 1]; };
  const root = flag('root') ?? process.cwd();
  const [cmd, arg] = args;
  const out = (v) => process.stdout.write(`${JSON.stringify(v, null, 2)}\n`);
  try {
    switch (cmd) {
      case 'status': out(status(root)); break;
      case 'check': { const r = checkStage(root, arg); out(r); process.exit(r.ok ? 0 : 1); break; }
      case 'scaffold': out(scaffold(root, arg)); break;
      case 'roll': out(roll({ n: Number(flag('n') ?? 7), exclude: (flag('exclude') ?? '').split(',').filter(Boolean).map(Number) })); break;
      case 'tokens': out(syncTokens(root)); break;
      case 'components': out(components(root)); break;
      case 'flowmap': out(flowMap(root)); break;
      default:
        process.stderr.write('usage: fordi.mjs status | check <stage> | scaffold <stage> | roll [--n 7] [--exclude 1,2] | tokens | components | flowmap  [--root <dir>]\n');
        process.exit(2);
    }
  } catch (e) {
    process.stderr.write(`${JSON.stringify({ error: e.message })}\n`);
    process.exit(2);
  }
}
