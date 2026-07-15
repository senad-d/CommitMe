import { StringEnum } from "@earendil-works/pi-ai";
import { defineTool, type AgentToolResult, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";

import { collectGitContextTruncation, createCommitMeDetails } from "../commitme-details.ts";
import { COMMITME_TOOL_NAME, EXTENSION_DISPLAY_NAME } from "../constants.ts";
import { CommitMeCommitError, assertNoUnsafeCommitFiles, createCommit, validateCommitMessage } from "../git/commit.ts";
import { gatherGitContext } from "../git/context.ts";
import type { DraftCommitMessageDependency } from "../model/draft-commit-message.ts";
import { buildBoundedCommitPrompt } from "../prompt/build-commit-prompt.ts";
import type { CommitMeToolDetails, CommitResult, GitContext } from "../types.ts";
import { draftAndCreateCommit } from "../workflows/commitme-commit-flow.ts";
import { createUnsafeCommitFileApproval } from "../workflows/unsafe-commit-approval.ts";

const COMMITME_TOOL_ACTIONS = ["gather", "commit"] as const;

export const CommitMeToolParameters = Type.Object({
  action: Type.Optional(
    StringEnum(COMMITME_TOOL_ACTIONS, {
      description: "Use gather to collect commit context. Use commit to create a local commit with either an explicit message or a drafted message when message is omitted.",
      default: "gather",
    }),
  ),
  message: Type.Optional(
    Type.String({
      description:
        "When present with action=commit, use this final one-line Lightweight Conventional Commit subject. When omitted with action=commit, CommitMe drafts the subject using /commitme logic. Empty or whitespace-only values are invalid explicit messages.",
    }),
  ),
  steeringPrompt: Type.Optional(
    Type.String({ description: "Optional user guidance to include in gather prompts and message-less commit drafting prompts." }),
  ),
  confirm: Type.Optional(Type.Boolean({ description: "Ask before creating the local commit when UI is available." })),
});

export type CommitMeToolInput = Static<typeof CommitMeToolParameters>;

export interface CreateCommitMeToolOptions {
  draftCommitMessage?: DraftCommitMessageDependency;
}

type CommitMeToolResult = AgentToolResult<CommitMeToolDetails>;

type DraftedCommitResult = Awaited<ReturnType<typeof draftAndCreateCommit>>;

interface CommitMeToolRuntime {
  pi: ExtensionAPI;
  options: CreateCommitMeToolOptions;
  params: CommitMeToolInput;
  signal: AbortSignal | undefined;
  ctx: ExtensionContext;
}

function requireValidCommitMessage(message: string | undefined): string {
  if (!message || message.trim().length === 0) {
    throw new Error("commitme action=commit requires a final one-line Lightweight Conventional Commit subject.");
  }

  const validation = validateCommitMessage(message);
  if (!validation.ok) {
    throw new Error(`commitme action=commit received an invalid Lightweight Conventional Commit subject: ${validation.error}`);
  }
  return validation.subject;
}

function requireConfirmationUi(ctx: ExtensionContext, confirm: boolean | undefined): void {
  if (confirm && !ctx.hasUI) {
    throw new Error("commitme confirm=true requires a UI-capable Pi mode.");
  }
}

async function confirmCommit(ctx: ExtensionContext, message: string, confirm: boolean | undefined): Promise<boolean> {
  requireConfirmationUi(ctx, confirm);
  if (!confirm) return true;
  return ctx.ui.confirm("CommitMe: create commit?", `Commit with this message?\n\n${message}`);
}

function cancelledCommitResult(context: GitContext): CommitMeToolResult {
  return {
    content: [{ type: "text", text: "CommitMe commit cancelled; no git mutation was performed." }],
    details: createCommitMeDetails("commit", context),
  };
}

function committedResult(context: GitContext, committed: CommitResult): CommitMeToolResult {
  return {
    content: [{ type: "text", text: `Committed ${committed.commitHash}: ${committed.subject}` }],
    details: createCommitMeDetails("commit", context, { committed }),
  };
}

function blockedCommitResult(context: GitContext): CommitMeToolResult {
  return {
    content: [{ type: "text", text: "CommitMe commit blocked because potentially unsafe files were not approved." }],
    details: createCommitMeDetails("commit", context),
  };
}

function draftedCommitResult(result: DraftedCommitResult): CommitMeToolResult {
  if (result.status === "no-changes") {
    return {
      content: [{ type: "text", text: "No staged or unstaged git changes found; no commit was created." }],
      details: result.details,
    };
  }

  if (result.status === "cancelled") {
    return {
      content: [{ type: "text", text: "CommitMe commit cancelled; no git mutation was performed." }],
      details: result.details,
    };
  }

  if (result.status === "blocked") {
    return {
      content: [{ type: "text", text: "CommitMe commit blocked because potentially unsafe files were not approved." }],
      details: result.details,
    };
  }

  return {
    content: [{ type: "text", text: `Committed ${result.committed.commitHash}: ${result.committed.subject}` }],
    details: result.details,
  };
}

async function executeExplicitCommit(runtime: CommitMeToolRuntime): Promise<CommitMeToolResult> {
  const message = requireValidCommitMessage(runtime.params.message);
  requireConfirmationUi(runtime.ctx, runtime.params.confirm);

  const context = await gatherGitContext(runtime.pi, { cwd: runtime.ctx.cwd, signal: runtime.signal });
  const approveUnsafeCommitFiles = createUnsafeCommitFileApproval(runtime.ctx);
  if (!approveUnsafeCommitFiles) assertNoUnsafeCommitFiles(context.changedFiles);

  if (!(await confirmCommit(runtime.ctx, message, runtime.params.confirm))) {
    return cancelledCommitResult(context);
  }

  try {
    const committed = await createCommit(runtime.pi, {
      cwd: runtime.ctx.cwd,
      signal: runtime.signal,
      message,
      expectedStatusPorcelain: context.statusPorcelain,
      approveUnsafeCommitFiles,
    });
    return committedResult(context, committed);
  } catch (error) {
    if (error instanceof CommitMeCommitError && error.code === "unsafe-sensitive-files-blocked") {
      return blockedCommitResult(context);
    }
    throw error;
  }
}

async function executeDraftedCommit(runtime: CommitMeToolRuntime): Promise<CommitMeToolResult> {
  requireConfirmationUi(runtime.ctx, runtime.params.confirm);

  const approveUnsafeCommitFiles = createUnsafeCommitFileApproval(runtime.ctx);
  const result = await draftAndCreateCommit(runtime.pi, {
    cwd: runtime.ctx.cwd,
    signal: runtime.signal,
    steeringPrompt: runtime.params.steeringPrompt,
    draftContext: { model: runtime.ctx.model, modelRegistry: runtime.ctx.modelRegistry, signal: runtime.signal },
    ...(runtime.options.draftCommitMessage ? { draftCommitMessage: runtime.options.draftCommitMessage } : {}),
    ...(approveUnsafeCommitFiles ? { approveUnsafeCommitFiles } : {}),
    ...(runtime.params.confirm
      ? { confirmCommit: (subject: string) => runtime.ctx.ui.confirm("CommitMe: create commit?", `Commit with this message?\n\n${subject}`) }
      : {}),
  });

  return draftedCommitResult(result);
}

async function executeCommit(runtime: CommitMeToolRuntime): Promise<CommitMeToolResult> {
  if (runtime.params.message !== undefined) return executeExplicitCommit(runtime);
  return executeDraftedCommit(runtime);
}

async function executeGather(runtime: CommitMeToolRuntime): Promise<CommitMeToolResult> {
  const context = await gatherGitContext(runtime.pi, { cwd: runtime.ctx.cwd, signal: runtime.signal });
  const prompt = buildBoundedCommitPrompt(context, {
    steeringPrompt: runtime.params.steeringPrompt,
    modelContextWindow: runtime.ctx.model?.contextWindow,
    modelMaxTokens: runtime.ctx.model?.maxTokens,
  });
  const details = createCommitMeDetails("gather", context, {
    ...(runtime.params.steeringPrompt ? { steeringPrompt: runtime.params.steeringPrompt } : {}),
    truncation: [...collectGitContextTruncation(context), ...prompt.truncation],
    prompt: prompt.diagnostics,
  });
  const content = [
    "CommitMe gathered local git context. Use the instructions below to produce exactly one Lightweight Conventional Commit subject line as your next assistant response. Do not summarize this prompt.",
    "",
    prompt.text,
  ].join("\n");

  return {
    content: [{ type: "text", text: content }],
    details,
  };
}

export function createCommitMeTool(pi: ExtensionAPI, options: CreateCommitMeToolOptions = {}) {
  return defineTool({
    name: COMMITME_TOOL_NAME,
    label: EXTENSION_DISPLAY_NAME,
    description:
      "CommitMe gathers local git diff and project context or creates local commits. Slash usage: /commitme commits, /commitme --confirm asks first, /commitme [steering prompt] or /commitme --steering guides drafting, and /commitme help shows help. Tool usage: action=gather is read-only; action=commit with message uses an explicit final subject; action=commit without message drafts and commits like /commitme.",
    promptSnippet: "Gather local git changes and project context for a one-line Lightweight Conventional Commit subject",
    promptGuidelines: [
      "Use commitme action=gather when the user asks for a commit message but not a commit.",
      "Use commitme instead of manually inspecting every changed file when compact git context is enough.",
      "Use commitme action=commit without message only when the user explicitly asks to create a local git commit from current changes.",
      "Use commitme action=commit with message only when a final one-line subject has already been selected.",
      "After commitme action=gather returns context, draft exactly one Lightweight Conventional Commit subject line unless the user asks otherwise.",
      "Pass user wording or scope guidance as commitme steeringPrompt when it matches the requested commit.",
      "Set commitme confirm=true only when the user asks to review or confirm before committing.",
      "Use commitme in same-turn edit-and-commit flows only when the user explicitly requested that end-to-end workflow.",
      "After commitme action=commit returns, continue any remaining user-requested workflow steps with the appropriate tools.",
      "Tell users that /commitme commits, /commitme --confirm asks first, /commitme [steering prompt] or /commitme --steering guides drafting, and /commitme help shows usage when they ask how to run CommitMe.",
    ],
    parameters: CommitMeToolParameters,
    executionMode: "sequential",

    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const runtime = { pi, options, params, signal, ctx };
      const action = params.action ?? "gather";
      if (action === "commit") return executeCommit(runtime);
      return executeGather(runtime);
    },
  });
}

export function registerCommitMeTool(pi: ExtensionAPI) {
  pi.registerTool(createCommitMeTool(pi));
}
