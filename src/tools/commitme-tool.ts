import { StringEnum } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";

import { collectGitContextTruncation, createCommitMeDetails } from "../commitme-details.ts";
import { COMMITME_TOOL_NAME, EXTENSION_DISPLAY_NAME } from "../constants.ts";
import { assertNoUnsafeCommitFiles, createCommit, validateCommitMessage } from "../git/commit.ts";
import { gatherGitContext } from "../git/context.ts";
import type { DraftCommitMessageDependency } from "../model/draft-commit-message.ts";
import { buildBoundedCommitPrompt } from "../prompt/build-commit-prompt.ts";
import { draftAndCreateCommit } from "../workflows/commitme-commit-flow.ts";

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

export function createCommitMeTool(pi: ExtensionAPI, options: CreateCommitMeToolOptions = {}) {
  return defineTool({
    name: COMMITME_TOOL_NAME,
    label: EXTENSION_DISPLAY_NAME,
    description:
      "CommitMe gathers local git diff and project context or creates local commits. Slash usage: /commitme commits, /commitme --confirm asks first, /commitme [steering prompt] guides drafting, and /commitme help shows help. Tool usage: action=gather is read-only; action=commit with message uses an explicit final subject; action=commit without message drafts and commits like /commitme. CommitMe never pushes.",
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
      "Remember commitme never pushes.",
      "Tell users that /commitme commits, /commitme --confirm asks first, /commitme [steering prompt] guides drafting, and /commitme help shows usage when they ask how to run CommitMe.",
    ],
    parameters: CommitMeToolParameters,
    executionMode: "sequential",

    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const action = params.action ?? "gather";

      if (action === "commit") {
        if (params.message !== undefined) {
          const message = requireValidCommitMessage(params.message);
          if (params.confirm && !ctx.hasUI) {
            throw new Error("commitme confirm=true requires a UI-capable Pi mode.");
          }

          const context = await gatherGitContext(pi, { cwd: ctx.cwd, signal });
          assertNoUnsafeCommitFiles(context.changedFiles);

          if (params.confirm) {
            const confirmed = await ctx.ui.confirm("CommitMe: create commit?", `Commit with this message?\n\n${message}`);
            if (!confirmed) {
              return {
                content: [{ type: "text", text: "CommitMe commit cancelled; no git mutation was performed." }],
                details: createCommitMeDetails("commit", context),
              };
            }
          }
          const committed = await createCommit(pi, {
            cwd: ctx.cwd,
            signal,
            message,
            expectedStatusPorcelain: context.statusPorcelain,
          });
          return {
            content: [{ type: "text", text: `Committed ${committed.commitHash}: ${committed.subject}` }],
            details: createCommitMeDetails("commit", context, { committed }),
          };
        }

        if (params.confirm && !ctx.hasUI) {
          throw new Error("commitme confirm=true requires a UI-capable Pi mode.");
        }

        const result = await draftAndCreateCommit(pi, {
          cwd: ctx.cwd,
          signal,
          steeringPrompt: params.steeringPrompt,
          draftContext: { model: ctx.model, modelRegistry: ctx.modelRegistry, signal },
          ...(options.draftCommitMessage ? { draftCommitMessage: options.draftCommitMessage } : {}),
          ...(params.confirm
            ? { confirmCommit: (subject: string) => ctx.ui.confirm("CommitMe: create commit?", `Commit with this message?\n\n${subject}`) }
            : {}),
        });

        if (result.status === "no-changes") {
          return {
            content: [{ type: "text", text: "No staged or unstaged git changes found; no commit was created." }],
            details: result.details,
            terminate: true,
          };
        }

        if (result.status === "cancelled") {
          return {
            content: [{ type: "text", text: "CommitMe commit cancelled; no git mutation was performed." }],
            details: result.details,
            terminate: true,
          };
        }

        return {
          content: [{ type: "text", text: `Committed ${result.committed.commitHash}: ${result.committed.subject}` }],
          details: result.details,
          terminate: true,
        };
      }

      const context = await gatherGitContext(pi, { cwd: ctx.cwd, signal });
      const prompt = buildBoundedCommitPrompt(context, {
        steeringPrompt: params.steeringPrompt,
        modelContextWindow: ctx.model?.contextWindow,
        modelMaxTokens: ctx.model?.maxTokens,
      });
      const details = createCommitMeDetails("gather", context, {
        ...(params.steeringPrompt ? { steeringPrompt: params.steeringPrompt } : {}),
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
    },
  });
}

export function registerCommitMeTool(pi: ExtensionAPI) {
  pi.registerTool(createCommitMeTool(pi));
}
