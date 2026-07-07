import { describeUnsafeCommitFileReason } from "../git/commit.ts";
import type { ChangedFile, UnsafeCommitFileApproval } from "../types.ts";
import { formatDisplayPath } from "../utils/display-path.ts";

const UNSAFE_COMMIT_FILE_DISPLAY_LIMIT = 10;
const UNSAFE_COMMIT_PROMPT_TITLE = "CommitMe: commit potentially unsafe files?";

interface CommitMeConfirmationContext {
  hasUI?: boolean;
  ui?: {
    confirm(title: string, message: string): boolean | Promise<boolean>;
  };
}

function formatUnsafeCommitFilePromptLine(file: ChangedFile): string {
  return `- ${formatDisplayPath(file.path)} (${describeUnsafeCommitFileReason(file)})`;
}

export function buildUnsafeCommitFileApprovalMessage(files: ChangedFile[]): string {
  const displayedFiles = files.slice(0, UNSAFE_COMMIT_FILE_DISPLAY_LIMIT).map(formatUnsafeCommitFilePromptLine);
  const omittedCount = files.length - UNSAFE_COMMIT_FILE_DISPLAY_LIMIT;
  const omittedLine = omittedCount > 0 ? [`- ...and ${omittedCount} more`] : [];
  return [
    "CommitMe found changed files that look unsafe to stage:",
    "",
    ...displayedFiles,
    ...omittedLine,
    "",
    "Only continue if you reviewed these files and they contain safe fixtures/placeholders, not real secrets.",
    "Block the commit if you are unsure.",
    "",
    "Commit these flagged files?",
  ].join("\n");
}

export function createUnsafeCommitFileApproval(ctx: CommitMeConfirmationContext): UnsafeCommitFileApproval | undefined {
  if (!ctx.hasUI || !ctx.ui?.confirm) return undefined;
  return async ({ files }) => ctx.ui?.confirm(UNSAFE_COMMIT_PROMPT_TITLE, buildUnsafeCommitFileApprovalMessage(files)) ?? false;
}
