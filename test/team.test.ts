import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { discoverAgentCatalog } from "../maestro/core/roles/discovery.ts";
import { parseTeamArgs } from "../pi-extension/subagents/team/register.ts";

const teamRoles = fileURLToPath(
	new URL("../pi-extension/subagents/team/roles", import.meta.url),
);
const absentAgentDir = join(tmpdir(), "pi-team-test-agent-dir");
const absentProjectDir = join(tmpdir(), "pi-team-test-project-dir");

test("discovers the four bundled team roles and their policy", () => {
	const catalog = discoverAgentCatalog({
		agentConfigDir: absentAgentDir,
		cwd: absentProjectDir,
		onRolePackDiscovered(event) {
			event.register(teamRoles);
		},
	});
	assert.deepEqual(catalog.diagnostics, []);
	assert.deepEqual(catalog.agents.map((agent) => agent.name).sort(), [
		"team-researcher",
		"team-senior",
		"team-tester",
		"team-worker",
	]);
	for (const agent of catalog.agents) {
		assert.equal(agent.source, "package");
		assert.equal(agent.provider, "pi-herdr-agents");
		assert.equal(agent.model, "opencode-go/deepseek-v4.1-flash");
		assert.equal(agent.thinking, "max");
	}
	const byName = new Map(catalog.agents.map((agent) => [agent.name, agent]));
	const senior = byName.get("team-senior");
	assert.equal(senior?.persistent, true);
	assert.equal(
		senior?.spawnAgents,
		"team-worker, team-tester, team-researcher",
	);
	assert.deepEqual(senior?.role.defaults?.spawnAgents, [
		"team-worker",
		"team-tester",
		"team-researcher",
	]);
	assert.deepEqual(senior?.role.defaults?.skills, [
		"ponytail",
		"team-protocol",
	]);

	for (const name of ["team-worker", "team-tester"]) {
		const leaf = byName.get(name);
		assert.equal(leaf?.autoExit, true);
		assert.equal(leaf?.spawnAgents, "team-researcher");
		assert.equal(leaf?.spawning, undefined);
	}
	assert.deepEqual(byName.get("team-tester")?.role.defaults?.skills, [
		"team-protocol",
		"strict-tests",
	]);

	const researcher = byName.get("team-researcher");
	assert.equal(researcher?.autoExit, true);
	assert.equal(researcher?.spawning, false);
	assert.equal(researcher?.spawnAgents, undefined);
	assert.deepEqual(researcher?.role.defaults?.skills, ["team-research"]);
});

test("builds a persistent worktree launch for a team", () => {
	const parsed = parseTeamArgs(
		"auth Add rate limiting --model=opencode-go/deepseek-v4.1-flash --thinking=high",
	);
	assert.ok("toolCall" in parsed);
	assert.match(parsed.toolCall, /agent: "team-senior"/);
	assert.match(parsed.toolCall, /name: "team-auth"/);
	assert.match(parsed.toolCall, /persistent: true/);
	assert.match(parsed.toolCall, /branch: "team\/auth"/);
	assert.match(parsed.toolCall, /model: "opencode-go\/deepseek-v4.1-flash"/);
	assert.match(parsed.toolCall, /thinking: "high"/);
	assert.match(parsed.toolCall, /Add rate limiting/);
});

test("uses the role defaults when no overrides are given", () => {
	const parsed = parseTeamArgs("auth Add login");
	assert.ok("toolCall" in parsed);
	assert.doesNotMatch(parsed.toolCall, /model:/);
	assert.doesNotMatch(parsed.toolCall, /thinking:/);
});

test("rejects a missing task and an unsafe slug", () => {
	assert.deepEqual(parseTeamArgs(""), {
		error:
			"Usage: /team <slug> <task> [--model=<provider/model>] [--thinking=<level>]",
	});
	assert.ok("error" in parseTeamArgs("auth"));
	assert.ok("error" in parseTeamArgs("../auth Add login"));
	assert.ok("error" in parseTeamArgs("team/auth Add login"));
});
