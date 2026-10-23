import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { status, roll, syncTokens, scaffold, components, flowMap, renderFlowMap } from './fordi.mjs';

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'fordi-cli-'));
const write = (root, rel, text, mtime) => {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, text);
  if (mtime) fs.utimesSync(full, mtime, mtime);
};

test('1. status on an empty folder: nothing done, next is idea, no foreign files', () => {
  const s = status(tmp());
  assert.equal(s.next, 'idea');
  assert.deepEqual(s.stages.map((x) => x.state), ['missing', 'missing', 'missing', 'missing', 'missing', 'missing']);
  assert.deepEqual(s.foreign, []);
});

test('2. status lists unrelated files so idea can ask before starting in the wrong folder', () => {
  const root = tmp();
  write(root, 'index.html', '<html>');
  write(root, '.git/HEAD', 'x');
  assert.deepEqual(status(root).foreign, ['index.html']);
});

test('3. status: done stages, and a stage is stale when a file it depends on is newer', () => {
  const root = tmp();
  write(root, 'ux/idea.md', 'x', new Date(2000));
  write(root, 'ux/direction.md', 'x', new Date(3000));
  write(root, 'ux/tokens.css', 'x', new Date(3000));
  write(root, 'ux/flows.md', 'x', new Date(1000)); // older than idea.md
  const s = status(root);
  const by = Object.fromEntries(s.stages.map((x) => [x.stage, x.state]));
  assert.deepEqual(by, { idea: 'done', direction: 'done', flows: 'stale', refs: 'missing', prototype: 'missing', design: 'missing' });
  assert.equal(s.next, 'flows');
});

test('4. DESIGN.md belongs to the prototype command', () => {
  const root = tmp();
  for (const f of ['ux/idea.md', 'ux/direction.md', 'ux/tokens.css', 'ux/flows.md', 'ux/refs.md', 'ux/prototype/index.html']) {
    write(root, f, 'x', new Date(1000));
  }
  const s = status(root);
  assert.equal(s.stages.find((x) => x.stage === 'design').command, 'prototype');
  assert.equal(s.next, 'prototype');
  write(root, 'DESIGN.md', 'x', new Date(2000));
  assert.equal(status(root).next, null);
});

test('5. roll deals a lead and two alternates from the ranked candidates, never excluded ones', () => {
  const seq = [0.99, 0, 0.5];
  let i = 0;
  const r = roll({ n: 7, random: () => seq[i++ % seq.length] });
  assert.equal(new Set([r.lead, ...r.alternates]).size, 3);
  assert.equal(r.lead, 7);
  for (let k = 0; k < 50; k++) {
    const x = roll({ n: 7, exclude: [1, 2, 3, 4] });
    assert.deepEqual([x.lead, ...x.alternates].sort(), [5, 6, 7]);
  }
  assert.throws(() => roll({ n: 3, exclude: [1, 2, 3] }), /no candidates left/);
});

test('6. syncTokens copies ux/tokens.css into the prototype tokens block', () => {
  const root = tmp();
  write(root, 'ux/tokens.css', '@theme {\n  --color-ink: #222;\n}\n');
  write(root, 'ux/prototype/index.html', '<head><style type="text/tailwindcss" id="tokens">\n@theme { --color-ink: #111; }\n</style></head>');
  syncTokens(root);
  const html = fs.readFileSync(path.join(root, 'ux/prototype/index.html'), 'utf8');
  assert.match(html, /--color-ink: #222/);
  assert.doesNotMatch(html, /#111/);
  write(root, 'ux/prototype/index.html', '<head></head>');
  assert.throws(() => syncTokens(root), /no tokens block/);
});

test('7. scaffold copies a stage template once and never overwrites', () => {
  const root = tmp();
  const first = scaffold(root, 'idea', SKILL);
  assert.deepEqual(first.created, ['ux/idea.md']);
  write(root, 'ux/idea.md', 'mine');
  assert.deepEqual(scaffold(root, 'idea', SKILL).kept, ['ux/idea.md']);
  assert.equal(fs.readFileSync(path.join(root, 'ux/idea.md'), 'utf8'), 'mine');
  const proto = scaffold(root, 'prototype', SKILL);
  assert.ok(proto.created.includes('ux/prototype/index.html'));
  assert.ok(proto.created.includes('ux/prototype/viewer.js'));
});

test('8. components writes a map of every data-component and the screens using it', () => {
  const root = tmp();
  write(root, 'ux/prototype/index.html',
    '<section class="screen" data-screen="S1"><button data-component="Button"></button><div data-component="Card"></div></section>'
    + '<section class="screen" data-screen="S2"><button data-component="Button"></button></section>');
  const r = components(root);
  assert.deepEqual(r.components, [{ name: 'Button', count: 2, screens: ['S1', 'S2'] }, { name: 'Card', count: 1, screens: ['S1'] }]);
  const md = fs.readFileSync(path.join(root, 'ux/prototype/components.md'), 'utf8');
  assert.match(md, /\| Button \| ۲ \| S1، S2 \|/);
});

test('9. flowMap renders every flow diagram from ux/flows.md into an RTL page', () => {
  const root = tmp();
  write(root, 'ux/idea.md', '# نوبت‌یار\n');
  write(root, 'ux/flows.md', '## فلوها\n\n### F1: ثبت <نوبت>\n```mermaid\nflowchart RL\n  a --> b\n```\n1. x → S1\n\n### F2: بدون دیاگرام\n1. y → S1\n');
  const r = flowMap(root);
  assert.equal(r.flows, 2);
  const html = fs.readFileSync(path.join(root, 'ux/flow-map.html'), 'utf8');
  assert.match(html, /dir="rtl"/);
  assert.match(html, /ثبت &lt;نوبت&gt;/);
  assert.match(html, /flowchart RL/);
  assert.match(html, /<bdi>نوبت‌یار<\/bdi>/);
});

test('10. renderFlowMap marks a flow without a diagram', () => {
  const html = renderFlowMap([{ id: 'F1', title: 't', mermaid: [] }], { projectName: 'p', generatedAt: 'd' });
  assert.match(html, /دیاگرام ندارد/);
});
