/**
 * Role-scoped spawn allowlist.
 *
 * A role may declare `spawn-agents:` with a comma-separated list of role
 * names. The Pi host passes that list to the child as
 * {@link SPAWN_AGENTS_ENV} and refuses any `subagent` launch whose target
 * role is not on it. An absent or empty list leaves the session unrestricted.
 *
 * This is a capability boundary for the host's `subagent` tool, not an OS
 * sandbox: a child with shell access can still start a raw process. The
 * delegation-depth limit still applies to every real host launch.
 */
import { encodeHostValue } from "./host-text.ts";

export const SPAWN_AGENTS_ENV = "PI_SUBAGENT_SPAWN_AGENTS";

/** One refusal code shared by the tool and resume paths. */
export const SPAWN_AGENT_REFUSAL_CODE = "spawn-agent-not-allowed";

export type SpawnRefusalReason = "resume-unverified" | "bare" | "not-allowed";

export interface SpawnAgentRefusal {
	code: typeof SPAWN_AGENT_REFUSAL_CODE;
	reason: SpawnRefusalReason;
	allowed: string[];
	agent?: string;
	message: string;
}

/** Parse the injected allowlist. Duplicates and blank entries are dropped. */
export function parseSpawnAgents(raw: string | undefined): string[] {
	if (!raw) return [];
	return [
		...new Set(
			raw
				.split(",")
				.map((name) => name.trim())
				.filter(Boolean),
		),
	];
}

/** Serialize an allowlist for the launch environment; empty means unrestricted. */
export function formatSpawnAgents(allowed: readonly string[]): string {
	return [...new Set(allowed.map((name) => name.trim()).filter(Boolean))].join(
		",",
	);
}

/**
 * Refuse a launch the caller's role did not allow. The caller's allowlist is
 * its own injected environment, never the parent's.
 */
export function spawnAgentRefusal(
	agent: string | undefined,
	allowed: readonly string[],
	tool: "subagent" | "subagent_resume",
): SpawnAgentRefusal | undefined {
	if (allowed.length === 0) return undefined;
	const names = [...new Set(allowed)];
	const list = names.map((name) => encodeHostValue(name)).join(", ");
	if (tool === "subagent_resume") {
		if (!agent) {
			return {
				code: SPAWN_AGENT_REFUSAL_CODE,
				reason: "resume-unverified",
				allowed: names,
				message:
					`This role may launch only: ${list}. The saved session records no ` +
					"role, so the resume cannot be authorized. Start a new session with " +
					"one of those roles instead.",
			};
		}
		if (!names.includes(agent)) {
			return {
				code: SPAWN_AGENT_REFUSAL_CODE,
				reason: "not-allowed",
				allowed: names,
				agent,
				message:
					`This role may launch only: ${list}. The saved session belongs to ` +
					`${encodeHostValue(agent)}, so the resume is refused.`,
			};
		}
		return undefined;
	}
	if (!agent) {
		return {
			code: SPAWN_AGENT_REFUSAL_CODE,
			reason: "bare",
			allowed: names,
			message:
				`This role may launch only: ${list}. A bare launch is not allowed; ` +
				"name one of those roles with agent.",
		};
	}
	if (!names.includes(agent)) {
		return {
			code: SPAWN_AGENT_REFUSAL_CODE,
			reason: "not-allowed",
			allowed: names,
			agent,
			message:
				`This role may launch only: ${list}. Agent ${encodeHostValue(agent)} ` +
				"is not on its spawn allowlist.",
		};
	}
	return undefined;
}
