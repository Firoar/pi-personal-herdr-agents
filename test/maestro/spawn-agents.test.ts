import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
	formatSpawnAgents,
	parseSpawnAgents,
	SPAWN_AGENTS_ENV,
	spawnAgentRefusal,
} from "../../maestro/core/spawn-agents.ts";
import { discoverAgentCatalog } from "../../maestro/core/roles/discovery.ts";
import {
	getSubagentSessionPolicyFile,
	readSubagentSessionPolicy,
	writeSubagentSessionPolicy,
} from "../../maestro/adapters/pi/session.ts";
import { resolveSpawnAgents } from "../../pi-extension/subagents/catalog.ts";
import {
	launchSpawnAgentsRefusal,
	resumeSpawnAgentsRefusal,
} from "../../pi-extension/subagents/launch-tools.ts";

describe("spawn-agent allowlist", () => {
	it("parses and formats a deduplicated comma-separated list", () => {
		assert.equal(SPAWN_AGENTS_ENV, "PI_SUBAGENT_SPAWN_AGENTS");
		assert.deepEqual(parseSpawnAgents(undefined), []);
		assert.deepEqual(parseSpawnAgents(""), []);
		assert.deepEqual(parseSpawnAgents(" team-worker, team-tester ,, "), [
			"team-worker",
			"team-tester",
		]);
		assert.deepEqual(parseSpawnAgents("a,a,b"), ["a", "b"]);
		assert.equal(formatSpawnAgents([" a ", "a", "b"]), "a,b");
		assert.equal(formatSpawnAgents([]), "");
	});

	it("does not restrict an empty allowlist", () => {
		assert.equal(spawnAgentRefusal(undefined, [], "subagent"), undefined);
		assert.equal(spawnAgentRefusal("worker", [], "subagent"), undefined);
		assert.equal(
			spawnAgentRefusal(undefined, [], "subagent_resume"),
			undefined,
		);
	});

	it("allows a named role and refuses bare, unlisted and resumed launches", () => {
		const allowed = ["team-researcher"];
		assert.equal(
			spawnAgentRefusal("team-researcher", allowed, "subagent"),
			undefined,
		);

		const bare = spawnAgentRefusal(undefined, allowed, "subagent");
		assert.equal(bare?.reason, "bare");
		assert.match(bare!.message, /name one of those roles/);

		const unlisted = spawnAgentRefusal("team-worker", allowed, "subagent");
		assert.equal(unlisted?.reason, "not-allowed");
		assert.match(unlisted!.message, /team-worker/);
		assert.match(unlisted!.message, /team-researcher/);

		const resumeAllowed = spawnAgentRefusal(
			"team-researcher",
			allowed,
			"subagent_resume",
		);
		assert.equal(resumeAllowed, undefined);

		const resumeWrongRole = spawnAgentRefusal(
			"team-worker",
			allowed,
			"subagent_resume",
		);
		assert.equal(resumeWrongRole?.reason, "not-allowed");
		assert.match(resumeWrongRole!.message, /belongs to team-worker/);

		const resumeUnverified = spawnAgentRefusal(
			undefined,
			allowed,
			"subagent_resume",
		);
		assert.equal(resumeUnverified?.reason, "resume-unverified");
		assert.match(resumeUnverified!.message, /records no role/);
	});

	it("resolves role defaults into a stable list", () => {
		assert.deepEqual(resolveSpawnAgents(null), []);
		assert.deepEqual(
			resolveSpawnAgents({ spawnAgents: "team-researcher, team-tester" }),
			["team-researcher", "team-tester"],
		);
		assert.deepEqual(resolveSpawnAgents({ spawnAgents: "a, a, b" }), [
			"a",
			"b",
		]);
	});

	it("refuses in the host launch path using the caller's environment", () => {
		const env = { PI_SUBAGENT_SPAWN_AGENTS: "team-researcher" };
		assert.equal(launchSpawnAgentsRefusal("team-researcher", env), undefined);
		assert.equal(
			launchSpawnAgentsRefusal("team-worker", env)?.code,
			"spawn-agent-not-allowed",
		);
		assert.equal(launchSpawnAgentsRefusal(undefined, env)?.reason, "bare");
		assert.equal(launchSpawnAgentsRefusal(undefined, {}), undefined);
	});

	it("authorizes a resume only for a recorded allowed role", () => {
		const root = mkdtempSync(join(tmpdir(), "spawn-resume-"));
		try {
			const env = { PI_SUBAGENT_SPAWN_AGENTS: "team-researcher" };
			const researcher = join(root, "researcher.jsonl");
			writeSubagentSessionPolicy(researcher, {
				owner: "public",
				deniedTools: [],
				agent: "team-researcher",
			});
			assert.equal(resumeSpawnAgentsRefusal(researcher, env), undefined);

			const worker = join(root, "worker.jsonl");
			writeSubagentSessionPolicy(worker, {
				owner: "public",
				deniedTools: [],
				agent: "team-worker",
			});
			assert.equal(
				resumeSpawnAgentsRefusal(worker, env)?.code,
				"spawn-agent-not-allowed",
			);
			assert.equal(
				resumeSpawnAgentsRefusal(join(root, "missing.jsonl"), env)?.code,
				"spawn-agent-not-allowed",
			);
			assert.equal(resumeSpawnAgentsRefusal(worker, {}), undefined);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});

describe("spawn-agents role frontmatter", () => {
	function withProject(run: (cwd: string, agentDir: string) => void) {
		const root = mkdtempSync(join(tmpdir(), "spawn-agents-"));
		try {
			const cwd = join(root, "project");
			const agentDir = join(root, "agent");
			mkdirSync(join(cwd, ".pi", "agents"), { recursive: true });
			mkdirSync(join(agentDir, "agents"), { recursive: true });
			run(cwd, agentDir);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	}

	function role(cwd: string, name: string, fields: string) {
		writeFileSync(
			join(cwd, ".pi", "agents", `${name}.md`),
			`---\nname: ${name}\ndescription: ${name}\n${fields}\n---\n${name} body`,
		);
	}

	it("parses the allowlist into raw and runtime defaults", () => {
		withProject((cwd, agentDir) => {
			role(cwd, "team-worker", "spawn-agents: team-researcher, team-tester");
			const catalog = discoverAgentCatalog({ agentConfigDir: agentDir, cwd });
			assert.deepEqual(
				catalog.diagnostics.map((diagnostic) => diagnostic.code),
				[],
			);
			const worker = catalog.agents.find(
				(agent) => agent.name === "team-worker",
			);
			assert.equal(worker?.spawnAgents, "team-researcher, team-tester");
			assert.deepEqual(worker?.role.defaults?.spawnAgents, [
				"team-researcher",
				"team-tester",
			]);
		});
	});

	it("rejects YAML lists, quoted keys and duplicate declarations", () => {
		withProject((cwd, agentDir) => {
			role(cwd, "list", "spawn-agents: [team-researcher]");
			role(cwd, "quoted", '"spawn-agents": team-researcher');
			role(
				cwd,
				"duplicate",
				"spawn-agents: team-researcher\nspawn-agents: team-tester",
			);
			const catalog = discoverAgentCatalog({ agentConfigDir: agentDir, cwd });
			assert.deepEqual(catalog.agents, []);
			assert.deepEqual(
				catalog.diagnostics
					.map((diagnostic) => diagnostic.agentName)
					.sort((left, right) => left!.localeCompare(right!)),
				["duplicate", "list", "quoted"],
			);
			for (const diagnostic of catalog.diagnostics)
				assert.equal(diagnostic.code, "invalid-capability-declaration");
		});
	});
});

describe("spawn-agents session policy", () => {
	it("round-trips the allowlist in a v3 policy", () => {
		const root = mkdtempSync(join(tmpdir(), "spawn-policy-"));
		try {
			const sessionFile = join(root, "child.jsonl");
			writeSubagentSessionPolicy(sessionFile, {
				owner: "public",
				deniedTools: [],
				spawnAgents: ["team-researcher"],
				agent: "team-worker",
			});
			const policy = readSubagentSessionPolicy(sessionFile);
			assert.equal(policy.version, 3);
			if (policy.version !== 3) return;
			assert.deepEqual(policy.spawnAgents, ["team-researcher"]);
			assert.equal(policy.agent, "team-worker");

			const unrestricted = join(root, "unrestricted.jsonl");
			writeSubagentSessionPolicy(unrestricted, {
				owner: "public",
				deniedTools: [],
			});
			const open = readSubagentSessionPolicy(unrestricted);
			assert.equal(open.version, 3);
			if (open.version !== 3) return;
			assert.deepEqual(open.spawnAgents, []);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it("still reads a v2 policy without a spawn allowlist", () => {
		const root = mkdtempSync(join(tmpdir(), "spawn-policy-v2-"));
		try {
			const sessionFile = join(root, "child.jsonl");
			const unsigned = {
				version: 2,
				owner: "public",
				tools: null,
				deniedTools: [],
				persistent: false,
				logicalId: "logical",
				generationId: "generation",
			};
			const policyHash = createHash("sha256")
				.update(JSON.stringify(unsigned))
				.digest("hex");
			writeFileSync(
				getSubagentSessionPolicyFile(sessionFile),
				JSON.stringify({ ...unsigned, policyHash }),
			);
			const policy = readSubagentSessionPolicy(sessionFile);
			assert.equal(policy.version, 2);
			assert.equal("spawnAgents" in policy, false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
