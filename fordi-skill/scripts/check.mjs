#!/usr/bin/env node
// fordi check: validates what each stage wrote, so the model never checks by eye.
// One function per stage file; checkStage() reads the project and runs the right ones plus the slop lint.
// Zero dependencies. The formats parsed here are the contract described in templates/.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------- shared text helpers ----------

export function* proseLines(text) {
  let fenced = false;
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) { fenced = !fenced; continue; }
    if (!fenced) yield [lines[i], i + 1];
  }
}

const faDigits = (s) => s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
const numbered = /^\s*[\d۰-۹]+[.)]\s+\S/;

/** Level-2 sections: { heading: body } in document order. */
export function sections(text) {
  const out = {};
  let current = null;
  for (const [line] of proseLines(text)) {
    const h = line.match(/^##\s+(.+?)\s*$/);
    if (h) { current = h[1]; out[current] = ''; } else if (current !== null) out[current] += `${line}\n`;
  }
  return out;
}

const filled = (body) => (body ?? '').split('\n').some((l) => l.trim() && !/^\s*[-*|]?\s*$/.test(l));

// ---------- slop lint ----------

export const VAGUE_WORDS = [
  'یکپارچه', 'کاربرپسند', 'بی‌نظیر', 'حرفه‌ای', 'جذاب', 'مدرن', 'شگفت‌انگیز', 'فوق‌العاده', 'بی‌دردسر',
  'seamless', 'intuitive', 'user-friendly', 'modern', 'robust', 'cutting-edge', 'delightful',
  'effortless', 'world-class',
];
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Persian has no \b; letters and ZWNJ count as word characters.
const VAGUE = new RegExp(`(?<![\\p{L}\\u200c-])(${VAGUE_WORDS.map(escapeRe).join('|')})(?![\\p{L}\\u200c-])`, 'giu');
const PLACEHOLDER = /\{[^{}\n]{1,80}\}|\b(TBD|TODO|FIXME)\b|\?\?\?/g;
const LOREM = /lorem ipsum/i;
const ARABIC = /[يك]/;

export function lintText(text, file) {
  const issues = [];
  const add = (code, n, message) => issues.push({ code, at: `${file}:${n}`, message });
  for (const [line, n] of proseLines(text)) {
    if (line.includes('<!-- slop-ok -->')) continue;
    for (const m of line.matchAll(VAGUE)) add('VAGUE', n, `"${m[1]}" says nothing specific; describe what actually happens`);
    for (const m of line.matchAll(PLACEHOLDER)) add('PLACEHOLDER', n, `unfilled placeholder "${m[0]}"`);
    if (LOREM.test(line)) add('LOREM', n, 'use real Persian content, not lorem ipsum');
    if (ARABIC.test(line)) add('ARABIC_CHAR', n, 'Arabic ي/ك; use Persian ی/ک');
  }
  return issues;
}

// ---------- idea ----------

export const IDEA_SECTIONS = ['مسئله', 'کاربران', 'کارهای اصلی', 'بازار', 'تمایز', 'دامنه‌ی نسخه‌ی اول',
  'ویژگی‌های اثرگذار', 'تصمیم‌ها', 'فرض‌ها'];

// Traits change which states every screen must answer for. Keys are written in ux/idea.md.
export const TRAIT_STATES = {
  offline: ['offline', 'pending-sync', 'conflict'],
  scheduling: ['slot-taken'],
  roles: ['permission-denied'],
  messages: ['message-failed'],
  money: [],
  'personal-data': [],
  branches: [],
};
export const BASE_STATES = ['empty', 'loading', 'error'];

export function checkIdea(text, file = 'ux/idea.md') {
  const errors = [];
  const s = sections(text);
  const err = (code, message) => errors.push({ code, at: file, message });

  for (const name of IDEA_SECTIONS) {
    if (!(name in s)) err('MISSING_SECTION', `section "## ${name}" is missing`);
    else if (!filled(s[name])) err('EMPTY_SECTION', `section "## ${name}" is empty`);
  }

  const jobs = (s['کارهای اصلی'] ?? '').split('\n').filter((l) => numbered.test(l)).map((_, i) => i + 1);

  const rows = (s['بازار'] ?? '').split('\n')
    .filter((l) => l.trim().startsWith('|') && !/^\s*\|[\s|:-]+\|?\s*$/.test(l)).slice(1);
  if ('بازار' in s && rows.length < 2) err('MARKET_THIN', 'the market table needs at least 2 products');
  for (const row of rows) {
    if (!/https?:\/\/\S+|منبع ندارد/.test(row)) {
      err('MARKET_UNSOURCED', `market row has no link and does not say «منبع ندارد»: ${row.trim().slice(0, 60)}`);
    }
  }

  const traits = [];
  for (const line of (s['ویژگی‌های اثرگذار'] ?? '').split('\n')) {
    const m = line.match(/^\s*-\s*([a-z-]+)\s*:/);
    if (!m) continue;
    if (m[1] in TRAIT_STATES) traits.push(m[1]);
    else err('UNKNOWN_TRAIT', `unknown trait "${m[1]}"; use one of ${Object.keys(TRAIT_STATES).join(', ')}`);
  }
  return { errors, warnings: [], jobs, traits };
}

// ---------- flows ----------

export function parseFlows(text) {
  const flows = [];
  const screens = [];
  let part = null; // 'flows' | 'screens'
  let flow = null;
  let screen = null;
  let field = null;
  let fence = null;

  for (const raw of text.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(raw)) {
      if (fence === null) fence = [];
      else { if (flow) flow.mermaid.push(fence.join('\n')); fence = null; }
      continue;
    }
    if (fence !== null) { fence.push(raw); continue; }

    const h2 = raw.match(/^##\s+(.+?)\s*$/);
    if (h2) { part = h2[1].includes('صفحه') ? 'screens' : h2[1].includes('فلو') ? 'flows' : null; flow = screen = null; continue; }
    const h3 = raw.match(/^###\s+([FS]\d+)\s*[:：]\s*(.*?)\s*$/);
    if (h3 && h3[1][0] === 'F' && part === 'flows') {
      flow = { id: h3[1], title: h3[2], jobs: [], steps: 0, targets: [], mermaid: [] };
      flows.push(flow);
      continue;
    }
    if (h3 && h3[1][0] === 'S' && part === 'screens') {
      screen = { id: h3[1], title: h3[2], goal: '', inFlows: [], blocks: [], actions: [], states: {} };
      screens.push(screen);
      field = null;
      continue;
    }

    if (flow && part === 'flows') {
      const jobs = raw.match(/(?:^|[\s·])کار\s*:\s*([\d۰-۹،,\s]+)/);
      if (jobs) flow.jobs.push(...faDigits(jobs[1]).split(/[،,\s]+/).filter(Boolean).map(Number));
      if (/^[\d۰-۹]+[.)]\s+\S/.test(raw)) flow.steps++;
      for (const m of raw.matchAll(/→\s*(S\d+)/g)) flow.targets.push(m[1]);
    }

    if (screen && part === 'screens') {
      const top = raw.match(/^-\s*([^:]+?)\s*:\s*(.*)$/);
      if (top) {
        const [, key, value] = top;
        field = key;
        if (key === 'هدف') screen.goal = value;
        else if (key === 'در فلو') screen.inFlows = value.split(/[،,\s]+/).filter(Boolean);
        continue;
      }
      const item = raw.match(/^\s+(?:-|[\d۰-۹]+[.)])\s*(.+)$/);
      if (!item) continue;
      if (field === 'بلوک‌ها') screen.blocks.push(item[1]);
      else if (field === 'اکشن‌ها') {
        const a = item[1].match(/^(.*?)\s*→\s*(S\d+)/);
        if (a) screen.actions.push({ label: a[1], target: a[2] });
      } else if (field === 'stateها') {
        const st = item[1].match(/^([a-z][a-z-]*)\s*:\s*(.*)$/);
        if (st) screen.states[st[1]] = st[2].trim();
      }
    }
  }
  return { flows, screens };
}

export const requiredStates = (traits) => [...BASE_STATES, ...traits.flatMap((t) => TRAIT_STATES[t] ?? [])];
const isNA = (v) => /^N\/A\b/.test(v ?? '');

export function checkFlows(text, idea, file = 'ux/flows.md') {
  const errors = [];
  const warnings = [];
  const err = (code, message) => errors.push({ code, at: file, message });
  const { flows, screens } = parseFlows(text);
  const ids = new Set(screens.map((s) => s.id));

  if (flows.length === 0) err('NO_FLOWS', 'no "### F1: …" flow under "## فلوها"');
  if (screens.length === 0) err('NO_SCREENS', 'no "### S1: …" screen under "## صفحه‌ها"');

  for (const f of flows) {
    if (f.steps === 0) err('NO_STEPS', `${f.id} has no numbered steps`);
    for (const t of f.targets) if (!ids.has(t)) err('UNKNOWN_SCREEN', `${f.id} goes to ${t}, which is not a screen`);
  }
  const covered = new Set(flows.flatMap((f) => f.jobs));
  for (const j of idea?.jobs ?? []) {
    if (!covered.has(j)) err('JOB_UNCOVERED', `main job ${j} in idea.md has no flow ("- کاربر: … · کار: ${j}")`);
  }

  const required = requiredStates(idea?.traits ?? []);
  const reached = new Set([...flows.flatMap((f) => f.targets), ...screens.flatMap((s) => s.actions.map((a) => a.target))]);
  for (const s of screens) {
    if (!s.goal) err('NO_GOAL', `${s.id} has no "- هدف:"`);
    if (s.blocks.length === 0) err('NO_BLOCKS', `${s.id} has no "- بلوک‌ها:" list`);
    for (const a of s.actions) if (!ids.has(a.target)) err('UNKNOWN_SCREEN', `${s.id} action "${a.label}" goes to ${a.target}, which is not a screen`);
    for (const st of required) {
      if (!(st in s.states)) err('STATE_MISSING', `${s.id} does not answer state "${st}" (describe it or write "N/A: reason")`);
      else if (/^N\/A\s*:?\s*$/.test(s.states[st])) err('NA_WITHOUT_REASON', `${s.id} state "${st}" is N/A without a reason`);
    }
    if (!reached.has(s.id)) warnings.push({ code: 'UNREACHED_SCREEN', at: file, message: `${s.id} is not reached by any flow step or action` });
  }
  return { errors, warnings, flows, screens };
}

// ---------- refs ----------

export function checkRefs(text, screens, root, file = 'ux/refs.md') {
  const errors = [];
  const warnings = [];
  const answered = new Map();
  let current = null;
  for (const [line] of proseLines(text)) {
    const h = line.match(/^###\s+(S\d+)/);
    if (h) { current = h[1]; answered.set(current, 0); continue; }
    if (current && /^\s*-\s+\S/.test(line)) {
      answered.set(current, answered.get(current) + 1);
      for (const m of line.matchAll(/ux\/refs\/[^\s—)،,]+/g)) {
        if (!fs.existsSync(path.join(root, m[0]))) errors.push({ code: 'REF_FILE_MISSING', at: file, message: `${current}: ${m[0]} does not exist` });
      }
      if (line.includes('(در چت)')) warnings.push({ code: 'REF_CHAT_ONLY', at: file, message: `${current}: image exists only in chat; save it to ux/refs/ to keep it` });
    }
  }
  for (const s of screens) {
    if (!answered.get(s.id)) errors.push({ code: 'SCREEN_UNANSWERED', at: file, message: `${s.id} has no refs entry (an image, or «رد شد»)` });
  }
  return { errors, warnings };
}

// ---------- prototype ----------

const TOKENS_BLOCK = /<style[^>]*type="text\/tailwindcss"[^>]*id="tokens"[^>]*>([\s\S]*?)<\/style>|<style[^>]*id="tokens"[^>]*type="text\/tailwindcss"[^>]*>([\s\S]*?)<\/style>/;
const squash = (s) => (s ?? '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').trim();

export function parsePrototype(source) {
  const html = source.replace(/<!--[\s\S]*?-->/g, '');
  const screens = {};
  const chunks = {};
  for (const part of html.split(/<section\b/).slice(1)) {
    const id = part.match(/^[^>]*data-screen="([^"]+)"/)?.[1];
    if (!id) continue;
    screens[id] = new Set([...part.matchAll(/data-state="([^"]+)"/g)].map((m) => m[1]));
    chunks[id] = part;
  }
  const gotos = [...html.matchAll(/data-goto="([^"]+)"/g)].map((m) => m[1]);
  const components = {};
  for (const m of html.matchAll(/data-component="([^"]+)"/g)) components[m[1]] = (components[m[1]] ?? 0) + 1;
  const t = html.match(TOKENS_BLOCK);
  const inlineStyles = [...html.matchAll(/<[a-z][^>]*\sstyle="/gi)].length;
  return { screens, chunks, gotos, components, tokens: t ? (t[1] ?? t[2]) : null, inlineStyles };
}

const PHYSICAL = /^-?(?:ml|mr|pl|pr|left|right|border-l|border-r|rounded-l|rounded-r|rounded-tl|rounded-tr|rounded-bl|rounded-br)(?:-|$)|^text-(?:left|right)$/;

export function checkPrototype(html, screens, tokensCss, file = 'ux/prototype/index.html') {
  const errors = [];
  const warnings = [];
  const err = (code, message) => errors.push({ code, at: file, message });
  const p = parsePrototype(html);

  for (const s of screens) {
    const built = p.screens[s.id];
    if (!built) { err('SCREEN_NOT_BUILT', `${s.id} (${s.title}) has no <section data-screen="${s.id}">`); continue; }
    const wanted = ['default', ...Object.entries(s.states).filter(([, v]) => !isNA(v)).map(([k]) => k)];
    for (const st of wanted) if (!built.has(st)) err('STATE_NOT_BUILT', `${s.id} has no data-state="${st}"`);
    for (const a of s.actions) {
      const linked = [...p.chunks[s.id].matchAll(/data-goto="([^"/]+)/g)].some((m) => m[1] === a.target);
      if (!linked) err('ACTION_NOT_LINKED', `${s.id} action "${a.label}" has no data-goto="${a.target}"`);
    }
  }
  for (const g of p.gotos) {
    const [screen, state] = g.split('/');
    if (!p.screens[screen] || (state && !p.screens[screen].has(state))) err('DEAD_LINK', `data-goto="${g}" points nowhere`);
  }
  if (p.tokens === null) err('TOKENS_MISSING', 'no <style type="text/tailwindcss" id="tokens"> block; run "fordi.mjs tokens"');
  else if (squash(p.tokens) !== squash(tokensCss)) err('TOKENS_OUT_OF_SYNC', 'tokens block differs from ux/tokens.css; run "fordi.mjs tokens"');
  const classes = [...html.replace(/<!--[\s\S]*?-->/g, '').matchAll(/\sclass="([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/)).filter(Boolean);
  if (classes.some((c) => c.split(':').pop() === 'tabular-nums') || /tabular-nums/.test(p.tokens ?? '')) {
    err('TABULAR_NUMS', 'tabular-nums on Persian digits renders wide gaps; keep numerals proportional');
  }
  const physical = [...new Set(classes.filter((c) => PHYSICAL.test(c.split(':').pop())))];
  if (physical.length) warnings.push({ code: 'PHYSICAL_DIRECTION', at: file, message: `physical left/right utilities in RTL: ${physical.slice(0, 8).join(', ')}; use ms-/me-/ps-/pe-/start-/end-/text-start/text-end` });
  if (p.inlineStyles) warnings.push({ code: 'INLINE_STYLE', at: file, message: `${p.inlineStyles} inline style attribute(s); use Tailwind classes so the markup converts to code` });
  return { errors, warnings, components: p.components };
}

// ---------- direction ----------

// WCAG 2 contrast between two hex colors.
const CONTRAST_PAIRS = [['ink', 'bg'], ['muted', 'bg'], ['accent-ink', 'accent'], ['ink', 'surface'], ['muted', 'surface']];
const luminance = (hex) => {
  let h = hex.slice(1);
  if (h.length <= 4) h = [...h].map((c) => c + c).join('');
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

export const DIRECTION_SECTIONS = ['حالت استفاده', 'صحنه', 'ایده', 'دنیای بصری', 'اولین نما', 'لحظه‌ی شاخص', 'رنگ', 'تایپوگرافی', 'ریسک'];

export function checkDirection(text, tokensCss, file = 'ux/direction.md') {
  const errors = [];
  const s = sections(text);
  for (const name of DIRECTION_SECTIONS) {
    if (!(name in s)) errors.push({ code: 'MISSING_SECTION', at: file, message: `section "## ${name}" is missing` });
    else if (!filled(s[name])) errors.push({ code: 'EMPTY_SECTION', at: file, message: `section "## ${name}" is empty` });
  }
  const t = tokensCss ?? '';
  if (!/@theme\b/.test(t)) errors.push({ code: 'TOKENS_NO_THEME', at: 'ux/tokens.css', message: 'no @theme block' });
  if (!/--color-[\w-]+\s*:/.test(t)) errors.push({ code: 'TOKENS_NO_COLOR', at: 'ux/tokens.css', message: 'no --color-* token' });
  if (!/--font-[\w-]+\s*:/.test(t)) errors.push({ code: 'TOKENS_NO_FONT', at: 'ux/tokens.css', message: 'no --font-* token' });
  const color = (name) => t.match(new RegExp(`--color-${name}\\s*:\\s*(#[0-9a-f]{3,8})\\b`, 'i'))?.[1];
  for (const [fg, bg] of CONTRAST_PAIRS) {
    const a = color(fg);
    const b = color(bg);
    if (!a || !b) continue;
    const ratio = contrast(a, b);
    if (ratio < 4.5) errors.push({ code: 'LOW_CONTRAST', at: 'ux/tokens.css', message: `${fg} on ${bg} is ${ratio.toFixed(2)}:1; text needs at least 4.5:1` });
  }
  for (const m of t.matchAll(/(--[\w-]+)\s*:[^;{}]*\{[^{}]*\}/g)) {
    errors.push({ code: 'TOKENS_PLACEHOLDER', at: 'ux/tokens.css', message: `${m[1]} still holds a template value` });
  }
  return { errors, warnings: [] };
}

// ---------- DESIGN.md ----------

export const DESIGN_SECTIONS = ['Overview', 'Colors', 'Typography', 'Layout', 'Elevation & Depth', 'Shapes', 'Components', "Do's and Don'ts"];

export function checkDesign(text, tokensCss, file = 'DESIGN.md') {
  const errors = [];
  const err = (code, message) => errors.push({ code, at: file, message });
  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) { err('DESIGN_NO_FRONTMATTER', 'DESIGN.md must start with YAML frontmatter holding the tokens'); return { errors, warnings: [] }; }
  const front = fm[1].toLowerCase();
  if (!/^colors:/m.test(front) || !/^typography:/m.test(front)) err('DESIGN_NO_TOKENS', 'frontmatter needs colors: and typography:');
  for (const m of (tokensCss ?? '').matchAll(/--color-([\w-]+)\s*:\s*([^;]+);/g)) {
    if (!front.includes(m[2].trim().toLowerCase())) err('DESIGN_COLOR_MISSING', `token --color-${m[1]} (${m[2].trim()}) is not in the frontmatter`);
  }
  const order = [...text.matchAll(/^##\s+(.+?)\s*$/gm)].map((m) => DESIGN_SECTIONS.indexOf(m[1])).filter((i) => i >= 0);
  if (order.some((v, i) => i > 0 && v < order[i - 1])) err('DESIGN_ORDER', `sections must follow: ${DESIGN_SECTIONS.join(' → ')}`);
  return { errors, warnings: [] };
}

// ---------- stages ----------

export const STAGES = {
  idea: ['ux/idea.md'],
  direction: ['ux/direction.md', 'ux/tokens.css'],
  flows: ['ux/flows.md'],
  refs: ['ux/refs.md'],
  prototype: ['ux/prototype/index.html'],
  design: ['DESIGN.md'],
};

export function checkStage(root, stage) {
  if (!(stage in STAGES)) throw new Error(`unknown stage "${stage}"; use ${Object.keys(STAGES).join(', ')}`);
  const read = (rel) => {
    const full = path.join(root, rel);
    return fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : null;
  };
  const missing = STAGES[stage].filter((rel) => read(rel) === null);
  if (missing.length) {
    return { stage, ok: false, errors: missing.map((rel) => ({ code: 'FILE_MISSING', at: rel, message: `${rel} does not exist` })), warnings: [] };
  }

  const idea = read('ux/idea.md');
  const flowsText = read('ux/flows.md');
  const ideaInfo = idea ? checkIdea(idea) : null;
  const screens = flowsText ? parseFlows(flowsText).screens : [];
  let result;
  switch (stage) {
    case 'idea': result = ideaInfo; break;
    case 'direction': result = checkDirection(read('ux/direction.md'), read('ux/tokens.css')); break;
    case 'flows': result = checkFlows(flowsText, ideaInfo); break;
    case 'refs': result = checkRefs(read('ux/refs.md'), screens, root); break;
    case 'prototype': result = checkPrototype(read('ux/prototype/index.html'), screens, read('ux/tokens.css') ?? ''); break;
    case 'design': result = checkDesign(read('DESIGN.md'), read('ux/tokens.css') ?? ''); break;
  }
  const lint = STAGES[stage].filter((rel) => rel.endsWith('.md')).flatMap((rel) => lintText(read(rel), rel));
  const errors = [...result.errors, ...lint];
  return { stage, ok: errors.length === 0, errors, warnings: result.warnings ?? [] };
}

// CLI: node check.mjs <stage> [--root <dir>]
const isMain = process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const i = args.indexOf('--root');
  const root = i === -1 ? process.cwd() : args[i + 1];
  try {
    const r = checkStage(root, args[0]);
    process.stdout.write(`${JSON.stringify(r, null, 2)}\n`);
    process.exit(r.ok ? 0 : 1);
  } catch (e) {
    process.stderr.write(`${e.message}\n`);
    process.exit(2);
  }
}
