# Orchestrator team

This fork ships an optional hierarchy on top of the host: one persistent
**senior** leads a worktree, **workers** implement, **testers** write strict
tests, and a **researcher** answers bounded questions. Your parent Pi session is
the **orchestrator**.

The team is a module of this package's single extension
([`pi-extension/subagents/team/register.ts`](../pi-extension/subagents/team/register.ts)).
The host entry calls `registerTeam(pi)`; it registers its roles through the
public role-pack event and adds a parent-only `/team` command. It imports
nothing from the host runtime, so it stays removable.

Pi + Herdr only.

## Use

```text
/team auth Add rate limiting to the login endpoint and test it.
```

That asks the orchestrator to launch:

```typescript
subagent({
  name: "team-auth",
  agent: "team-senior",
  persistent: true,
  worktree: { branch: "team/auth" },
  task: "You lead team auth. ...",
})
```

Or call `subagent` directly with the same fields. The senior starts in the
worktree root; its workers and testers open in the `Agents` tab of the same
Herdr workspace.

Options:

```text
/team auth Add rate limiting --model=provider/model-id --thinking=high
```

## Roles

| Role | Shape | Responsibility |
| --- | --- | --- |
| `team-senior` | persistent, worktree | plan, assign, review, commit, escalate |
| `team-worker` | ordinary, auto-exit | one bounded implementation |
| `team-tester` | ordinary, auto-exit | strict tests for the assigned behavior |
| `team-researcher` | ordinary, auto-exit, read-only | one cited research question |

The senior may launch workers, testers, and the researcher. Workers and testers
may launch only the researcher. The researcher cannot launch anyone. The
`spawn-agents` role field enforces this before any pane or worktree exists.

## Models

All four roles default to:

```yaml
model: opencode-go/deepseek-v4.1-flash
thinking: max
```

The orchestrator can be any model. Overrides, highest precedence first:

1. the launch call's `model` / `thinking` (and the `/team` flags, which put them
   in the senior's brief);
2. the role frontmatter;
3. `models.agents` in `config.json`;
4. `models.default`;
5. the parent model.

Because frontmatter wins over `models.agents`, change the default in the role
files, or override the role with a same-name file in `.pi/agents/` or
`$PI_CODING_AGENT_DIR/agents/`. If the orchestrator runs with `--models` or
`enabledModels`, include the DeepSeek ID in that scope.

## Hierarchy and escalation

```
you
 └─ orchestrator (parent Pi)
     └─ team-senior (persistent, worktree lease)
         ├─ team-worker
         ├─ team-tester
         └─ team-researcher
```

Nobody asks the human directly. Workers and testers ping the senior; the senior
pings the orchestrator; the orchestrator asks you. The team protocol skill
defines the `ESCALATE` and `DONE` envelopes.

A restricted role may `subagent_resume` only a session whose recorded role is on
its allowlist. The senior can resume its workers, testers, and researcher; a
worker can resume a researcher; an unrecorded role is refused.

## Worktree discipline

One worktree per team. Workers share it, so the senior keeps writers serial or
assigns disjoint file sets. The senior reviews the diff, runs the tests, and
commits. The worktree is retained after success, failure, and help requests;
cleanup is an explicit orchestrator action (`worktree_list`, then
`worktree_remove`). Nobody pushes, merges, opens a pull request, or removes the
worktree.

## Research

Workers, testers, and the senior can ask `team-researcher` one bounded question.
The researcher reads the repository first, then primary external sources, and
returns an `ANSWER` envelope with citations. It never changes code.

## Ponytail

The senior declares the vendored `ponytail` skill, so it makes the smallest
complete change. Workers and testers do not get it. Do not also install the
Ponytail Pi package globally: its always-on extension would apply to every child.

## Limits

- The senior is persistent, so it accepts one task at a time and cannot be
  resumed after a crash. Relaunch a senior with `cwd` set to the retained
  worktree to continue.
- Parallel writers in one checkout conflict. Serialize them.
- Each research question is a full Pi launch. Batch questions.
- `spawn-agents` bounds the host's `subagent` tool, not arbitrary shell
  processes. The delegation-depth limit still applies.
- Cleanup requires the orchestrator's cwd to contain the principal repository.
- The team skills are package-level, so every session can discover them; only
  the roles' `skills:` declarations inject them.

## Attribution

Ponytail and the research method are adapted under MIT. See
[`../ATTRIBUTION.md`](../ATTRIBUTION.md).
