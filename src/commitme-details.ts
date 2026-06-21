import type { CommitMeToolDetails, GitContext, TruncationMetadata } from "./types.ts";
import { collectTruncationMetadata } from "./utils/truncation.ts";

export function collectGitContextTruncation(context: GitContext): TruncationMetadata[] {
  return collectTruncationMetadata([
    context.staged,
    context.unstaged,
    ...context.project.metadata,
    ...context.project.changedFileSnippets,
  ]);
}

type CommitMeDetailsExtra = Omit<Partial<CommitMeToolDetails>, "action">;

export function createCommitMeDetails(
  action: CommitMeToolDetails["action"],
  context: GitContext,
  extra: CommitMeDetailsExtra = {},
): CommitMeToolDetails {
  const { truncation = collectGitContextTruncation(context), ...rest } = extra;

  return {
    action,
    repositoryRoot: context.repositoryRoot,
    branch: context.branch,
    statusPorcelain: context.statusPorcelain,
    hasChanges: context.hasChanges,
    changedFiles: context.changedFiles,
    truncation,
    warnings: context.warnings,
    ...rest,
  };
}
