#!/usr/bin/env node
// Test what an agent does with the visualize-anything skill. No dependencies.
//
// Offline (default): check output an agent already produced against a case's assertions.
//   node evals/run.mjs                               every case that has a fixture in evals/fixtures/
//   node evals/run.mjs --case tcp-handshake --dir <output-dir>
//
// Live (opt-in, spends model usage): run cases headlessly in a temp directory with the skill installed.
//   node evals/run.mjs --live [--agent claude|codex|copilot] [--case <id>] [--timeout 900] [--keep]
//   node evals/run.mjs --live --triggers [--limit 4]    does the agent pick the skill up for each prompt?
//
// Other flags: --json (machine-readable result), --list (show cases), --help.
// See evals/README.md for how to read the output.

import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validate } from '../skills/visualize-anything/scripts/validate.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SKILL_NAME = 'visualize-anything';
const SKILL_DIR = join(ROOT, 'skills', SKILL_NAME);
const argv = process.argv.slice(2);
const flag = (name) => argv.includes('--' + name);
const opt = (name, dflt) => { const i = argv.indexOf('--' + name); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : dflt; };

/* ---------- reading an output directory ---------- */

const SKIP_DIRS = new Set(['node_modules', '.git', '.claude', '.github', '.agents', '.codex', '.copilot']);
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) { if (!SKIP_DIRS.has(name)) walk(p, out); } else out.push(p);
  }
  return out;
}
const tryJson = (text) => { try { return JSON.parse(text); } catch { return null; } };
const looksLikeSpec = (o) => o && typeof o === 'object' && Array.isArray(o.actors) && Array.isArray(o.steps);

/** Everything the assertions need, gathered once. */
function loadOutput(dir, include = []) {
  const files = [...(existsSync(dir) ? walk(dir) : []), ...include];
  const specs = [], htmls = [];
  for (const f of files) {
    if (/\.json$/i.test(f) && !/(^|[\\/])(actions|fixture)\.json$/.test(f)) {
      const o = tryJson(readFileSync(f, 'utf8'));
      if (looksLikeSpec(o)) specs.push({ path: f, spec: o });
    } else if (/\.html?$/i.test(f)) {
      const text = readFileSync(f, 'utf8');
      const m = /<script type="application\/json" id="spec">([\s\S]*?)<\/script>/.exec(text);
      const embedded = m ? tryJson(m[1]) : null;
      if (looksLikeSpec(embedded)) htmls.push({ path: f, text, spec: embedded });
    }
  }
  // the spec under test: a spec file if the agent wrote one, else whatever is embedded in the HTML
  const spec = specs[0]?.spec ?? htmls[0]?.spec ?? null;
  let actions = null, final = null;
  const a = join(dir, 'actions.json'), t = join(dir, 'transcript.jsonl'), fm = join(dir, 'final.md');
  if (existsSync(a)) actions = tryJson(readFileSync(a, 'utf8'));
  else if (existsSync(t)) ({ actions, final } = parseClaudeStream(readFileSync(t, 'utf8')));
  if (existsSync(fm)) final = readFileSync(fm, 'utf8');
  return { dir, files, specs, htmls, spec, actions, final };
}

/* ---------- transcripts to a list of actions ---------- */
// An action is { type: 'skill' | 'read' | 'write' | 'command' | 'search', target: string }.

/** Claude Code `--output-format stream-json`: one JSON object per line. */
function parseClaudeStream(text) {
  const actions = [];
  let final = null;
  for (const line of text.split('\n')) {
    const ev = tryJson(line);
    if (!ev) continue;
    if (ev.type === 'assistant' && Array.isArray(ev.message?.content)) {
      for (const b of ev.message.content) {
        if (b.type !== 'tool_use') continue;
        const i = b.input ?? {};
        if (b.name === 'Skill') actions.push({ type: 'skill', target: String(i.skill ?? i.name ?? '') });
        else if (b.name === 'Read') actions.push({ type: 'read', target: String(i.file_path ?? '') });
        else if (b.name === 'Write' || b.name === 'Edit' || b.name === 'MultiEdit' || b.name === 'NotebookEdit') actions.push({ type: 'write', target: String(i.file_path ?? i.notebook_path ?? '') });
        else if (b.name === 'Bash') actions.push({ type: 'command', target: String(i.command ?? '') });
        else if (b.name === 'WebSearch' || b.name === 'WebFetch') actions.push({ type: 'search', target: String(i.query ?? i.url ?? '') });
        else if (b.name === 'Glob' || b.name === 'Grep') actions.push({ type: 'read', target: String(i.pattern ?? '') + (i.path ? ' in ' + i.path : '') });
      }
    } else if (ev.type === 'result' && typeof ev.result === 'string') final = ev.result;
  }
  return { actions, final };
}

/** Codex `codex exec --json`: JSONL events; items carry the work. Written from the documentation, not run here. */
function parseCodexStream(text) {
  const actions = [];
  let final = null;
  for (const line of text.split('\n')) {
    const ev = tryJson(line);
    const item = ev?.item;
    if (!item || ev.type !== 'item.completed') continue;
    if (item.type === 'command_execution') actions.push({ type: 'command', target: String(item.command ?? '') });
    else if (item.type === 'file_change') for (const c of item.changes ?? []) actions.push({ type: 'write', target: String(c.path ?? '') });
    else if (item.type === 'web_search') actions.push({ type: 'search', target: String(item.query ?? '') });
    else if (item.type === 'agent_message' && typeof item.text === 'string') final = item.text;
  }
  return { actions, final };
}

/* ---------- assertions ---------- */
// Each returns { status: 'pass' | 'fail' | 'skip', detail }.

const pass = (detail = '') => ({ status: 'pass', detail });
const fail = (detail) => ({ status: 'fail', detail });
const skip = (detail) => ({ status: 'skip', detail });
const rx = (s) => new RegExp(s, 'i');
const needSpec = (o) => (o.spec ? null : fail('no spec found (a .json file with "actors" and "steps", or one embedded in an .html file)'));
const needActions = (o) => (o.actions ? null : skip('needs a transcript: no transcript.jsonl or actions.json in the output directory'));
const firstIndex = (actions, type, pattern) => actions.findIndex((a) => (!type || a.type === type) && rx(pattern).test(a.target));

const CHECKS = {
  spec_file_written: (o) => (o.specs.length ? pass(relative(o.dir, o.specs[0].path)) : fail('no spec .json file in the output directory')),
  html_file_written: (o) => (o.htmls.length ? pass(relative(o.dir, o.htmls[0].path)) : fail('no .html file with an embedded spec in the output directory')),
  spec_valid: (o) => {
    const no = needSpec(o); if (no) return no;
    const { errors } = validate(o.spec);
    return errors.length ? fail(`${errors.length} validation error(s); first: ${errors[0]}`) : pass();
  },
  spec_no_warnings: (o) => {
    const no = needSpec(o); if (no) return no;
    const { errors, warnings } = validate(o.spec);
    return errors.length + warnings.length ? fail(`${warnings.length} warning(s), ${errors.length} error(s); first: ${[...errors, ...warnings][0]}`) : pass();
  },
  html_matches_spec: (o) => {
    if (!o.htmls.length) return fail('no built .html file');
    if (!o.specs.length) return skip('no separate spec file to compare with');
    const same = o.htmls.some((h) => o.specs.some((s) => JSON.stringify(s.spec) === JSON.stringify(h.spec)));
    return same ? pass() : fail('the spec embedded in the HTML differs from the spec file: the HTML was not rebuilt after the last edit');
  },
  html_uses_player: (o) => {
    if (!o.htmls.length) return fail('no built .html file');
    return o.htmls.every((h) => /visualize-anything player/.test(h.text)) ? pass() : fail('the HTML is not the bundled player (the agent wrote its own renderer)');
  },
  html_self_contained: (o) => {
    if (!o.htmls.length) return fail('no built .html file');
    for (const h of o.htmls) {
      const m = /<script[^>]+src=|<link[^>]+href=|@import|url\(\s*['"]?https?:|<img[^>]+src=["']https?:|<iframe/i.exec(h.text);
      if (m) return fail(`loads something external: ${m[0]}`);
    }
    return pass();
  },
  min_steps: (o, a) => { const no = needSpec(o); if (no) return no; const n = o.spec.steps.length; return n >= a.value ? pass(`${n} steps`) : fail(`${n} steps, expected at least ${a.value}`); },
  max_steps: (o, a) => { const no = needSpec(o); if (no) return no; const n = o.spec.steps.length; return n <= a.value ? pass(`${n} steps`) : fail(`${n} steps, expected at most ${a.value}`); },
  min_actors: (o, a) => { const no = needSpec(o); if (no) return no; const n = o.spec.actors.length; return n >= a.value ? pass(`${n} actors`) : fail(`${n} actors, expected at least ${a.value}`); },
  min_fail_steps: (o, a) => {
    const no = needSpec(o); if (no) return no;
    const n = o.spec.steps.filter((s) => typeof s.fail === 'string' && s.fail.trim()).length;
    return n >= a.value ? pass(`${n} failure step(s)`) : fail(`${n} failure step(s) with a reason, expected at least ${a.value}`);
  },
  min_inside_steps: (o, a) => {
    const no = needSpec(o); if (no) return no;
    const n = o.spec.steps.filter((s) => !s.to).length;
    return n >= a.value ? pass(`${n} inside step(s)`) : fail(`${n} step(s) without "to" (decisions, lookups), expected at least ${a.value}`);
  },
  min_steps_with_fields: (o, a) => {
    const no = needSpec(o); if (no) return no;
    const n = o.spec.steps.filter((s) => (s.fields?.length || s.state?.length || s.payload)).length;
    return n >= a.value ? pass(`${n} step(s)`) : fail(`${n} step(s) show fields, a payload or a state table, expected at least ${a.value}`);
  },
  marks_a_change: (o) => {
    const no = needSpec(o); if (no) return no;
    const changed = o.spec.steps.some((s) => (s.fields ?? []).some((g) => g.changed?.length));
    const titles = o.spec.steps.flatMap((s) => (s.state ?? []).map((t) => t.title));
    const repeated = titles.some((t, i) => titles.indexOf(t) !== i);
    return changed || repeated ? pass(changed ? 'a field is marked changed' : 'a state table recurs') : fail('no field is marked "changed" and no state table appears twice, so nothing shows what changed');
  },
  min_sources: (o, a) => {
    const no = needSpec(o); if (no) return no;
    const n = (o.spec.sources ?? []).filter((s) => /^https?:\/\//.test(s.url ?? '') || s.note).length;
    return n >= a.value ? pass(`${n} source(s)`) : fail(`${n} source(s), expected at least ${a.value}`);
  },
  /** the spec's default view is one the player knows, and, with `value`, is that view ("3d" when left out) */
  spec_view: (o, a) => {
    const no = needSpec(o); if (no) return no;
    const v = o.spec.view;
    if (v !== undefined && v !== '2d' && v !== '3d') return fail(`"view" is ${JSON.stringify(v)}; the player knows only "2d" and "3d"`);
    const shown = v ?? '3d';
    if (a.value !== undefined && shown !== a.value) return fail(`opens in ${shown}${v === undefined ? ' (the default)' : ''}, expected ${a.value}`);
    return pass(`opens in ${shown}${v === undefined ? ' (the default)' : ''}`);
  },
  has_simplifications: (o) => { const no = needSpec(o); if (no) return no; return o.spec.simplifications?.length ? pass(`${o.spec.simplifications.length} listed`) : fail('"simplifications" is empty'); },
  spec_matches: (o, a) => { const no = needSpec(o); if (no) return no; return rx(a.pattern).test(JSON.stringify(o.spec)) ? pass() : fail(`spec text does not match /${a.pattern}/i`); },
  spec_not_matches: (o, a) => { const no = needSpec(o); if (no) return no; const m = rx(a.pattern).exec(JSON.stringify(o.spec)); return m ? fail(`spec text contains "${m[0]}"`) : pass(); },
  final_matches: (o, a) => {
    if (o.final == null) return skip('needs the final message: no final.md or transcript in the output directory');
    return rx(a.pattern).test(o.final) ? pass() : fail(`final message does not match /${a.pattern}/i`);
  },
  ran_command: (o, a) => { const no = needActions(o); if (no) return no; return firstIndex(o.actions, 'command', a.pattern) >= 0 ? pass() : fail(`no command matching /${a.pattern}/i was run`); },
  did_not_run: (o, a) => { const no = needActions(o); if (no) return no; const i = firstIndex(o.actions, 'command', a.pattern); return i < 0 ? pass() : fail(`ran: ${o.actions[i].target.slice(0, 80)}`); },
  read_file: (o, a) => { const no = needActions(o); if (no) return no; return o.actions.some((x) => (x.type === 'read' || x.type === 'skill' || x.type === 'command') && rx(a.pattern).test(x.target)) ? pass() : fail(`nothing matching /${a.pattern}/i was read`); },
  wrote_file: (o, a) => { const no = needActions(o); if (no) return no; return firstIndex(o.actions, 'write', a.pattern) >= 0 ? pass() : fail(`no file matching /${a.pattern}/i was written`); },
  did_not_write: (o, a) => { const no = needActions(o); if (no) return no; const i = firstIndex(o.actions, 'write', a.pattern); return i < 0 ? pass() : fail(`wrote ${o.actions[i].target}`); },
  /** the first action matching `first` comes before the first action matching `then` */
  order: (o, a) => {
    const no = needActions(o); if (no) return no;
    const i = firstIndex(o.actions, a.first.type, a.first.pattern), j = firstIndex(o.actions, a.then.type, a.then.pattern);
    if (i < 0) return fail(`never happened: ${a.first.type ?? 'action'} /${a.first.pattern}/i`);
    if (j < 0) return fail(`never happened: ${a.then.type ?? 'action'} /${a.then.pattern}/i`);
    return i < j ? pass(`action ${i + 1} before action ${j + 1}`) : fail(`wrong order: action ${j + 1} came before action ${i + 1}`);
  },
  used_skill: (o) => {
    const no = needActions(o); if (no) return no;
    return o.actions.some((x) => (x.type === 'skill' && x.target.includes(SKILL_NAME)) || (x.type !== 'write' && /visualize-anything[\\/]SKILL\.md/.test(x.target))) ? pass() : fail('the skill was never invoked and its SKILL.md was never read');
  },
};

function runAssertions(caseDef, output) {
  return [...(caseDef.no_common ? [] : COMMON), ...caseDef.assertions].map((a) => {
    const fn = CHECKS[a.check];
    const res = fn ? fn(output, a) : fail(`unknown check "${a.check}"`);
    return { check: a.check, expect: a.expect, ...res };
  });
}

let COMMON = [];

/* ---------- reporting ---------- */

function printTable(title, rows) {
  const mark = { pass: 'PASS', fail: 'FAIL', skip: 'SKIP' };
  const w = Math.max(...rows.map((r) => r.expect.length), 20);
  console.log(`\n${title}`);
  console.log('-'.repeat(Math.min(w + 8, 110)));
  for (const r of rows) console.log(`${mark[r.status]}  ${r.expect.padEnd(w)}${r.detail ? '  ' + r.detail : ''}`);
  const n = (s) => rows.filter((r) => r.status === s).length;
  console.log(`${n('pass')} passed, ${n('fail')} failed, ${n('skip')} skipped`);
}
function printActions(actions) {
  if (!actions?.length) return;
  console.log('\nWhat the agent did, in order:');
  actions.forEach((a, i) => console.log(`${String(i + 1).padStart(3)}. ${a.type.padEnd(7)} ${a.target.replace(/\s+/g, ' ').slice(0, 120)}`));
}

/* ---------- live mode ---------- */

const which = (cmd) => spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { encoding: 'utf8' }).status === 0;

// Where each agent looks for a project skill, and how to run it without a terminal.
// claude: verified against the Claude Code headless documentation and by running it.
// codex, copilot: written from their documentation; see evals/README.md for what is unconfirmed.
const AGENTS = {
  claude: {
    skillDir: '.claude/skills',
    command: (prompt, o) => ['claude', ['-p', prompt, '--output-format', 'stream-json', '--verbose', '--permission-mode', 'acceptEdits',
      '--allowedTools', 'Skill,Read,Write,Edit,Glob,Grep,WebSearch,WebFetch,Bash(node:*),Bash(ls:*),Bash(cat:*),Bash(mkdir:*)', '--max-turns', String(o.maxTurns)]],
    parse: parseClaudeStream,
  },
  codex: {
    skillDir: '.agents/skills',
    command: (prompt) => ['codex', ['exec', '--json', '--sandbox', 'workspace-write', '--skip-git-repo-check', prompt]],
    parse: parseCodexStream,
  },
  copilot: {
    skillDir: '.github/skills',
    command: (prompt) => ['copilot', ['-p', prompt, '--allow-all-tools', '--no-ask-user', '-s']],
    // The JSONL event schema of `--output-format json` is not documented, so only the final text is captured.
    parse: (text) => ({ actions: null, final: text.trim() || null }),
  },
};

function runAgent(agent, prompt, cwd, o) {
  const [cmd, args] = AGENTS[agent].command(prompt, o);
  return new Promise((done) => {
    const child = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    const timer = setTimeout(() => child.kill('SIGTERM'), o.timeout * 1000);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => { clearTimeout(timer); done({ out, err: err + e.message, code: -1 }); });
    child.on('close', (code) => { clearTimeout(timer); done({ out, err, code }); });
  });
}
/** Remove machine-specific paths before anything is saved or printed. */
const scrubber = (work) => {
  let real = work;
  try { real = realpathSync(work); } catch { /* keep the given path */ }
  const paths = [...new Set([real, resolve(work), work])].sort((x, y) => y.length - x.length);
  return (text) => paths.reduce((t, p) => t.split(p).join('<workdir>'), text).split(homedir()).join('~');
};

async function live(cases, triggers) {
  const wanted = opt('agent');
  const available = Object.keys(AGENTS).filter(which);
  const agent = wanted ?? available[0];
  if (!agent || !AGENTS[agent] || !which(agent)) {
    console.log(wanted
      ? `Live mode: the "${wanted}" command was not found on PATH. Installed and supported: ${available.join(', ') || 'none'}.`
      : 'Live mode needs an agent CLI on PATH (claude, codex or copilot) that is already signed in. None was found.');
    console.log('Nothing was run. Offline mode still works: node evals/run.mjs --case <id> --dir <output-dir>');
    return 2;
  }
  const o = { timeout: Number(opt('timeout', '900')), maxTurns: Number(opt('max-turns', '60')) };
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const resultsRoot = resolve(opt('out', join(HERE, 'results', stamp)));
  const runOne = async (id, prompt, setup) => {
    const work = mkdtempSync(join(tmpdir(), 'va-eval-'));
    cpSync(SKILL_DIR, join(work, AGENTS[agent].skillDir, SKILL_NAME), { recursive: true });
    for (const [from, to] of Object.entries(setup?.copy ?? {})) cpSync(join(ROOT, from), join(work, to));
    const scrub = scrubber(work);
    console.log(`\n[${agent}] ${id}: running (timeout ${o.timeout}s) ...`);
    const res = await runAgent(agent, prompt, work, o);
    const parsed = AGENTS[agent].parse(res.out);
    const outDir = join(resultsRoot, id);
    mkdirSync(outDir, { recursive: true });
    // keep what the agent produced, minus the installed skill, with local paths removed
    for (const f of walk(work)) {
      const dest = join(outDir, relative(work, f));
      mkdirSync(dirname(dest), { recursive: true });
      cpSync(f, dest);
    }
    writeFileSync(join(outDir, { claude: 'transcript.jsonl', codex: 'transcript.codex.jsonl', copilot: 'transcript.txt' }[agent]), scrub(res.out));
    if (parsed.actions) {
      parsed.actions = parsed.actions.map((a) => ({ ...a, target: scrub(a.target) }));
      writeFileSync(join(outDir, 'actions.json'), JSON.stringify(parsed.actions, null, 2) + '\n');
    }
    if (parsed.final) writeFileSync(join(outDir, 'final.md'), scrub(parsed.final) + '\n');
    if (res.code !== 0) console.log(`[${agent}] exited with code ${res.code}. ${scrub(res.err).trim().split('\n').slice(-3).join(' | ')}`);
    if (!flag('keep')) rmSync(work, { recursive: true, force: true });
    else console.log(`kept working directory: ${work}`);
    return { outDir, parsed };
  };

  let failed = 0;
  if (flag('triggers')) {
    const limit = Number(opt('limit', '4'));
    const sets = [['should_trigger', true], ['should_not_trigger', false]];
    const rows = [];
    for (const [key, want] of sets) {
      for (const t of triggers[key].slice(0, limit)) {
        const { parsed } = await runOne(`trigger-${rows.length + 1}`, t.prompt + '\n\n(Only say in one sentence what you would do first, then stop. Do not create any files.)');
        if (!parsed.actions) { rows.push({ expect: t.prompt.slice(0, 70), status: 'skip', detail: `cannot see tool use for ${agent}` }); continue; }
        const used = CHECKS.used_skill({ actions: parsed.actions }).status === 'pass';
        rows.push({ expect: `${want ? 'uses skill ' : 'leaves skill'}: ${t.prompt.slice(0, 60)}`, status: used === want ? 'pass' : 'fail', detail: used ? 'skill used' : 'skill not used' });
      }
    }
    printTable(`Trigger check with ${agent} (${limit} prompts from each list)`, rows);
    failed += rows.filter((r) => r.status === 'fail').length;
  } else {
    for (const c of cases) {
      const { outDir, parsed } = await runOne(c.id, c.prompt, c.setup);
      const output = loadOutput(outDir);
      output.actions = parsed.actions; output.final = parsed.final ?? output.final;
      printActions(output.actions);
      const rows = runAssertions(c, output);
      printTable(`Case ${c.id} with ${agent}`, rows);
      failed += rows.filter((r) => r.status === 'fail').length;
      console.log(`Saved to ${relative(process.cwd(), outDir) || outDir} (re-check later with: node evals/run.mjs --case ${c.id} --dir <that directory>)`);
    }
  }
  return failed ? 1 : 0;
}

/* ---------- main ---------- */

async function main() {
  if (flag('help')) { console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 15).map((l) => l.replace(/^\/\/ ?/, '')).join('\n')); return 0; }
  const casesFile = JSON.parse(readFileSync(join(HERE, 'cases.json'), 'utf8'));
  const all = casesFile.cases;
  COMMON = casesFile.common ?? [];
  const triggers = JSON.parse(readFileSync(join(HERE, 'triggers.json'), 'utf8'));
  if (flag('list')) { for (const c of all) console.log(`${c.id.padEnd(28)} ${c.assertions.length + (c.no_common ? 0 : COMMON.length)} assertions  ${c.prompt.slice(0, 70)}`); return 0; }
  const only = opt('case');
  const cases = only ? all.filter((c) => c.id === only) : all;
  if (only && !cases.length) { console.error(`No case "${only}". Known: ${all.map((c) => c.id).join(', ')}`); return 2; }

  // live runs one case unless told otherwise: each run costs real model usage
  if (flag('live')) return live(only || flag('all') ? cases : cases.slice(0, 1), triggers);

  // offline
  const dir = opt('dir');
  if (dir && !only) { console.error('--dir needs --case <id> so the right assertions are applied.'); return 2; }
  const jobs = [];
  if (dir) jobs.push({ c: cases[0], d: resolve(dir), fx: {} });
  else {
    const fxRoot = join(HERE, 'fixtures');
    for (const name of existsSync(fxRoot) ? readdirSync(fxRoot).sort() : []) {
      const f = join(fxRoot, name, 'fixture.json');
      if (!existsSync(f)) continue;
      const fx = JSON.parse(readFileSync(f, 'utf8'));
      const c = all.find((x) => x.id === fx.case);
      if (!c) { console.error(`${relative(ROOT, f)} names the unknown case "${fx.case}"`); return 2; }
      if (!only || c.id === only) jobs.push({ c, d: join(fxRoot, name), fx });
    }
  }
  if (!jobs.length) { console.error('Nothing to check: no fixtures found. Use --case <id> --dir <output-dir>.'); return 2; }
  const results = [];
  let failed = 0;
  for (const { c, d, fx } of jobs) {
    if (!existsSync(d)) { console.error(`Output directory not found: ${d}`); return 2; }
    const output = loadOutput(d, (fx.include ?? []).map((p) => resolve(d, p)));
    const rows = runAssertions(c, output);
    const expectFail = fx.expect === 'fail';
    const bad = rows.filter((r) => r.status === 'fail').length;
    results.push({ case: c.id, dir: relative(ROOT, d), expectFail, rows });
    if (!flag('json')) {
      if (flag('actions')) printActions(output.actions);
      printTable(`Case ${c.id}  <-  ${relative(process.cwd(), d) || d}${expectFail ? '  (a deliberately bad output: failures are expected here)' : ''}`, rows);
    }
    if (expectFail ? bad === 0 : bad > 0) failed++;
  }
  // trigger file sanity: the lists exist and every entry explains itself
  const tOk = ['should_trigger', 'should_not_trigger'].every((k) => Array.isArray(triggers[k]) && triggers[k].length >= 5 && triggers[k].every((t) => t.prompt && t.reason));
  if (!flag('json')) console.log(`\n${tOk ? 'PASS' : 'FAIL'}  evals/triggers.json: ${triggers.should_trigger?.length ?? 0} prompts that should use the skill, ${triggers.should_not_trigger?.length ?? 0} that should not (checked for shape only; run --live --triggers to test them)`);
  if (!tOk) failed++;
  if (flag('json')) console.log(JSON.stringify(results, null, 2));
  else console.log(`\n${failed ? 'FAILED' : 'OK'}: ${jobs.length} output director${jobs.length === 1 ? 'y' : 'ies'} checked${failed ? `, ${failed} did not behave as expected` : ''}.`);
  return failed ? 1 : 0;
}

process.exit(await main());
