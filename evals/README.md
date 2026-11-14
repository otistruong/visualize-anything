# Evals

These files test the skill itself: whether an agent picks it up for the right requests, and what the agent does once it has.

| File | What it is |
| --- | --- |
| `triggers.json` | Prompts that should activate the skill and prompts that should not, each with the reason. |
| `cases.json` | Task prompts, each with the behaviour expected, written as assertions a script can check. |
| `run.mjs` | The runner. Offline by default; live only with `--live`. Node.js 18 or later, no dependencies. |
| `fixtures/` | Small output directories used to test the runner. |
| `results/` | Where live runs are saved. Not committed. |

## Offline mode

Offline mode checks output that already exists. It runs no agent and costs nothing.

```bash
node evals/run.mjs                                     # every fixture
node evals/run.mjs --case tcp-handshake --dir <dir>    # your own output
node evals/run.mjs --case tcp-handshake --dir <dir> --actions   # also print the action list
node evals/run.mjs --json                              # machine-readable
node evals/run.mjs --list                              # the cases and how many assertions each has
```

`<dir>` is the directory an agent worked in. The runner looks in it for:

- a spec: any `.json` file that has `actors` and `steps`;
- a built explainer: any `.html` file with an embedded spec;
- `final.md`: the agent's last message, if you saved it;
- `transcript.jsonl` (a Claude Code `--output-format stream-json` log) or `actions.json` (a list of `{ "type", "target" }` objects), if you have one.

To test a real session by hand: run the prompt from `cases.json` in an empty directory with the skill installed, save the agent's last message as `final.md`, and point `--dir` at that directory.

### Reading the table

```
Case tcp-handshake  <-  evals/fixtures/tcp-handshake
-------------------------------------------------------------
PASS  invokes the skill or reads its SKILL.md
PASS  validates before building                              action 7 before action 10
PASS  spec has at least 6 steps                              11 steps
SKIP  final message lists sources                            needs the final message: no final.md or transcript ...
FAIL  at least one failure step with a reason                0 failure step(s) with a reason, expected at least 1
```

- **PASS**: the behaviour was observed. The right-hand column says what was found.
- **FAIL**: the behaviour was not observed. The right-hand column says what was found instead.
- **SKIP**: the check needs something the directory does not have, usually a transcript or the final message. A skip is not a pass. Checks about files (the spec and the HTML) never skip.

The exit code is 0 when no case has a failure, and 1 otherwise.

### The fixtures

`fixtures/tcp-handshake`, `fixtures/oauth-authorization-code` and `fixtures/hash-map-collision` are reference outputs written by hand: each points at the bundled example spec and its built HTML, and adds an `actions.json` and a `final.md` showing the behaviour the skill asks for. `fixtures/default-view` is the TCP example with `"view": "2d"` added and rebuilt. They are not recordings of an agent. They exist so that CI can prove the runner and the examples agree.

`fixtures/bad-output` is a deliberately poor output (a hand-written renderer that loads a script from a CDN, three steps, no failure case, no sources, built before validating). Its `fixture.json` says `"expect": "fail"`, and the run is reported as OK only if the checker does flag it. Read its table to see what failures look like.

## Live mode

Live mode runs a case for real: it creates a temporary directory, installs the skill there as a project skill, starts an agent CLI without a terminal, records what the agent does, and checks the result against the case.

```bash
node evals/run.mjs --live                          # the first case, with the first agent CLI found
node evals/run.mjs --live --case dns-resolution    # one named case
node evals/run.mjs --live --all                    # every case
node evals/run.mjs --live --agent codex --case hash-map-collision
node evals/run.mjs --live --triggers --limit 4     # 4 prompts from each list in triggers.json
```

- It never runs unless you pass `--live`. `npm test` and CI do not use it.
- It uses your installed CLI, your sign-in and your model usage. One case took about two minutes and 11 turns with Claude Code when this was written. The runner asks for no credentials and stores none.
- If no supported CLI is on your `PATH`, it prints a message saying so and exits without running anything.
- Other flags: `--timeout <seconds>` (default 900), `--max-turns <n>` (Claude only, default 60), `--keep` (do not delete the temporary directory), `--out <dir>`.

Before the table, live mode prints the sequence of actions the agent took:

```
What the agent did, in order:
  1. skill   visualize-anything
  2. read    <workdir>/.claude/skills/visualize-anything/references/method.md
  3. read    <workdir>/.claude/skills/visualize-anything/references/spec.md
  4. write   <workdir>/tcp-three-way-handshake.json
  5. command node .claude/skills/visualize-anything/scripts/validate.mjs tcp-three-way-handshake.json
  6. command node .claude/skills/visualize-anything/scripts/build.mjs tcp-three-way-handshake.json ...
```

This list is the most useful thing to read. It shows whether the agent read the method before modelling, whether it looked anything up, how many times it had to fix the spec, and whether it validated before it built.

Each run is saved under `evals/results/<time>/<case>/`: the files the agent wrote, the raw transcript, `actions.json` and `final.md`. Paths inside those files are rewritten (`<workdir>` for the temporary directory, `~` for your home directory), but a transcript can still contain whatever the agent printed. Read a result before you share it. The directory is ignored by git.

### Agents

| Agent | Command used | What is extracted | Status |
| --- | --- | --- | --- |
| `claude` | `claude -p <prompt> --output-format stream-json --verbose --permission-mode acceptEdits --allowedTools ... --max-turns N` | Skill use, files read and written, commands, searches, the final message | Run and working with Claude Code 2.1. Flags from the [headless documentation](https://code.claude.com/docs/en/headless). |
| `codex` | `codex exec --json --sandbox workspace-write --skip-git-repo-check <prompt>` | Commands, file changes, the final message | Written from the [non-interactive mode documentation](https://learn.chatgpt.com/docs/non-interactive-mode). Not run: Codex was not installed. The `command_execution` item type is documented; the other item type names are assumptions. |
| `copilot` | `copilot -p <prompt> --allow-all-tools --no-ask-user -s` | The final message only | Flags from the [Copilot CLI documentation](https://docs.github.com/en/copilot/how-tos/copilot-cli/automate-copilot-cli/run-cli-programmatically). Not run. The event format of `--output-format json` is not documented, so actions are not extracted and transcript checks are skipped. |

The Claude run allows only these tools: `Skill`, `Read`, `Write`, `Edit`, `Glob`, `Grep`, `WebSearch`, `WebFetch`, and `Bash` limited to `node`, `ls`, `cat` and `mkdir`. For Codex the sandbox is `workspace-write`. For Copilot, `--allow-all-tools` lets it run any command without asking, so only use it with prompts you have read.

### Trigger checks

`--live --triggers` sends prompts from `triggers.json` and records whether the agent invoked the skill or read its `SKILL.md`. Each prompt is given a suffix telling the agent to stop after saying what it would do, to keep runs short. Treat the result as a signal, not a measurement: activation varies from run to run, and a description that fires on 9 of 10 prompts today may fire on 7 tomorrow. Run it before and after changing the `description` in `SKILL.md`, and compare.

## What the cases cover

| Case | Why it exists |
| --- | --- |
| `tcp-handshake`, `oauth-authorization-code`, `hash-map-collision` | The workflow on subjects that have a bundled example. The agent may lean on the example, so these test the workflow more than the modelling. |
| `dns-resolution` | A subject with no bundled example. The agent has to do the modelling. |
| `broad-subject` | "Visualize Kubernetes." The agent should pick one path and say which. |
| `edit-existing` | Changing an explainer: edit the spec and rebuild, do not patch the HTML. |
| `default-view` | Making an explainer open in the 2D plan: set `view` in the spec and rebuild, change nothing else. |

Assertions under `common` in `cases.json` apply to every case unless the case sets `"no_common": true`.

The assertions check behaviour and structure. They cannot check that an explainer is correct. A run that passes every assertion still needs a person to open the HTML and read it.

## Adding a case

Add an object to `cases` in `cases.json`:

```json
{
  "id": "raft-election",
  "prompt": "Explain Raft leader election visually.",
  "why": "A distributed algorithm with timers and votes.",
  "assertions": [
    { "check": "min_actors", "value": 3, "expect": "has at least three nodes" },
    { "check": "spec_matches", "pattern": "term", "expect": "shows term numbers" },
    { "check": "spec_matches", "pattern": "raft\\.github\\.io|In Search of an Understandable", "expect": "cites the Raft paper" }
  ]
}
```

- `prompt` is exactly what a user would type. Do not mention the skill.
- `expect` is the sentence printed in the table. Write it as an observable behaviour.
- `setup.copy` (optional) maps files in this repository to paths in the working directory, for cases that start from existing files.
- Prefer assertions that would fail for a plausible bad output. "The spec mentions TCP" is weak. "Something is marked as changed between steps" is strong.

Available checks:

| Check | Parameters | Passes when |
| --- | --- | --- |
| `used_skill` | | The skill was invoked or its `SKILL.md` was read. Needs a transcript. |
| `read_file` | `pattern` | Something matching the pattern was read. Needs a transcript. |
| `wrote_file`, `did_not_write` | `pattern` | A file matching the pattern was, or was not, written. Needs a transcript. |
| `ran_command`, `did_not_run` | `pattern` | A command matching the pattern was, or was not, run. Needs a transcript. |
| `order` | `first`, `then` (each `{ "type", "pattern" }`) | The first match of `first` comes before the first match of `then`. Needs a transcript. |
| `spec_file_written`, `html_file_written` | | The file exists in the output directory. |
| `spec_valid`, `spec_no_warnings` | | The spec passes `validate.mjs`. |
| `html_uses_player` | | The HTML is the bundled player. |
| `html_matches_spec` | | The spec inside the HTML equals the spec file. |
| `html_self_contained` | | The HTML loads no external script, stylesheet, image or frame. |
| `min_steps`, `max_steps`, `min_actors` | `value` | The count is within the bound. |
| `min_fail_steps`, `min_inside_steps`, `min_steps_with_fields`, `min_sources` | `value` | At least that many. |
| `marks_a_change` | | A field is marked `changed`, or a state table appears twice. |
| `has_simplifications` | | `simplifications` is not empty. |
| `spec_view` | `value` (optional) | `view` is left out or is `"2d"` or `"3d"`, and, with `value`, the explainer opens in that view (`"3d"` when `view` is left out). |
| `spec_matches`, `spec_not_matches` | `pattern` | The spec's text matches, or does not match, the pattern. |
| `final_matches` | `pattern` | The final message matches. Needs `final.md` or a transcript. |

Patterns are JavaScript regular expressions, matched without regard to case.

To add a fixture for a new case, create `fixtures/<name>/fixture.json` with `"case"` (the case id), `"expect"` (`"pass"` or `"fail"`) and optionally `"include"` (paths to files that live elsewhere in the repository), and put the output files beside it.

## Adding a trigger prompt

Add `{ "prompt", "reason" }` to `should_trigger` or `should_not_trigger` in `triggers.json`. Good additions are near the boundary: a request that sounds visual but is a chart, or one that never says "visualize" but needs an explainer.
