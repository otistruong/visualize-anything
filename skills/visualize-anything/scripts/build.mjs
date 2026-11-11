#!/usr/bin/env node
// Embed a spec into the player and write one standalone HTML file. No dependencies.
//
//   node build.mjs spec.json [out.html] [--force]
//
// The spec is validated first; a spec with errors is not built unless --force
// is given. The output defaults to the spec's path with .html instead of .json.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateFile } from './validate.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PLAYER = resolve(HERE, '../assets/player.html');
const SLOT = /(<script type="application\/json" id="spec">)[\s\S]*?(<\/script>)/;

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** JSON that cannot end the script element or start an HTML comment, whatever the strings contain. */
const safeJson = (spec) => JSON.stringify(spec).replace(/</g, '\\u003c');

export function build(spec, playerHtml = readFileSync(PLAYER, 'utf8')) {
  if (!SLOT.test(playerHtml)) throw new Error('player.html has no <script type="application/json" id="spec"> block');
  return playerHtml
    .replace(SLOT, (_, open, close) => `${open}\n${safeJson(spec)}\n${close}`)
    .replace(/<title>[\s\S]*?<\/title>/, () => `<title>${escapeHtml(String(spec.title ?? 'Visual explainer'))}</title>`);
}

function main(argv) {
  const args = argv.filter((a) => !a.startsWith('--'));
  const force = argv.includes('--force');
  if (!args.length || argv.includes('--help')) {
    console.error('usage: node build.mjs <spec.json> [out.html] [--force]');
    return 2;
  }
  const src = args[0];
  const out = args[1] ?? src.replace(/\.json$/i, '') + '.html';
  const { errors, warnings, spec } = validateFile(src);
  for (const e of errors) console.error(`error    ${e}`);
  for (const w of warnings) console.error(`warning  ${w}`);
  if (errors.length && !(force && spec)) {
    console.error(`Not built: ${src} has ${errors.length} error${errors.length === 1 ? '' : 's'}. Fix them and run again.`);
    return 1;
  }
  const html = build(spec);
  writeFileSync(out, html);
  console.log(`Wrote ${out} (${(Buffer.byteLength(html) / 1024).toFixed(0)} kB, ${spec.steps.length} steps). Open it in a browser; it needs no server.`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main(process.argv.slice(2)));
