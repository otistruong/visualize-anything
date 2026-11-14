---
name: visualize-anything
description: Turn any process, protocol, architecture or algorithm into an interactive step-by-step visual explainer - one self-contained HTML file with a scene of actors, a token that moves between them one step at a time, a sequence timeline, and an inspector showing what is in play and what changed at each step. The subject is written as a JSON spec and a bundled player renders it. Use when the user asks to visualize how something works, animate a flow, make a step-by-step or playable sequence diagram, explain something visually, or build an interactive explainer or walkthrough - for example a TCP handshake, an OAuth flow, a request path through a system, a consensus round, or how a data structure or algorithm proceeds. Do not use for charts or dashboards of numeric data, for a static diagram with no sequence of steps (architecture boxes, org charts, mind maps), or for slide decks.
license: MIT
---

# Visualize anything

You turn a subject into a visual explainer that a person can play, pause and step through. You do not write a renderer. The renderer already exists: `assets/player.html`. Your work is to understand the subject and write it down as data, a **spec**: who takes part (actors), where they sit (positions, zones, links), and what happens, one step at a time.

The result is a single HTML file with the spec embedded in it. It needs no server, no build and no network.

All paths in this file are relative to this skill's directory (the directory that contains this `SKILL.md`). Run the scripts from wherever the user's files are, using the full path to the script.

## When this fits

Use it when the subject has **things** and a **sequence**: messages between parties, a request crossing components, an algorithm changing a data structure, a document moving through approvals.

Do not use it for numeric data (use a chart), or for a picture with no order of events (use a plain diagram). If the request is one of those, say so and offer the right kind of output instead.

## Workflow

Follow the steps in order. Do not skip validation.

### 1. Understand the subject

- Pin down scope with the user's words: which variant, which version, where it starts and ends. If the request is broad ("visualize Kubernetes"), pick one concrete path through it (for example "what happens when a Pod is scheduled") and say that you did.
- Get the facts right before drawing anything. If you can search or fetch, check the primary source (the RFC, the specification, the official documentation, the source code). If you cannot, rely only on what you are sure of and say which points you could not verify.
- Record each source as you go. They go into the spec.

Read `references/method.md` now. It explains how to break a subject into steps that teach: one idea per step, decisions as their own steps, what changed at each hop, and at least one failure case.

### 2. Write the spec

Create `<subject-id>.json` in the user's working directory (or where they asked). Read `references/spec.md` for the format; it has every field and a complete small example. For fuller models, look at one of the examples next to this file:

- `examples/tcp-handshake.json`: a network protocol, two actors, state tables and a lost packet.
- `examples/oauth-authorization-code.json`: five parties, HTTP payloads and a refused request.
- `examples/hash-map-collision.json`: a data structure, not a network.

Rules that matter most:

- Every step has `from`, `kind`, `label`, `title` and `desc`. A step with `to` moves a token between two actors. A step without `to` is something that happens inside one actor: a decision, a lookup, a computation.
- Put the detail a reader would want to inspect into `fields` (what the message or item contains, with `changed` naming the fields that differ from the hop before) and `state` (tables an actor keeps). Use realistic values, not placeholders.
- Give at least one step a `fail` string that says why it is lost, refused or blocked.
- Fill in `simplifications` (what the model leaves out) and `sources` (where the facts come from). Both are required.
- Set `"view": "2d"` when the lesson is topology or containment (who connects to whom, what is inside which boundary); leave it out for the 3D view. `references/method.md` says more.
- Aim for 6 to 20 steps and 2 to 8 actors. If you need more, split the subject into two specs.

### 3. Validate

```bash
node scripts/validate.mjs <subject-id>.json
```

Fix every error. Read every warning and fix it unless you have a reason not to: warnings are about overlapping labels (in either view), missing failure cases and text that is too long to read on screen. Run it again until it prints `OK`.

### 4. Build

```bash
node scripts/build.mjs <subject-id>.json <subject-id>.html
```

This embeds the spec into a copy of the player and writes one standalone HTML file. The build validates again and refuses a spec with errors.

If Node.js is not available, copy `assets/player.html` to the output path and replace the contents of its `<script type="application/json" id="spec">` element with the spec, writing every `<` inside the JSON as `<`. Check the spec by hand against `references/spec.md`, and tell the user it was not machine-validated.

### 5. Check the result

- If you can open a browser or take a screenshot, load the HTML file, step through it in both views (press `V`), and look: labels must not overlap, the token must end on the right actor, the failure step must look like a failure. Fix the spec and rebuild if not. Adding `#step=4&view=2d` to the file's address opens step 4 in the 2D plan.
- If you cannot, re-read the spec once from the top as a reader would, checking that each step follows from the one before and that numbers carried across steps (sequence numbers, ids, counters, table rows) agree.

Never edit the built HTML by hand. Change the spec and build again.

### 6. Report

End with a short message that contains, in this order:

1. The files you wrote (spec and HTML) and how to open the HTML (double-click it or open it in any browser; `Space` plays, arrow keys step).
2. What it covers: the path you modelled, the number of steps, and the failure case or cases.
3. **Simplifications**: what you left out or made simpler than the real thing.
4. **Sources**: the documents the facts come from, with links. Mark anything you could not verify.
5. One sentence saying it is a teaching model that should be checked against those sources before anyone relies on it.

## Changing an existing explainer

Edit the spec JSON, then validate and build again. The spec is the source; the HTML is output. If the user only has the HTML, the spec is the JSON inside its `<script id="spec">` element: copy it out into a `.json` file first.

## What the player gives you

You do not need to build any of this; knowing it helps you write a spec that uses it.

- One scene in two views that the reader switches between with the 2D / 3D buttons or the `V` key: a 3D view (actors as simple solids, zones as outlined areas on the ground, links as dashed lines) and a flat 2D plan seen from above (actors as tiles with an icon, zones as rectangles, labels placed clear of each other). The top-level `view` sets which one it opens in; the default is 3D. The turn between them is animated, and the browser remembers the reader's choice per explainer.
- One token per step that travels from `from` to `to` with the step's `label`, or pulses on an actor for an inside step. A failed hop stops part-way, turns red and is marked with a cross. Both look the same in either view.
- A status chip under each actor (`status` in a step) that persists until changed, for things like connection state or the contents of a slot.
- A sequence timeline of all steps. Click a row to jump to it.
- An inspector with the title, description, field groups with changed fields highlighted, a raw payload, state tables with cells that changed since the table was last shown highlighted automatically, and notes.
- Play, pause, step, restart, four speeds, keyboard shortcuts, light and dark themes that follow the system, and a layout that works on a phone.
- A closing panel listing the simplifications and sources from the spec.

## Files in this skill

| Path | Read it when |
| --- | --- |
| `references/method.md` | Before modelling any subject. How to choose actors and steps. |
| `references/spec.md` | While writing the spec. Every field, limits, layout guidance, a full example. |
| `examples/*.json` | You want a complete model to compare against. |
| `scripts/validate.mjs` | Always, before building. |
| `scripts/build.mjs` | To produce the HTML. |
| `assets/player.html` | Do not read it in full; it is the fixed renderer. Only open it for the manual build fallback. |
