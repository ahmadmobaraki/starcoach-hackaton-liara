#!/usr/bin/env node
// fordi install: links this repo and its command shortcuts into the Claude Code skills folder, so
// /fordi, /fordi-idea, /fordi-direction, /fordi-flows, /fordi-refs and /fordi-prototype all show up.
// Links (junctions on Windows, no admin needed) mean "git pull" updates the installed skill.
// Never replaces an existing folder or a link that points somewhere else; it reports it instead.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SHORTCUTS = ['fordi-idea', 'fordi-direction', 'fordi-flows', 'fordi-refs', 'fordi-prototype'];

export function install({ skillsDir = path.join(os.homedir(), '.claude', 'skills'), repoDir = REPO } = {}) {
  fs.mkdirSync(skillsDir, { recursive: true });
  const wanted = [['fordi', repoDir], ...SHORTCUTS.map((name) => [name, path.join(repoDir, 'shortcuts', name)])];
  const linked = [];
  const ok = [];
  const blocked = [];
  for (const [name, target] of wanted) {
    const at = path.join(skillsDir, name);
    let exists = true;
    try { fs.lstatSync(at); } catch { exists = false; }
    if (!exists) {
      fs.symlinkSync(target, at, process.platform === 'win32' ? 'junction' : 'dir');
      linked.push(name);
    } else if (fs.realpathSync(at) === fs.realpathSync(target)) {
      ok.push(name);
    } else {
      blocked.push(name);
    }
  }
  return { skillsDir, linked, ok, blocked };
}

// CLI: node install.mjs [--skills <dir>]
const isMain = process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const i = process.argv.indexOf('--skills');
  const r = install(i === -1 ? {} : { skillsDir: process.argv[i + 1] });
  process.stdout.write(`${JSON.stringify(r, null, 2)}\n`);
  if (r.blocked.length) {
    process.stderr.write(`Not replaced (already exist and point elsewhere): ${r.blocked.join(', ')}. Remove them yourself if they are old fordi installs, then run again.\n`);
    process.exit(1);
  }
  process.stdout.write('Done. Start a new Claude Code session and type /fordi\n');
}
