#!/usr/bin/env node
// Validate one or more visualize-anything specs. No dependencies.
//
//   node validate.mjs spec.json [more.json ...] [--strict] [--json]
//
// Errors make the spec unusable (exit code 1). Warnings point at things that
// usually read badly; --strict turns them into failures too.
// The format is described in ../references/spec.md.

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const COLORS = ['blue', 'green', 'amber', 'purple', 'pink', 'orange', 'cyan', 'gray'];

/* ---------- shared geometry: start ----------
   This block is identical in assets/player.html and scripts/validate.mjs; scripts/check-docs.mjs fails if they differ. */
const U = 64, SKEW = 0.38, DEPTH = 0.56, PLAN_Y = 0.75;
/**
 * Where a point on the ground at [x, y], raised by z, lands on screen. e is how far the view has turned:
 * 0 is the 3D view (from the front and above), 1 the plan (straight from above, where height is not seen).
 */
const projector = (e) => {
  const sk = SKEW * (1 - e), dp = DEPTH + (PLAN_Y - DEPTH) * e, hz = 1 - e;
  return (x, y, z = 0) => [U * (x - sk * y), U * (dp * y - hz * z)];
};
/** w, d, h: the solid in the 3D view. pw, pd: the flat tile that stands for it in the plan. All in grid units. */
const SHAPES = {
  box: { w: 1.25, d: 1.0, h: 0.75, pw: 1.2, pd: 0.9 },
  tower: { w: 0.95, d: 0.9, h: 1.25, pw: 1.0, pd: 0.9 },
  tile: { w: 1.45, d: 1.05, h: 0.2, pw: 1.45, pd: 0.8 },
  cylinder: { w: 1.15, d: 1.0, h: 0.9, pw: 1.1, pd: 0.9 },
  person: { w: 0.7, d: 0.6, h: 1.25, pw: 0.9, pd: 0.9 },
  cloud: { w: 1.7, d: 1.0, h: 0.95, pw: 1.5, pd: 0.9 },
  screen: { w: 1.3, d: 0.95, h: 0.95, pw: 1.2, pd: 0.9 },
  page: { w: 0.95, d: 0.3, h: 1.15, pw: 0.9, pd: 0.9 },
};
const shapeOf = (a) => SHAPES[a.shape] || SHAPES.box;
/** The block of text under an actor in the plan (name, sub, status chip), in pixels. */
const labelSize = (a, statusLen) => ({
  w: Math.max(String(a.label || '').length * 7.3, String(a.sub || '').length * 6.5, statusLen ? statusLen * 6.5 + 16 : 0, 30) + 8,
  h: 16 + (a.sub ? 14 : 0) + (statusLen ? 22 : 0),
});
const overlapArea = (p, q) => Math.max(0, Math.min(p.x1, q.x1) - Math.max(p.x0, q.x0)) * Math.max(0, Math.min(p.y1, q.y1) - Math.max(p.y0, q.y0));
/**
 * The plan view: where each actor's tile sits and where its label goes. A label goes under its tile when that is
 * clear, otherwise to the right, the left or above, whichever covers least of the other tiles, labels, zone names
 * and links. Returns the tiles, the labels (top centre and size) and every overlap that could not be avoided.
 */
function planLayout(spec) {
  const P1 = projector(1);
  const isPos = (p) => Array.isArray(p) && p.length === 2 && p.every((v) => typeof v === 'number' && Number.isFinite(v));
  const actors = (Array.isArray(spec.actors) ? spec.actors : []).filter((a) => a && typeof a === 'object' && isPos(a.pos));
  const statusLen = {};
  for (const s of Array.isArray(spec.steps) ? spec.steps : []) {
    if (s && s.status && typeof s.status === 'object') {
      for (const k of Object.keys(s.status)) if (typeof s.status[k] === 'string') statusLen[k] = Math.max(statusLen[k] || 0, s.status[k].length);
    }
  }
  const tiles = {};
  for (const a of actors) {
    const s = shapeOf(a), c = P1(a.pos[0], a.pos[1]), w = s.pw * U, h = s.pd * U;
    tiles[a.id] = { cx: c[0], cy: c[1], x0: c[0] - w / 2, x1: c[0] + w / 2, y0: c[1] - h / 2, y1: c[1] + h / 2 };
  }
  const zoneNames = [];
  for (const z of Array.isArray(spec.zones) ? spec.zones : []) {
    if (!z || ![z.x, z.y, z.w, z.h].every((v) => typeof v === 'number' && Number.isFinite(v))) continue;
    const c = P1(z.x, z.y + z.h);
    zoneNames.push({ label: String(z.label || ''), x0: c[0] + 4, x1: c[0] + 4 + String(z.label || '').length * 6.8, y0: c[1] + 4, y1: c[1] + 20 });
  }
  const segs = [];
  for (const l of Array.isArray(spec.links) ? spec.links : []) if (Array.isArray(l) && tiles[l[0]] && tiles[l[1]] && l[0] !== l[1]) segs.push([tiles[l[0]], tiles[l[1]]]);
  const crossings = (r) => {
    let n = 0;
    for (const [p, q] of segs) {
      for (let i = 1; i < 24; i++) {
        const x = p.cx + ((q.cx - p.cx) * i) / 24, y = p.cy + ((q.cy - p.cy) * i) / 24;
        if (x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1) n++;
      }
    }
    return n;
  };
  const labels = {}, placed = [];
  for (const a of actors) {
    const t = tiles[a.id], size = labelSize(a, statusLen[a.id] || 0), w = size.w, h = size.h;
    const options = [
      { side: 'below', cx: t.cx, top: t.y1 + 4 },
      { side: 'right', cx: t.x1 + 8 + w / 2, top: t.cy - h / 2 },
      { side: 'left', cx: t.x0 - 8 - w / 2, top: t.cy - h / 2 },
      { side: 'above', cx: t.cx, top: t.y0 - 4 - h },
    ];
    let best = null;
    options.forEach((o, rank) => {
      const r = { x0: o.cx - w / 2, x1: o.cx + w / 2, y0: o.top, y1: o.top + h };
      let cost = rank * 40 + crossings(r) * 60;
      for (const id of Object.keys(tiles)) cost += overlapArea(r, tiles[id]) * 3;
      for (const q of placed) cost += overlapArea(r, q) * 2;
      for (const q of zoneNames) cost += overlapArea(r, q) * 2;
      if (!best || cost < best.cost) best = { side: o.side, cx: o.cx, top: o.top, w, h, cost, rect: r };
    });
    labels[a.id] = best;
    placed.push(best.rect);
  }
  const overlaps = [];
  actors.forEach((a, i) => {
    const r = labels[a.id].rect;
    actors.forEach((b, j) => {
      if (i === j) return;
      if (j > i && overlapArea(tiles[a.id], tiles[b.id]) > 0) overlaps.push({ a: a.id, b: b.id, what: 'tiles' });
      if (j > i && overlapArea(r, labels[b.id].rect) > 0) overlaps.push({ a: a.id, b: b.id, what: 'labels' });
      if (overlapArea(r, tiles[b.id]) > 0) overlaps.push({ a: a.id, b: b.id, what: 'label on tile' });
    });
    for (const q of zoneNames) if (overlapArea(r, q) > 0 || overlapArea(tiles[a.id], q) > 0) overlaps.push({ a: a.id, zone: q.label, what: 'zone name' });
  });
  return { tiles, labels, overlaps };
}
/* ---------- shared geometry: end ---------- */
export { SHAPES, planLayout };
export const VIEWS = ['2d', '3d'];
const P = projector(0);

const LIMITS = { actorLabel: 22, actorSub: 30, status: 26, stepLabel: 28, title: 80, desc: 480, actors: 9, stepsMin: 6, stepsMax: 26 };
const ID = /^[a-z][a-z0-9_-]*$/;

const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** @returns {{errors: string[], warnings: string[]}} */
export function validate(spec) {
  const errors = [], warnings = [];
  const err = (where, msg) => errors.push(`${where}: ${msg}`);
  const warn = (where, msg) => warnings.push(`${where}: ${msg}`);
  const known = (obj, where, keys) => {
    for (const k of Object.keys(obj)) if (!keys.includes(k)) warn(where, `unknown key "${k}" is ignored (allowed: ${keys.join(', ')})`);
  };
  const needStr = (obj, key, where) => {
    if (!isStr(obj[key])) { err(where, `"${key}" is required and must be a non-empty string`); return false; }
    return true;
  };
  const color = (v, where) => {
    if (v !== undefined && !COLORS.includes(v)) err(where, `color "${v}" is not one of ${COLORS.join(', ')} (red is reserved for failures)`);
  };

  if (!isObj(spec)) return { errors: ['spec: must be a JSON object'], warnings };
  known(spec, 'spec', ['$schema', 'version', 'id', 'title', 'summary', 'view', 'kinds', 'actors', 'zones', 'links', 'steps', 'simplifications', 'sources']);
  if (spec.version !== 1) err('spec', '"version" must be the number 1');
  if (needStr(spec, 'id', 'spec') && !/^[a-z0-9][a-z0-9-]*$/.test(spec.id)) err('spec', `"id" must be lowercase letters, digits and hyphens (got "${spec.id}")`);
  needStr(spec, 'title', 'spec');
  needStr(spec, 'summary', 'spec');
  if (spec.view !== undefined && !VIEWS.includes(spec.view)) err('spec', `"view" must be "2d" (the flat plan) or "3d" (the default), or be left out (got ${JSON.stringify(spec.view)})`);

  // kinds
  const kinds = isObj(spec.kinds) ? spec.kinds : {};
  if (!isObj(spec.kinds) || !Object.keys(kinds).length) err('kinds', 'is required: an object mapping a kind id to { "label", "color" }');
  for (const [k, v] of Object.entries(kinds)) {
    const w = `kinds.${k}`;
    if (!ID.test(k)) err(w, 'kind ids must start with a lowercase letter and use only a-z, 0-9, "-" and "_"');
    if (!isObj(v)) { err(w, 'must be an object { "label", "color" }'); continue; }
    known(v, w, ['label', 'color']);
    needStr(v, 'label', w);
    if (v.color === undefined) err(w, `"color" is required (one of ${COLORS.join(', ')})`);
    color(v.color, w);
  }

  // actors
  const ids = new Set();
  const actors = Array.isArray(spec.actors) ? spec.actors : [];
  if (!Array.isArray(spec.actors) || actors.length < 2) err('actors', 'is required and needs at least 2 actors');
  if (actors.length > LIMITS.actors) warn('actors', `${actors.length} actors is crowded; ${LIMITS.actors} or fewer reads better. Merge actors or split the subject into two specs`);
  const placed = [];
  actors.forEach((a, i) => {
    const w = `actors[${i}]${isObj(a) && isStr(a.id) ? ` (${a.id})` : ''}`;
    if (!isObj(a)) return err(w, 'must be an object');
    known(a, w, ['id', 'label', 'sub', 'shape', 'pos', 'color']);
    if (needStr(a, 'id', w)) {
      if (!ID.test(a.id)) err(w, '"id" must start with a lowercase letter and use only a-z, 0-9, "-" and "_"');
      if (ids.has(a.id)) err(w, `duplicate actor id "${a.id}"`);
      ids.add(a.id);
    }
    if (needStr(a, 'label', w) && a.label.length > LIMITS.actorLabel) warn(w, `label is ${a.label.length} characters; keep it to ${LIMITS.actorLabel} and move detail to "sub"`);
    if (a.sub !== undefined && typeof a.sub !== 'string') err(w, '"sub" must be a string');
    if (isStr(a.sub) && a.sub.length > LIMITS.actorSub) warn(w, `sub is ${a.sub.length} characters; keep it to ${LIMITS.actorSub}`);
    if (a.shape !== undefined && !SHAPES[a.shape]) err(w, `shape "${a.shape}" is not one of ${Object.keys(SHAPES).join(', ')}`);
    color(a.color, w);
    if (!Array.isArray(a.pos) || a.pos.length !== 2 || !a.pos.every(isNum)) err(w, '"pos" is required and must be [x, y] with two numbers');
    else placed.push(a);
  });

  // layout: bodies must not overlap; labels should not collide
  const rectOf = (a) => {
    const s = SHAPES[a.shape] || SHAPES.box;
    const [lx, ly0] = P(a.pos[0], a.pos[1] + s.d / 2, 0);
    const lw = Math.max(a.label ? String(a.label).length * 7.3 : 0, a.sub ? String(a.sub).length * 6.5 : 0, 30) / 2 + 4;
    const top = P(a.pos[0], a.pos[1] - s.d / 2, s.h)[1];
    const left = P(a.pos[0] - s.w / 2, a.pos[1] + s.d / 2)[0], right = P(a.pos[0] + s.w / 2, a.pos[1] - s.d / 2)[0];
    return {
      body: { x0: left, x1: right, y0: top, y1: ly0 },
      label: { x0: lx - lw, x1: lx + lw, y0: ly0 + 4, y1: ly0 + 4 + 16 + (a.sub ? 14 : 0) + 22 },
    };
  };
  const hit = (p, q) => p.x0 < q.x1 && q.x0 < p.x1 && p.y0 < q.y1 && q.y0 < p.y1;
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i], b = placed[j], sa = SHAPES[a.shape] || SHAPES.box, sb = SHAPES[b.shape] || SHAPES.box;
      const dx = Math.abs(a.pos[0] - b.pos[0]), dy = Math.abs(a.pos[1] - b.pos[1]);
      const pair = `actors "${a.id}" and "${b.id}"`;
      if (dx < (sa.w + sb.w) / 2 && dy < (sa.d + sb.d) / 2) {
        err('layout', `${pair} overlap at [${a.pos}] and [${b.pos}]; move them at least 3 apart on x or 2.5 apart on y`);
        continue;
      }
      const ra = rectOf(a), rb = rectOf(b);
      if (hit(ra.label, rb.label)) warn('layout', `the labels of ${pair} will overlap; move them further apart or shorten the labels`);
      else if (hit(ra.label, rb.body) || hit(rb.label, ra.body)) warn('layout', `${pair}: one sits on top of the other's label; put more distance between them on y (about 2.5) or on x (about 3)`);
    }
  }

  // zones
  if (spec.zones !== undefined && !Array.isArray(spec.zones)) err('zones', 'must be an array');
  (Array.isArray(spec.zones) ? spec.zones : []).forEach((z, i) => {
    const w = `zones[${i}]`;
    if (!isObj(z)) return err(w, 'must be an object');
    known(z, w, ['label', 'x', 'y', 'w', 'h', 'color']);
    needStr(z, 'label', w);
    for (const k of ['x', 'y', 'w', 'h']) if (!isNum(z[k])) err(w, `"${k}" is required and must be a number`);
    if (isNum(z.w) && z.w <= 0) err(w, '"w" must be greater than 0');
    if (isNum(z.h) && z.h <= 0) err(w, '"h" must be greater than 0');
    color(z.color, w);
    if (['x', 'y', 'w', 'h'].every((k) => isNum(z[k]))) {
      // the label hangs just below the zone's front edge
      const lab = P(z.x, z.y + z.h);
      const zr = { x0: lab[0] + 4, x1: lab[0] + 4 + String(z.label || '').length * 6.8, y0: lab[1] + 4, y1: lab[1] + 20 };
      for (const a of placed) {
        const r = rectOf(a);
        if (hit(zr, r.body) || hit(zr, r.label)) warn(w, `the zone label "${z.label}" collides with actor "${a.id}"; make the zone reach about 2.5 units in front of (greater y than) the actors inside it, and keep outside actors clear of its front edge`);
      }
    }
  });

  // the plan (2D view): tiles must not overlap, and every label needs a free side
  if (!errors.some((e) => e.startsWith('layout:'))) {
    const zonesOk = (Array.isArray(spec.zones) ? spec.zones : []).filter((z) => isObj(z) && ['x', 'y', 'w', 'h'].every((k) => isNum(z[k])));
    const plan = planLayout({ actors: placed, zones: zonesOk, links: Array.isArray(spec.links) ? spec.links : [], steps: Array.isArray(spec.steps) ? spec.steps.filter(isObj) : [] });
    const seen = new Set();
    for (const o of plan.overlaps) {
      const msg = o.what === 'tiles'
        ? `in the 2D plan the tiles of actors "${o.a}" and "${o.b}" overlap; move them about 1.5 apart on x or y`
        : o.what === 'labels'
          ? `in the 2D plan the labels of actors "${o.a}" and "${o.b}" overlap and neither has a free side; move them further apart or shorten the labels`
          : o.what === 'label on tile'
            ? `in the 2D plan the label of actor "${o.a}" covers actor "${o.b}"; move them further apart`
            : `in the 2D plan the zone name "${o.zone}" collides with actor "${o.a}"; keep actors clear of the zone's front-left corner`;
      if (!seen.has(msg)) { seen.add(msg); warn('layout', msg); }
    }
  }

  // links
  if (spec.links !== undefined && !Array.isArray(spec.links)) err('links', 'must be an array of [actorId, actorId] pairs');
  const linkSeen = new Set();
  (Array.isArray(spec.links) ? spec.links : []).forEach((l, i) => {
    const w = `links[${i}]`;
    if (!Array.isArray(l) || l.length !== 2 || !l.every(isStr)) return err(w, 'must be a pair of actor ids, e.g. ["client", "server"]');
    for (const id of l) if (!ids.has(id)) err(w, `"${id}" is not an actor id (actors: ${[...ids].join(', ')})`);
    if (l[0] === l[1]) err(w, 'links an actor to itself');
    const key = [...l].sort().join('|');
    if (linkSeen.has(key)) warn(w, `duplicate link between "${l[0]}" and "${l[1]}"`);
    linkSeen.add(key);
  });

  // steps
  const steps = Array.isArray(spec.steps) ? spec.steps : [];
  if (!Array.isArray(spec.steps) || !steps.length) err('steps', 'is required and needs at least 1 step');
  else if (steps.length < LIMITS.stepsMin) warn('steps', `only ${steps.length} steps; most subjects need at least ${LIMITS.stepsMin} once decisions and a failure case are their own steps`);
  if (steps.length > LIMITS.stepsMax) warn('steps', `${steps.length} steps is long; consider splitting the subject into two specs`);
  const used = new Set(), usedKinds = new Set();
  let fails = 0, internal = 0;
  steps.forEach((s, i) => {
    const w = `steps[${i}]${isObj(s) && isStr(s.title) ? ` ("${s.title.slice(0, 40)}")` : ''}`;
    if (!isObj(s)) return err(w, 'must be an object');
    known(s, w, ['from', 'to', 'kind', 'label', 'title', 'desc', 'fields', 'payload', 'state', 'notes', 'fail', 'status']);
    if (needStr(s, 'from', w)) {
      if (!ids.has(s.from)) err(w, `"from" refers to "${s.from}", which is not an actor id (actors: ${[...ids].join(', ')})`);
      used.add(s.from);
    }
    if (s.to !== undefined) {
      if (!isStr(s.to)) err(w, '"to" must be an actor id, or be left out for something that happens inside "from"');
      else {
        if (!ids.has(s.to)) err(w, `"to" refers to "${s.to}", which is not an actor id (actors: ${[...ids].join(', ')})`);
        if (s.to === s.from) err(w, '"to" equals "from"; leave "to" out for a decision or lookup inside one actor');
        used.add(s.to);
      }
    } else internal++;
    if (needStr(s, 'kind', w)) {
      if (!kinds[s.kind]) err(w, `kind "${s.kind}" is not defined in "kinds" (defined: ${Object.keys(kinds).join(', ') || 'none'})`);
      usedKinds.add(s.kind);
    }
    if (needStr(s, 'label', w) && s.label.length > LIMITS.stepLabel) warn(w, `label is ${s.label.length} characters; keep the arrow label to ${LIMITS.stepLabel} and put the rest in "title" or "desc"`);
    if (needStr(s, 'title', w) && s.title.length > LIMITS.title) warn(w, `title is ${s.title.length} characters; keep it to ${LIMITS.title}`);
    if (needStr(s, 'desc', w) && s.desc.length > LIMITS.desc) warn(w, `desc is ${s.desc.length} characters; a step should carry one idea. Split it or move detail to "notes"`);

    if (s.fields !== undefined) {
      if (!Array.isArray(s.fields)) err(w, '"fields" must be an array of groups { "group", "rows" }');
      else s.fields.forEach((g, gi) => {
        const gw = `${w} fields[${gi}]`;
        if (!isObj(g)) return err(gw, 'must be an object { "group", "rows", "changed"? }');
        known(g, gw, ['group', 'color', 'rows', 'changed']);
        needStr(g, 'group', gw);
        color(g.color, gw);
        const names = new Set();
        if (!Array.isArray(g.rows) || !g.rows.length) err(gw, '"rows" is required: an array of [name, value] or [name, value, note]');
        else g.rows.forEach((r, ri) => {
          if (!Array.isArray(r) || r.length < 2 || r.length > 3 || !r.every((v) => typeof v === 'string')) err(gw, `rows[${ri}] must be [name, value] or [name, value, note], all strings (numbers go in quotes)`);
          else {
            if (names.has(r[0])) err(gw, `rows[${ri}] repeats the field name "${r[0]}"`);
            names.add(r[0]);
          }
        });
        if (g.changed !== undefined) {
          if (!Array.isArray(g.changed) || !g.changed.every(isStr)) err(gw, '"changed" must be an array of field names');
          else for (const c of g.changed) if (!names.has(c)) err(gw, `"changed" names "${c}", which is not a field in this group (fields: ${[...names].join(', ')})`);
        }
      });
    }
    if (s.payload !== undefined && !isStr(s.payload)) err(w, '"payload" must be a non-empty string');
    if (s.state !== undefined) {
      if (!Array.isArray(s.state)) err(w, '"state" must be an array of tables { "title", "head", "rows" }');
      else {
        const titles = new Set();
        s.state.forEach((t, ti) => {
          const tw = `${w} state[${ti}]`;
          if (!isObj(t)) return err(tw, 'must be an object { "title", "head", "rows", "mark"? }');
          known(t, tw, ['title', 'head', 'rows', 'mark']);
          if (needStr(t, 'title', tw)) {
            if (titles.has(t.title)) err(tw, `two tables in one step share the title "${t.title}"`);
            titles.add(t.title);
          }
          const cols = Array.isArray(t.head) ? t.head.length : 0;
          if (!Array.isArray(t.head) || !cols || !t.head.every((v) => typeof v === 'string')) err(tw, '"head" is required: an array of column names');
          if (!Array.isArray(t.rows)) err(tw, '"rows" is required: an array of rows, each an array of strings');
          else t.rows.forEach((r, ri) => {
            if (!Array.isArray(r) || !r.every((v) => typeof v === 'string')) err(tw, `rows[${ri}] must be an array of strings (numbers go in quotes)`);
            else if (cols && r.length !== cols) err(tw, `rows[${ri}] has ${r.length} cells but "head" has ${cols} columns`);
          });
          if (t.mark !== undefined) {
            if (!Array.isArray(t.mark) || !t.mark.every(Number.isInteger)) err(tw, '"mark" must be an array of row indexes');
            else for (const m of t.mark) if (m < 0 || m >= (Array.isArray(t.rows) ? t.rows.length : 0)) err(tw, `"mark" index ${m} is outside the table (rows: ${Array.isArray(t.rows) ? t.rows.length : 0})`);
          }
        });
      }
    }
    if (s.notes !== undefined && (!Array.isArray(s.notes) || !s.notes.every(isStr))) err(w, '"notes" must be an array of non-empty strings');
    if (s.fail !== undefined) {
      if (!isStr(s.fail)) err(w, '"fail" must be a string that says why this step fails (not true/false)');
      else fails++;
    }
    if (s.status !== undefined) {
      if (!isObj(s.status)) err(w, '"status" must be an object mapping actor ids to a short state string');
      else for (const [k, v] of Object.entries(s.status)) {
        used.add(k);
        if (!ids.has(k)) err(w, `"status" refers to "${k}", which is not an actor id`);
        if (typeof v !== 'string') err(w, `status of "${k}" must be a string ("" clears it)`);
        else if (v.length > LIMITS.status) warn(w, `status of "${k}" is ${v.length} characters; keep it to ${LIMITS.status}`);
      }
    }
  });
  for (const id of ids) if (!used.has(id)) warn('actors', `actor "${id}" never sends, receives or changes status in any step; remove it or give it a part`);
  for (const k of Object.keys(kinds)) if (!usedKinds.has(k)) warn('kinds', `kind "${k}" is defined but no step uses it`);
  if (steps.length && !fails) warn('steps', 'no step has "fail". Add at least one case that is lost, refused or blocked, and say why');
  if (steps.length >= 4 && !internal) warn('steps', 'every step is a message. Decisions and lookups inside an actor should be their own steps (leave "to" out)');

  // simplifications and sources
  if (!Array.isArray(spec.simplifications) || !spec.simplifications.length || !spec.simplifications.every(isStr)) {
    err('simplifications', 'is required: an array with at least one sentence saying what the model leaves out');
  }
  if (!Array.isArray(spec.sources) || !spec.sources.length) err('sources', 'is required: an array with at least one { "title", "url" }');
  else spec.sources.forEach((s, i) => {
    const w = `sources[${i}]`;
    if (!isObj(s)) return err(w, 'must be an object { "title", "url", "note"? }');
    known(s, w, ['title', 'url', 'note']);
    needStr(s, 'title', w);
    if (s.url !== undefined && !(isStr(s.url) && /^https?:\/\/\S+$/.test(s.url))) err(w, '"url" must start with http:// or https://');
    if (s.url === undefined && !isStr(s.note)) err(w, 'needs a "url", or a "note" saying where to find it (for a book or an offline source)');
    if (s.note !== undefined && !isStr(s.note)) err(w, '"note" must be a non-empty string');
  });

  return { errors, warnings };
}

export function validateFile(path) {
  let text;
  try { text = readFileSync(path, 'utf8'); } catch (e) { return { errors: [`cannot read ${path}: ${e.message}`], warnings: [] }; }
  let spec;
  try { spec = JSON.parse(text); } catch (e) { return { errors: [`${path} is not valid JSON: ${e.message}`], warnings: [] }; }
  return { ...validate(spec), spec };
}

function main(argv) {
  const files = argv.filter((a) => !a.startsWith('--'));
  const strict = argv.includes('--strict'), json = argv.includes('--json');
  if (!files.length || argv.includes('--help')) {
    console.error('usage: node validate.mjs <spec.json> [more.json ...] [--strict] [--json]');
    return 2;
  }
  let bad = 0;
  const out = [];
  for (const f of files) {
    const { errors, warnings, spec } = validateFile(f);
    const ok = !errors.length && !(strict && warnings.length);
    if (!ok) bad++;
    out.push({ file: f, ok, errors, warnings });
    if (json) continue;
    for (const e of errors) console.log(`error    ${e}`);
    for (const w of warnings) console.log(`${strict ? 'error  ' : 'warning'}  ${w}`);
    const n = spec && Array.isArray(spec.steps) ? `${spec.actors?.length ?? 0} actors, ${spec.steps.length} steps` : '';
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${f}${ok && n ? `  (${n}${warnings.length ? `, ${warnings.length} warning${warnings.length > 1 ? 's' : ''}` : ''})` : `  (${errors.length} error${errors.length === 1 ? '' : 's'}, ${warnings.length} warning${warnings.length === 1 ? '' : 's'})`}`);
  }
  if (json) console.log(JSON.stringify(out, null, 2));
  return bad ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main(process.argv.slice(2)));
