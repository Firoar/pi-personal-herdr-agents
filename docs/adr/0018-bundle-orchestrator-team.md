# ADR-0018: Bundle the orchestrator team in this fork

- **Status:** Accepted (fork)
- **Supersedes:** [ADR-0013](0013-pack-neutral-execution-host.md) for this fork
- **Constrained by:** [ADR-0012](0012-adopt-maestro-seams-in-repo.md) (one
  package, Pi-only execution, Herdr-only surfaces)

## Context

This repository is a personal fork of `pi-herdr-agents`. Upstream ships a
pack-neutral execution host: no agent roles, no planning or review workflows,
and project, global, or installable role packs supply every named role
(ADR-0013).

The fork owner wants a ready-made hierarchy — an orchestrator, a persistent
senior per worktree, workers, a strict tester, and a researcher — available in
the same install, with the team versioned and tested beside the host.

## Decision

Ship the orchestrator team as a second Pi extension in this package:

- `pi-extension/team/index.ts` registers `pi-extension/team/roles/` through the
  public `pi-herdr-subagents:roles:discover:v1` event and adds a parent-only
  `/team` command.
- The four roles and four skills (team protocol, strict tests, team research,
  and the vendored Ponytail skill) ship in the package.
- The `spawn-agents` role field enforces the hierarchy: the senior may launch
  workers, testers, and the researcher; leaves may launch only the researcher.
- The host's execution architecture is unchanged. The team extension imports
  nothing from the host, so it remains removable and a future separately
  published pack can reuse the same roles.

The upstream pack-neutral rule no longer governs this fork. Project and global
definitions and separately installed role packs still work and still take
precedence.

## Consequences

- One install, one version, and one test suite cover the host and the team.
- The package is opinionated and larger: every install carries four roles and
  four skills.
- Upstream merges will conflict in `AGENTS.md`, `package.json`, `README.md`,
  and `test/package-manifest.test.js`; this ADR records why the fork diverges.
- Team skills are package-level and therefore discoverable by every session.
  Only the roles' `skills:` declarations inject them.
- The team remains opt-in: roles are listed, but a team starts only when
  `/team` or `subagent({ agent: "team-senior" })` is used.
- The sibling `pi-orchestrator-team` package is removed; this repository is the
  single source of truth.

## Alternatives considered

- **Keep the host pack-neutral and ship the team as a separate package.** Better
  for independent publication, but it adds a second install and release path
  for a personal fork. Revisit if the team needs its own release cadence.
- **Merge the team into the existing subagents extension.** Tighter coupling,
  no removable boundary, and a larger composition root. Rejected.
