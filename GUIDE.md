# Pi Herdr Agents — Guide

This guide is for using this fork day to day. It explains what the extension
does, how a team runs, and how to prompt it. The canonical reference pages are
linked at the bottom.

## What this is

One Pi extension. Pi + Herdr only.

It launches asynchronous Pi child agents in Herdr panes, supervises them while
they run, and delivers each child's result back to the parent session
automatically. This fork also bundles an orchestration team: a persistent
**senior** leads one gate worktree, **workers** implement, **testers** write
strict tests, and a **researcher** answers bounded questions. Your parent Pi
session is the **orchestrator**.

You do not poll. You launch work, keep talking, and results arrive as new turns.

## What it does

- Opens Herdr panes (grouped into extension-owned `Agents` tabs) and, when
  asked, one managed Git worktree per team.
- Starts a real `pi` process in each pane with its own model, thinking level,
  tools, skills, and child protocol.
- Watches process state and child activity, and shows a live status widget.
- Delivers one bounded result per run, with a `subagent_result` message that
  tells the parent to evaluate the child report rather than obey it.
- Supports interrupt (stop one turn), cancel (end an ordinary run), stop
  (graceful persistent shutdown), resume (ordinary sessions), and persistent
  specialists.
- Records outcome and evidence for review; it never pushes, merges, opens a PR,
  switches the parent checkout, deletes a branch, or removes a worktree on its
  own.

The bundled team adds:

- `/team <slug> <task>` to start a team in a new worktree.
- Four roles with an escalation chain to you.
- A role-scoped `spawn-agents` allowlist: the senior may launch workers,
  testers, and the researcher; workers and testers may launch only the
  researcher; the researcher launches nobody.
- One worktree per team, retained for your review.

## Requirements

- Pi with package support.
- Herdr and its CLI.
- `HERDR_ENV=1`, which means Pi is started from inside Herdr.
- `pi` and `herdr` on the `PATH` of the Herdr server.

No other harness or terminal multiplexer is supported.

## Install

This is a personal fork. Install from the checkout, not from the upstream npm
package:

```bash
pi install -l /absolute/path/to/pi-personal-herdr-agents
# or try it for one run
pi -e /absolute/path/to/pi-personal-herdr-agents
```

Then start Pi inside Herdr:

```bash
herdr
pi
```

Run `/reload` after installing or updating the package.

Optional: install `@juicesharp/rpiv-ask-user-question` in the orchestrator so it
can ask you structured questions. The team children deliberately do not get
that tool; their questions go up the chain.

## First 10 minutes

1. Confirm the roles are visible:

   ```text
   /subagent list
   ```

   You should see `team-senior`, `team-worker`, `team-tester`, and
   `team-researcher`, each with `(package:pi-herdr-agents)` and the default
   model.

2. Start a small team:

   ```text
   /team demo Add a hello-world endpoint and a focused test for it.
   ```

3. Watch the widgets and the new Herdr workspace. The senior is in the worktree
   root; its children appear in the `Agents` tab.

4. When the senior reports, review the worktree:

   ```text
   /worktree list
   ```

5. When you are done, clean up explicitly:

   ```text
   /worktree remove demo
   ```

   Dirty work is blocked unless you commit it first or pass `--preserve`.

## The team

| Role | Shape | Responsibility | Default skills |
| --- | --- | --- | --- |
| orchestrator | your parent Pi session | owns the request, asks you, reviews and integrates | — |
| `team-senior` | persistent, managed worktree | plans, assigns bounded work, reviews the diff, runs tests, commits, escalates | `ponytail`, `team-protocol` |
| `team-worker` | ordinary, auto-exit | one bounded implementation in named files | `team-protocol` |
| `team-tester` | ordinary, auto-exit | strict tests for the assigned behavior | `team-protocol`, `strict-tests` |
| `team-researcher` | ordinary, auto-exit, read-only | one cited research question | `team-research` |

All four roles default to:

```yaml
model: opencode-go/deepseek-v4.1-flash
thinking: max
```

The orchestrator can be any model. The senior is persistent because a managed
worktree child cannot be resumed with `subagent_resume`; keeping it alive is what
lets it answer escalations and keep its worktree lease.

### Authority

- Workers and testers decide *how* to implement or test their assignment.
- The senior decides *what* is assigned, the order, the review, and the commit.
- The orchestrator decides scope, priority, and what ships; it asks you.
- Nobody asks the human directly. The chain is worker/tester/researcher →
  senior → orchestrator → you.

This is a prompt contract plus the host's `spawn-agents` boundary. It is not an
OS sandbox.

## How it works

### A launch

`/team auth Add rate limiting` asks the orchestrator to call:

```typescript
subagent({
  agent: "team-senior",
  name: "team-auth",
  persistent: true,
  worktree: { branch: "team/auth" },
  task: "You lead team auth. ...",
})
```

The host:

1. validates the role, depth, and spawn allowlist;
2. resolves the model and thinking;
3. creates the worktree and writes its ownership manifest;
4. opens the senior's pane and starts a real Pi child session there;
5. returns immediately; completion arrives later as a message.

The senior then launches its children with `cwd` set to the worktree. They share
the checkout, so the senior keeps writers serial or assigns disjoint file sets.

### Panes and worktrees

- Ordinary children open in `Agents` tabs in the target workspace.
- A team senior opens in the root pane of its worktree workspace.
- Panes are created without stealing focus.
- The worktree workspace is retained after success, failure, and help requests.
- Disposable ordinary panes close after delivery; the senior's root stays.

### Completion

The host watches three kinds of evidence:

1. the child's `.exit` sidecar (the authoritative semantic result);
2. the shell's `__SUBAGENT_DONE_<code>__` sentinel;
3. pane disappearance, with a short grace window.

It then finalizes evidence (worktree handoff, accept re-check, outcome ledger)
before delivering one bounded message to the parent. Delivery is gated: a
suppressed run delivers nothing, and a failed send retains the pane rather than
destroying evidence.

### Escalation

A child that needs a decision calls `caller_ping` with:

```text
ESCALATE
from: worker | tester | researcher | senior
question: <one sentence>
options: A) ...  B) ...
blocking: yes | no
default-if-silent: <the safe choice>
already-tried: <files, commands, sources>
```

Workers and testers end their run when they ping. The senior resumes or
reassigns them. A persistent senior stays alive; the orchestrator answers with
`subagent_send`. The orchestrator asks you with `ask_user_question` when
installed.

## Using the team

### Launch

```text
/team <slug> <task> [flags]
```

The slug becomes the branch `team/<slug>` and the senior's name `team-<slug>`.
The worktree base defaults to the committed `HEAD`; uncommitted parent changes
are not copied.

### Model and skill flags

```text
/team auth Add rate limiting \
  --model=provider/senior-model --thinking=high \
  --worker-model=provider/worker-model --worker-thinking=medium \
  --tester-model=provider/tester-model --tester-thinking=high \
  --research-model=provider/research-model --research-thinking=low \
  --skills=my-skill
```

- `--model` / `--thinking` set the senior's own launch.
- `--worker-*`, `--tester-*`, `--research-*` write a child policy block into the
  senior's brief.
- `--skills` adds skills to the whole team:
  - senior: `ponytail,team-protocol,<extras>`
  - worker: `team-protocol,<extras>`
  - tester: `team-protocol,strict-tests,<extras>`
  - researcher: `team-research,<extras>`
- Invalid thinking levels, invalid skill names, and empty flags return a clear
  error.
- Unknown `--tokens` stay in the task text.

The senior's model must be one exact `provider/model-id` because it is a
worktree child. Workers, testers, and the researcher are ordinary children and
may use a comma fallback list.

### A good brief

Give the senior a bounded outcome, not a wish. A useful brief has:

- **Goal** — what the feature must do, in one or two sentences.
- **Scope** — the files or modules allowed, and what is out of scope.
- **Verification** — the exact test command and any focused tests.
- **Commit policy** — edit, test, commit, report the SHA; do not push, merge, or
  remove the worktree.
- **Questions** — what the senior must escalate rather than decide.

Example:

```text
Add rate limiting to the login endpoint.

Scope: src/auth/login.ts, src/auth/rate-limit.ts, test/auth/. Do not touch the
session schema or public API.

Verification: npm test -- auth. Also add a focused test for the 429 path.

Commit: edit, test, commit with a clear message, report the SHA. Do not push,
merge, switch branches, or remove the worktree.

Escalate before adding a dependency, changing the schema, or touching files
outside scope.
```

If you want per-child runtimes, add the `Team launch policy` block or use the
flags above. The senior's protocol skill tells it to pass those exact values on
every child launch.

### Durable role defaults

For a permanent change, edit the role files:

```text
pi-extension/subagents/team/roles/team-worker.md
```

or override without touching the package:

```text
.pi/agents/team-worker.md        # project override
~/.pi/agent/agents/team-worker.md  # global override
```

The override needs the same filename stem. Project beats global beats package.

### Adding a skill

1. Make it discoverable by the child's Pi:
   - project: `.pi/skills/<name>/SKILL.md`
   - global: `$PI_CODING_AGENT_DIR/skills/<name>/SKILL.md`
   - an installed Pi package's `pi.skills`
2. Declare the name in the role's `skills:` or pass `skills:` on the launch.

`skills` **replaces** the role's default list; it does not add to it. For
example, a worker launched with `skills: "my-skill"` loses `team-protocol`
unless you include it.

**Worktree caveat:** the team runs in the worktree. A project skill or
`.pi/agents` override that exists only as an uncommitted file in the parent
checkout is not copied into the worktree. Commit it to the base branch, or use
the global directories.

### Research

Any team member may ask `team-researcher` one bounded question. The researcher:

- reads the repository first;
- goes to primary sources for external questions;
- never changes code;
- returns:

```text
ANSWER
question: ...
answer: ...
evidence: [source, claim] ...
confidence: high | medium | low
unknowns: ...
```

Ask one question at a time, with the version or source that matters. Every
question is a full child launch, so batch related questions.

### Controlling children

| Goal | Use | Effect |
| --- | --- | --- |
| Stop the current turn, keep the child | `subagent_interrupt({ id\|name })` | Sends Escape; the session stays open. |
| End an ordinary child | `subagent_cancel({ id\|name })` | Records cancel intent first; delivers one cancelled result; no fallback. |
| End a persistent senior | `subagent_stop({ id\|name })` | Waits for the active task, then confirms exit. |
| Continue a persistent senior | `subagent_send({ id\|name, message })` | One task at a time. |
| List roles and live specialists | `subagents_list` | Definitions, live persistent specialists, supervision mode. |

Do not close panes or kill processes by hand to cancel. Use `subagent_cancel`;
it blocks fallback before terminating.

### Persistent senior

- One task at a time; a send while busy is rejected, not queued.
- It cannot be resumed after a crash. The worktree survives; relaunch a senior
  with `cwd` set to the retained worktree and re-brief it.
- It holds its worktree lease for life. Stopping it releases the name; the
  worktree remains for review.

### Worktrees and cleanup

- One worktree per team; `cwd` selects the source repository.
- `base` resolves to an exact commit and defaults to committed `HEAD`.
- Parent uncommitted and untracked files are not copied.
- The extension never pushes, merges, creates a PR, switches the parent
  checkout, deletes a branch, or removes a worktree automatically.
- Review with a plain child using `cwd` set to the worktree path, or directly in
  the retained workspace.
- Cleanup is explicit:

  ```text
  /worktree list
  /worktree remove <target>
  /worktree remove <target> --preserve
  ```

  Removal checks cwd containment, a registered checkout, no process holder or
  live child, and clean Git state. Dirty work is blocked unless committed first
  or `--preserve` makes a WIP commit. Branches are never deleted.

## Configuration

Durable configuration is `$PI_CODING_AGENT_DIR/herdr-agents/config.json`,
default `~/.pi/agent/herdr-agents/config.json`. It is read at startup; run
`/reload` after changes.

Keys that matter for a team:

| Key | Default | Effect |
| --- | --- | --- |
| `models.default` | none | Fallback model for children that specify none. |
| `models.agents` | none | Per-role model. Note: role frontmatter wins over this. |
| `persistent.maxAgents` | `3` | Retained persistent seniors and pending acquisitions. |
| `spawning.maxDepth` | `3` | Parent 0, senior 1, workers 2; deeper launches are refused. |
| `panes.mode`, `panes.direction`, `panes.maxPerTab` | `"grouped"`, `"right"`, `4` | Where child panes open. |
| `guidelines.launchRoster` | `true` | Ask the parent to print a roster after a group launch. |
| `outcomeLedger` | `true` | One line per model attempt in `outcomes.jsonl`. |

Because the bundled roles pin their model in frontmatter, `models.agents` does
not override them. Edit the role file, use an override, or pass `model`.

## Cheat sheet

```text
/team <slug> <task> [flags]       Start a team in team/<slug>.
/subagent <agent> <task>          Launch one named child.
/subagent list                    List visible roles and their source.
/subagents-init [preferences]     Draft task-category model preferences.
/worktree <name> [task]           Continue this conversation in a worktree.
/worktree list                    List managed worktrees and cleanup blockers.
/worktree remove <target>         Remove one managed worktree explicitly.
/skill:pi-herdr-agents            Load the host operating guide.
```

`/team` flags:

```text
--model --thinking
--worker-model --worker-thinking
--tester-model --tester-thinking
--research-model --research-thinking
--skills
```

## Troubleshooting

- **`/team` says the slug is invalid.** Start with a letter or digit; use only
  letters, digits, `.`, `_`, or `-`.
- **`/team` rejects a flag.** Thinking must be `off`, `minimal`, `low`,
  `medium`, `high`, `xhigh`, or `max`. Skill names are lowercase letters,
  digits, and single hyphens, 1-64 characters.
- **A launch fails with a model error.** The exact `provider/model-id` must be
  authenticated. If the orchestrator runs with `--models` or `enabledModels`,
  the child model must be in that scope.
- **A declared skill was not loaded.** The child's Pi could not find it. Install
  it globally, commit it to the base branch, or check the skill name.
- **A child is slow or stalled.** `stalled` is an unhealthy pane inspection, not
  a verdict. Interrupt, cancel, or stop it. Advisories never stop a child.
- **The senior is idle between tasks.** That is normal for a persistent
  specialist. Send the next task with `subagent_send`.
- **A worker pinged and exited.** That is normal. The senior should
  `subagent_resume` it or assign a fresh worker.
- **Worktree removal is refused.** Read the report; it names each blocker.
  Commit or `--preserve` dirty work, stop the child, or run the cleanup from a
  session rooted at the principal checkout.
- **A push fails with invalid credentials.** Re-authenticate (`gh auth login` or
  update your credential helper), then `git push`.

## Limits and safety

- Children are real Pi processes with your user permissions. Worktrees isolate
  Git checkouts, not processes or permissions.
- The hierarchy is enforced where the host can enforce it: `spawn-agents`, tool
  allowlists, depth, and accept checks. Judgment is a prompt contract.
- One worktree per team; parallel writers in one checkout conflict.
- The senior is one task at a time and cannot be resumed after a crash.
- The extension never publishes or cleans up on its own.
- The team is opt-in. Roles are listed, but nothing starts until `/team` or a
  `subagent` call with `agent: "team-senior"`.

## Where to read more

- [`README.md`](README.md) — installation and everyday use.
- [`docs/tools.md`](docs/tools.md) — every tool, command, and status label.
- [`docs/orchestrator-team.md`](docs/orchestrator-team.md) — the team contract.
- [`docs/configuration.md`](docs/configuration.md) — every config key.
- [`docs/roles.md`](docs/roles.md) — role frontmatter, tool access, and packs.
- [`docs/worktree-subagents.md`](docs/worktree-subagents.md) — worktree review,
  recovery, and cleanup.
- [`docs/troubleshooting.md`](docs/troubleshooting.md) — delivery and other
  common problems.
- [`CONTEXT.md`](CONTEXT.md) — domain glossary.
- [`docs/adr/0018-bundle-orchestrator-team.md`](docs/adr/0018-bundle-orchestrator-team.md)
  — why this fork bundles the team.
