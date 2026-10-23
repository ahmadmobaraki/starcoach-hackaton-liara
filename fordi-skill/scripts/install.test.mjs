import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { install, SHORTCUTS } from './install.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'fordi-install-'));
const real = (p) => fs.realpathSync(p);

test('1. every shortcut folder exists in the repo with a user-only SKILL.md named after it', () => {
  assert.deepEqual(SHORTCUTS, ['fordi-idea', 'fordi-direction', 'fordi-flows', 'fordi-refs', 'fordi-prototype']);
  for (const name of SHORTCUTS) {
    const text = fs.readFileSync(path.join(REPO, 'shortcuts', name, 'SKILL.md'), 'utf8');
    assert.match(text, new RegExp(`^name: ${name}$`, 'm'));
    assert.match(text, /^disable-model-invocation: true$/m);
    assert.match(text, /\$ARGUMENTS/);
    const command = name.replace('fordi-', '');
    assert.ok(fs.existsSync(path.join(REPO, 'commands', `${command}.md`)), `commands/${command}.md exists`);
  }
});

test('2. install links fordi and every shortcut into the skills folder', () => {
  const skills = tmp();
  const r = install({ skillsDir: skills, repoDir: REPO });
  assert.deepEqual(r.linked.sort(), ['fordi', ...SHORTCUTS].sort());
  assert.equal(real(path.join(skills, 'fordi')), real(REPO));
  assert.equal(real(path.join(skills, 'fordi-idea')), real(path.join(REPO, 'shortcuts', 'fordi-idea')));
});

test('3. running install again keeps correct links and never replaces a real folder', () => {
  const skills = tmp();
  install({ skillsDir: skills, repoDir: REPO });
  fs.rmSync(path.join(skills, 'fordi-refs'));
  fs.mkdirSync(path.join(skills, 'fordi-refs'));
  fs.writeFileSync(path.join(skills, 'fordi-refs', 'mine.txt'), 'keep me');
  const r = install({ skillsDir: skills, repoDir: REPO });
  assert.deepEqual(r.linked, []);
  assert.equal(r.ok.length, 5);
  assert.deepEqual(r.blocked, ['fordi-refs']);
  assert.equal(fs.readFileSync(path.join(skills, 'fordi-refs', 'mine.txt'), 'utf8'), 'keep me');
});
