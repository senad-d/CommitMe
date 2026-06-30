import { collectGitContextTruncation, createCommitMeDetails } from "../commitme-details.ts";
import { assertNoUnsafeCommitFiles, createCommit, validateCommitMessage } from "../git/commit.ts";
import { gatherGitContext } from "../git/context.ts";
import {
  draftCommitMessageWithActiveModelDiagnostics,
  type DraftCommitMessageContext,
  type DraftCommitMessageDependency,
  type DraftCommitMessageResult,
} from "../model/draft-commit-message.ts";
import { buildBoundedCommitPrompt } from "../prompt/build-commit-prompt.ts";
import type { CommitMeExecutor, CommitMeToolDetails, CommitPromptPayload, CommitResult, GitContext } from "../types.ts";

export interface DraftAndCreateCommitOptions {
  cwd?: string;
  signal?: AbortSignal;
  steeringPrompt?: string;
  draftContext: DraftCommitMessageContext;
  draftCommitMessage?: DraftCommitMessageDependency;
  confirmCommit?: (subject: string) => Promise<boolean>;
}

export type CommitMeCommitFlowResult =
  | {
      status: "committed";
      context: GitContext;
      prompt: CommitPromptPayload;
      subject: string;
      committed: CommitResult;
      details: CommitMeToolDetails;
    }
  | {
      status: "cancelled";
      context: GitContext;
      prompt: CommitPromptPayload;
      subject: string;
      details: CommitMeToolDetails;
    }
  | { status: "no-changes"; context: GitContext; details: CommitMeToolDetails };

function isDraftCommitMessageResult(value: string | DraftCommitMessageResult): value is DraftCommitMessageResult {
  return Boolean(value) && typeof value === "object" && "message" in value && typeof value.message === "string" && "attempts" in value && Array.isArray(value.attempts);
}

async function draftWithDiagnostics(
  prompt: CommitPromptPayload,
  context: DraftCommitMessageContext,
  draftCommitMessage: DraftCommitMessageDependency,
): Promise<DraftCommitMessageResult> {
  const result = await draftCommitMessage(prompt.text, context, prompt);
  if (isDraftCommitMessageResult(result)) return result;
  return { message: result, attempts: [] };
}

function createDraftCommitDetails(
  context: GitContext,
  prompt: CommitPromptPayload,
  draft: DraftCommitMessageResult,
  options: Pick<DraftAndCreateCommitOptions, "steeringPrompt"> & { committed?: CommitResult } = {},
): CommitMeToolDetails {
  return createCommitMeDetails("commit", context, {
    ...(options.steeringPrompt ? { steeringPrompt: options.steeringPrompt } : {}),
    truncation: [...collectGitContextTruncation(context), ...prompt.truncation],
    prompt: prompt.diagnostics,
    draft: draft.attempts,
    ...(options.committed ? { committed: options.committed } : {}),
  });
}

export async function draftAndCreateCommit(
  executor: CommitMeExecutor,
  options: DraftAndCreateCommitOptions,
): Promise<CommitMeCommitFlowResult> {
  const context = await gatherGitContext(executor, { cwd: options.cwd, signal: options.signal });
  if (!context.hasChanges) {
    return {
      status: "no-changes",
      context,
      details: createCommitMeDetails("commit", context, {
        ...(options.steeringPrompt ? { steeringPrompt: options.steeringPrompt } : {}),
      }),
    };
  }

  assertNoUnsafeCommitFiles(context.changedFiles);

  const prompt = buildBoundedCommitPrompt(context, {
    steeringPrompt: options.steeringPrompt,
    modelContextWindow: options.draftContext.model?.contextWindow,
    modelMaxTokens: options.draftContext.model?.maxTokens,
  });
  const draftCommitMessage = options.draftCommitMessage ?? draftCommitMessageWithActiveModelDiagnostics;
  const draft = await draftWithDiagnostics(prompt, options.draftContext, draftCommitMessage);
  const validation = validateCommitMessage(draft.message);
  if (!validation.ok) {
    throw new Error(`CommitMe received an invalid commit message draft: ${validation.error} CommitMe did not stage or commit.`);
  }

  const details = createDraftCommitDetails(context, prompt, draft, { steeringPrompt: options.steeringPrompt });
  const confirmed = options.confirmCommit ? await options.confirmCommit(validation.subject) : true;
  if (!confirmed) {
    return {
      status: "cancelled",
      context,
      prompt,
      subject: validation.subject,
      details,
    };
  }

  const committed = await createCommit(executor, {
    cwd: options.cwd,
    signal: options.signal,
    message: validation.subject,
    expectedStatusPorcelain: context.statusPorcelain,
  });

  return {
    status: "committed",
    context,
    prompt,
    subject: validation.subject,
    committed,
    details: createDraftCommitDetails(context, prompt, draft, { steeringPrompt: options.steeringPrompt, committed }),
  };
}
