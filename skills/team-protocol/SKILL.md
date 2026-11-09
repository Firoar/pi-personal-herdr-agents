---
name: team-protocol
description: The authority, escalation, and reporting contract for a pi-herdr-agents team (senior, workers, testers, researcher).
---

# Team protocol

One orchestrator, one senior, and any number of workers, testers, and
researchers. The orchestrator owns the feature request and the human
conversation. The senior owns the worktree, the plan, the review, and the
commit. Workers and testers own one bounded assignment each. The researcher
answers one question.

## Authority

| Role | May decide | Must escalate |
| --- | --- | --- |
| Orchestrator | scope, priority, what ships | anything the human has not approved |
| Senior | plan, file assignment, ordering, review, commit | scope, architecture, dependencies, public API, destructive edits |
| Worker | how to implement the assigned change | anything outside the assignment, new dependency, schema change, repeated failure |
| Tester | how to test the assigned behavior | ambiguous expected behavior, a requirement that looks wrong |
| Researcher | which sources answer the question | a question that needs a product decision |

No team member asks the human directly. Workers, testers, and the researcher
escalate to the senior. The senior escalates to the orchestrator. The
orchestrator asks the human.

## Launch policy from the orchestrator

Your own launch sets your model, thinking, and skills. Before launching any
child, read the task for a `Team launch policy for children` block. When it is
present, pass the named `model`, `thinking`, and `skills` values on every
`subagent` call. When a value says "role default", omit that argument and let
the child role decide.

Baseline skills — keep them when you override `skills`:

| Role | Baseline skills |
| --- | --- |
| `team-senior` | `ponytail`, `team-protocol` |
| `team-worker` | `team-protocol` |
| `team-tester` | `team-protocol`, `strict-tests` |
| `team-researcher` | `team-research` |

`skills` replaces the child role's default list; it does not add to it. If the
brief names extra skills, pass the baseline list plus the extras, for example
`skills: "team-protocol,my-skill"` to a worker.

Model precedence for each child is: the `model` you pass, then the child role's
frontmatter, then `models.agents`, then `models.default`, then your own model.
Because the bundled roles pin their model, a `models.agents` entry does not
override them; pass `model` explicitly.

Your own launch is a managed-worktree child, so its model must be one exact
`provider/model-id`; a comma fallback list is rejected. Workers, testers, and
the researcher are ordinary children and may use a fallback list.

## Escalate

Use `caller_ping` with exactly this body:

```
ESCALATE
from: senior | worker | tester | researcher
question: <one sentence>
options: A) <option>  B) <option>
blocking: yes | no
default-if-silent: <the safe choice>
already-tried: <files, commands, sources>
```

Rules:

- One question per ping. If you have two, send the blocking one first.
- Name a safe default. Never leave the asker guessing.
- Do not ping for information you can obtain yourself.
- Stay stopped after a ping until the answer arrives. Do not start overlapping
  work in the same files.

## Report

Use this body for a finished assignment or feature:

```
DONE
files: <paths>
tests: <exact command> -> <result>
commits: <sha> (or none)
risks: <what could still be wrong>
not-done: <deliberately skipped, or none>
```

A report is evidence, not proof. The senior re-runs the check and reads the
diff. The orchestrator re-checks the worktree handoff before accepting.

## Commit policy

- Workers and testers do not commit unless the senior's assignment explicitly
  says to.
- The senior commits once per coherent change, with a message that says what
  changed and why.
- Nobody pushes, merges, opens a pull request, switches the parent checkout, or
  removes the worktree.

## Worktree discipline

- One worktree per team. Everyone works in it.
- Writers are serial or use disjoint file sets. Parallel writers in one
  checkout conflict.
- The senior reviews the diff against the reported base, runs the tests, and
  reports the branch, commits, and state to the orchestrator.
- Cleanup is the orchestrator's explicit action, never automatic.

## Research

Ask the researcher only when the answer is not in the repository. One bounded
question, with the version or source that matters. The researcher returns an
`ANSWER` envelope with citations; the asker decides what to do with it.
