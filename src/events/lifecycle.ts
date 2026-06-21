import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * Lifecycle placeholder.
 *
 * CommitMe has no planned background lifecycle behavior in the first
 * implementation. If future lifecycle hooks are needed, keep resources
 * session-scoped and clean them up in `session_shutdown`.
 */
export function registerCommitMeLifecycle(_pi: ExtensionAPI) {
  // Preparation-only stub. No events are registered here.
}
