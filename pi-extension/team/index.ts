import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { fileURLToPath } from "node:url";

const roles = fileURLToPath(new URL("./roles", import.meta.url));

/**
 * Register this pack's roles with pi-herdr-agents, and expose a parent-only
 * `/team` launcher. Children load installed packages too, so the command is
 * registered only in a top-level session.
 */
export default function orchestratorTeam(pi: ExtensionAPI) {
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
			"Launch a team: /team <slug> <task> [--model=<provider/model>] [--thinking=<level>]",
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

/**
 * Turn `/team auth Add login` into the `subagent` call the parent model should
 * make. Kept pure so the argument rules are testable without Pi.
 */
export function parseTeamArgs(args: string): TeamLaunch | { error: string } {
	const usage =
		"Usage: /team <slug> <task> [--model=<provider/model>] [--thinking=<level>]";
	const trimmed = args.trim();
	if (!trimmed) return { error: usage };

	const parts = trimmed.split(/\s+/);
	const slug = parts.shift() ?? "";
	if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(slug)) {
		return {
			error:
				"Team slug must start with a letter or digit and contain only letters, digits, '.', '_' or '-'.",
		};
	}

	let model: string | undefined;
	let thinking: string | undefined;
	const taskParts: string[] = [];
	for (const part of parts) {
		const modelMatch = /^--model=(.+)$/.exec(part);
		if (modelMatch) {
			model = modelMatch[1];
			continue;
		}
		const thinkingMatch = /^--thinking=(.+)$/.exec(part);
		if (thinkingMatch) {
			thinking = thinkingMatch[1];
			continue;
		}
		taskParts.push(part);
	}

	const task = taskParts.join(" ").trim();
	if (!task) return { error: usage };

	const overrides = [
		model ? `model: ${JSON.stringify(model)}` : "",
		thinking ? `thinking: ${JSON.stringify(thinking)}` : "",
	]
		.filter(Boolean)
		.join(", ");
	const brief =
		`You lead team ${slug}. ${task} ` +
		"Plan first, assign bounded work, keep writers serial, review the diff, run the tests, and commit when told. " +
		"Escalate scope, architecture, dependency, and public-API decisions to the orchestrator.";
	const toolCall =
		`Use subagent with agent: "team-senior", name: ${JSON.stringify(`team-${slug}`)}, ` +
		"persistent: true, " +
		`worktree: { branch: ${JSON.stringify(`team/${slug}`)} }` +
		(overrides ? `, ${overrides}` : "") +
		`, task: ${JSON.stringify(brief)}`;

	return { toolCall };
}
