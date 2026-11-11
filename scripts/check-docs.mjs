#!/usr/bin/env node
// Keep the documentation honest: every complete spec printed in references/spec.md
// must pass the validator with no warnings, and SKILL.md must stay short.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validate } from '../skills/visualize-anything/scripts/validate.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');
let bad = 0;
const report = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`); if (!ok) bad++; };

const specMd = read('skills/visualize-anything/references/spec.md');
const blocks = [...specMd.matchAll(/```json\n([\s\S]*?)```/g)].map((m) => m[1]).filter((b) => /^\s*\{\s*"version"/.test(b));
report(blocks.length > 0, `references/spec.md contains ${blocks.length} complete example spec(s)`);
for (const [i, b] of blocks.entries()) {
  let res;
  try { res = validate(JSON.parse(b)); } catch (e) { res = { errors: [e.message], warnings: [] }; }
  const problems = [...res.errors, ...res.warnings];
  report(!problems.length, `references/spec.md example ${i + 1} validates with no warnings`);
  for (const p of problems) console.log('       ' + p);
}

const skill = read('skills/visualize-anything/SKILL.md');
const lines = skill.split('\n').length;
report(lines <= 200, `SKILL.md is ${lines} lines (limit 200)`);
for (const m of skill.matchAll(/`((?:references|scripts|assets|examples)\/[^`*\s]+)`/g)) {
  let ok = true;
  try { read('skills/visualize-anything/' + m[1]); } catch { ok = false; }
  if (!ok) report(false, `SKILL.md points at ${m[1]}, which does not exist`);
}
report(true, 'every file SKILL.md points at was looked up');
process.exit(bad ? 1 : 0);
