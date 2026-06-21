import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { registerCommitMeCommand } from "./commands/commitme-command.ts";
import { registerCommitMeTool } from "./tools/commitme-tool.ts";

/** CommitMe extension entry point. Keep this factory intentionally small. */
export default function commitMeExtension(pi: ExtensionAPI) {
  registerCommitMeCommand(pi);
  registerCommitMeTool(pi);
}
