#!/usr/bin/env node
// Build every example spec into examples/<id>.html.
//   node scripts/build-examples.mjs           write the files
//   node scripts/build-examples.mjs --check   fail if a committed file is out of date

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '../skills/visualize-anything/scripts/build.mjs';
import { validateFile } from '../skills/visualize-anything/scripts/validate.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'skills/visualize-anything/examples');
const OUT = join(ROOT, 'examples');
const check = process.argv.includes('--check');
let bad = 0;

for (const name of readdirSync(SRC).filter((f) => f.endsWith('.json')).sort()) {
  const { errors, spec } = validateFile(join(SRC, name));
  if (errors.length) {
    console.log(`FAIL ${name}: ${errors.length} validation error(s). Run the validator on it.`);
    bad++;
    continue;
  }
  const out = join(OUT, name.replace(/\.json$/, '.html'));
  const html = build(spec);
  const rel = out.slice(ROOT.length + 1);
  if (check) {
    const same = existsSync(out) && readFileSync(out, 'utf8') === html;
    console.log(`${same ? 'OK  ' : 'STALE'} ${rel}`);
    if (!same) bad++;
  } else {
    writeFileSync(out, html);
    console.log(`wrote ${rel}`);
  }
}
if (bad && check) console.log('Run "npm run build" and commit the result.');
process.exit(bad ? 1 : 0);
