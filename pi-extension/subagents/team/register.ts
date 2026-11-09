import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { fileURLToPath } from "node:url";

const roles = fileURLToPath(new URL("./roles", import.meta.url));

/**
 * Register the bundled team's roles with the host, and expose a parent-only
 * `/team` launcher. The host entry calls this in every session, so the command
 * is registered only in a top-level session.
 */
export function registerTeam(pi: ExtensionAPI) {
	const unsubscribe = pi.events.on(
		"pi-herdr-subagents:roles:discover:v1",
		(request) => {
			// SAFETY: the host emits this documented v1 discovery shape; the
			// apiVersion check below rejects anything else before it is used.
			const discovery = request as {
				apiVersion: number;
				register(path: string): void;
			};
			if (discovery.apiVersion === 1) discovery.register(roles);
		},
	);
	pi.on("session_shutdown", unsubscribe);

	// A delegated child must not expose the parent's launcher.
	if (process.env.PI_SUBAGENT_ID) return;

	pi.registerCommand("team", {
		description:
			"Launch a team: /team <slug> <task> [--model=...] [--thinking=...] [per-child flags]",
		handler: async (args, ctx) => {
			const parsed = parseTeamArgs(args);
			if ("error" in parsed) {
				ctx.ui.notify(parsed.error, "warning");
				return;
			}
			pi.sendUserMessage(parsed.toolCall);
		},
	});
}

export interface TeamLaunch {
	toolCall: string;
}

const THINKING_LEVELS = [
	"off",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
	"max",
] as const;
const thinkingLevels = new Set<string>(THINKING_LEVELS);

const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Skills the bundled roles declare by default. */
const SENIOR_SKILLS = ["ponytail", "team-protocol"] as const;
const CHILD_BASELINES = {
	worker: ["team-protocol"],
	tester: ["team-protocol", "strict-tests"],
	researcher: ["team-research"],
} as const;

interface TeamFlags {
	model?: string;
	thinking?: string;
	workerModel?: string;
	workerThinking?: string;
	testerModel?: string;
	testerThinking?: string;
	researchModel?: string;
	researchThinking?: string;
	skills?: string[];
}

interface FlagResult {
	handled: boolean;
	error?: string;
}

const USAGE =
	"Usage: /team <slug> <task> [--model=<senior-model>] [--thinking=<level>] " +
	"[--worker-model=<model>] [--worker-thinking=<level>] " +
	"[--tester-model=<model>] [--tester-thinking=<level>] " +
	"[--research-model=<model>] [--research-thinking=<level>] [--skills=<names>]";

function thinkingRefusal(flag: string, value: string): string | undefined {
	if (thinkingLevels.has(value)) return undefined;
	return `Invalid --${flag} value "${value}". Use one of: ${THINKING_LEVELS.join(", ")}.`;
}

type SkillNamesResult =
	| { ok: true; names: string[] }
	| { ok: false; error: string };

function parseSkillNames(value: string): SkillNamesResult {
	const names = [
		...new Set(
			value
				.split(",")
				.map((name) => name.trim())
				.filter(Boolean),
		),
	];
	if (names.length === 0)
		return {
			ok: false,
			error: "Invalid --skills value: name at least one skill.",
		};
	for (const name of names)
		if (name.length > 64 || !SKILL_NAME.test(name))
			return {
				ok: false,
				error: `Invalid skill name "${name}". Use lowercase letters, digits and single hyphens (1-64 characters).`,
			};
	return { ok: true, names };
}

function applyTeamFlag(flags: TeamFlags, part: string): FlagResult {
	const match = /^--([a-z-]+)=(.*)$/.exec(part);
	if (!match) return { handled: false };
	const key = match[1];
	const value = match[2];
	if (!value) return { handled: true, error: `--${key} needs a value.` };

	switch (key) {
		case "model":
			flags.model = value;
			return { handled: true };
		case "thinking": {
			const error = thinkingRefusal(key, value);
			if (error) return { handled: true, error };
			flags.thinking = value;
			return { handled: true };
		}
		case "worker-model":
			flags.workerModel = value;
			return { handled: true };
		case "worker-thinking": {
			const error = thinkingRefusal(key, value);
			if (error) return { handled: true, error };
			flags.workerThinking = value;
			return { handled: true };
		}
		case "tester-model":
			flags.testerModel = value;
			return { handled: true };
		case "tester-thinking": {
			const error = thinkingRefusal(key, value);
			if (error) return { handled: true, error };
			flags.testerThinking = value;
			return { handled: true };
		}
		case "research-model":
			flags.researchModel = value;
			return { handled: true };
		case "research-thinking": {
			const error = thinkingRefusal(key, value);
			if (error) return { handled: true, error };
			flags.researchThinking = value;
			return { handled: true };
		}
		case "skills": {
			const skills = parseSkillNames(value);
			if (!skills.ok) return { handled: true, error: skills.error };
			flags.skills = skills.names;
			return { handled: true };
		}
		default:
			// Unknown flags stay in the task; the task may legitimately contain
			// a `--` token.
			return { handled: false };
	}
}

interface ChildPolicyRow {
	label: string;
	role: string;
	model?: string;
	thinking?: string;
	baseline: readonly string[];
}

function childPolicy(flags: TeamFlags): string {
	const rows: ChildPolicyRow[] = [
		{
			label: "worker",
			role: "team-worker",
			model: flags.workerModel,
			thinking: flags.workerThinking,
			baseline: CHILD_BASELINES.worker,
		},
		{
			label: "tester",
			role: "team-tester",
			model: flags.testerModel,
			thinking: flags.testerThinking,
			baseline: CHILD_BASELINES.tester,
		},
		{
			label: "researcher",
			role: "team-researcher",
			model: flags.researchModel,
			thinking: flags.researchThinking,
			baseline: CHILD_BASELINES.researcher,
		},
	];
	const hasOverride =
		rows.some((row) => row.model !== undefined || row.thinking !== undefined) ||
		flags.skills !== undefined;
	if (!hasOverride) return "";

	const lines = ["Team launch policy for children:"];
	for (const row of rows) {
		const model = row.model
			? `model ${JSON.stringify(row.model)}`
			: "role default model";
		const thinking = row.thinking
			? `thinking ${JSON.stringify(row.thinking)}`
			: "role default thinking";
		const skills = flags.skills
			? `, skills ${JSON.stringify(
					[...new Set([...row.baseline, ...flags.skills])].join(","),
				)}`
			: "";
		lines.push(`- ${row.label} (${row.role}): ${model}, ${thinking}${skills}.`);
	}
	lines.push(
		'Pass these exact model, thinking, and skills values on every subagent call. When a value says "role default", omit that argument.',
	);
	return lines.join("\n");
}

/**
 * Turn `/team auth Add login` into the `subagent` call the parent model should
 * make. Kept pure so the argument rules are testable without Pi.
 */
export function parseTeamArgs(args: string): TeamLaunch | { error: string } {
	const trimmed = args.trim();
	if (!trimmed) return { error: USAGE };

	const parts = trimmed.split(/\s+/);
	const slug = parts.shift() ?? "";
	if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(slug)) {
		return {
			error:
				"Team slug must start with a letter or digit and contain only letters, digits, '.', '_' or '-'.",
		};
	}

	const flags: TeamFlags = {};
	const taskParts: string[] = [];
	for (const part of parts) {
		const result = applyTeamFlag(flags, part);
		if (result.error) return { error: result.error };
		if (!result.handled) taskParts.push(part);
	}

	const task = taskParts.join(" ").trim();
	if (!task) return { error: USAGE };

	const seniorSkills = flags.skills
		? [...new Set([...SENIOR_SKILLS, ...flags.skills])]
		: undefined;
	const overrides = [
		flags.model ? `model: ${JSON.stringify(flags.model)}` : "",
		flags.thinking ? `thinking: ${JSON.stringify(flags.thinking)}` : "",
		seniorSkills ? `skills: ${JSON.stringify(seniorSkills.join(","))}` : "",
	]
		.filter(Boolean)
		.join(", ");
	const policy = childPolicy(flags);
	const brief =
		`You lead team ${slug}. ${task} ` +
		"Plan first, assign bounded work, keep writers serial, review the diff, run the tests, and commit when told. " +
		"Escalate scope, architecture, dependency, and public-API decisions to the orchestrator." +
		(policy ? `\n\n${policy}` : "");
	const toolCall =
		`Use subagent with agent: "team-senior", name: ${JSON.stringify(`team-${slug}`)}, ` +
		"persistent: true, " +
		`worktree: { branch: ${JSON.stringify(`team/${slug}`)} }` +
		(overrides ? `, ${overrides}` : "") +
		`, task: ${JSON.stringify(brief)}`;

	return { toolCall };
}
