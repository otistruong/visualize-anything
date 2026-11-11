# Working on this repository

This repository publishes one agent skill, `visualize-anything`. These notes are for an agent (or a person) changing the repository itself. To use the skill, read `skills/visualize-anything/SKILL.md`.

- The skill in `skills/visualize-anything/` is the single source of truth.
- Generated files, never edited by hand: `examples/*.html` (run `npm run build`), and `.claude-plugin/*.json`, `plugin.json`, `adapters/**` (run `npm run sync`).
- Run `npm test` before finishing. It needs Node.js 18 or later and installs nothing.
- The player (`skills/visualize-anything/assets/player.html`) must stay one file with no dependencies and no network requests.
- Writing style: plain and direct, no marketing language, no emoji.
- Details are in `CONTRIBUTING.md`.
