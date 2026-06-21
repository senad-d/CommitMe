import { StringEnum } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";

import { collectGitContextTruncation, createCommitMeDetails } from "../commitme-details.ts";
import { COMMITME_TOOL_NAME, EXTENSION_DISPLAY_NAME } from "../constants.ts";
import { assertNoUnsafeCommitFiles, createCommit } from "../git/commit.ts";
import { gatherGitContext } from "../git/context.ts";
import { buildBoundedCommitPrompt } from "../prompt/build-commit-prompt.ts";

const COMMITME_TOOL_ACTIONS = ["gather", "commit"] as const;

export const CommitMeToolParameters = Type.Object({
  action: Type.Optional(
    StringEnum(COMMITME_TOOL_ACTIONS, {
      description: "Use gather to collect commit context. Use commit only with an explicit final message.",
      default: "gather",
    }),
  ),
  message: Type.Optional(Type.String({ description: "Final Lightweight Conventional Commit message to use when action is commit." })),
  confirm: Type.Optional(Type.Boolean({ description: "Ask before creating the commit when UI is available." })),
});

export type CommitMeToolInput = Static<typeof CommitMeToolParameters>;

function requireCommitMessage(message: string | undefined): string {
  if (!message || message.trim().length === 0) {
    throw new Error("commitme action=commit requires a final Lightweight Conventional Commit message.");
  }
  return message;
}

export function createCommitMeTool(pi: ExtensionAPI) {
  return defineTool({
    name: COMMITME_TOOL_NAME,
    label: EXTENSION_DISPLAY_NAME,
    description:
      "CommitMe gathers local git diff and project context for a Lightweight Conventional Commit message. Slash usage: /commitme commits, /commitme --confirm asks first, /commitme help shows help. Tool usage: action=gather is read-only; action=commit creates a local commit only with an explicit final message. CommitMe never pushes.",
    promptSnippet: "Gather local git changes and project context for a Lightweight Conventional Commit message",
    promptGuidelines: [
      "Use commitme when the user asks for a Lightweight Conventional Commit message based on the current git diff.",
      "Use commitme instead of manually inspecting every changed file when compact git context is enough.",
      "Do not use commitme action=commit unless the user explicitly requested creating a commit and a final message is available.",
      "After commitme gathers context, draft exactly one Lightweight Conventional Commit message unless the user asks otherwise.",
      "Tell users that /commitme commits, /commitme --confirm asks first, and /commitme help shows usage when they ask how to run CommitMe.",
    ],
    parameters: CommitMeToolParameters,
    executionMode: "sequential",

    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const action = params.action ?? "gather";

      if (action === "commit") {
        const message = requireCommitMessage(params.message);
        const context = await gatherGitContext(pi, { cwd: ctx.cwd, signal });
        assertNoUnsafeCommitFiles(context.changedFiles);

        if (params.confirm) {
          if (!ctx.hasUI) {
            throw new Error("commitme confirm=true requires a UI-capable Pi mode.");
          }
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

      const context = await gatherGitContext(pi, { cwd: ctx.cwd, signal });
      const prompt = buildBoundedCommitPrompt(context);
      const details = createCommitMeDetails("gather", context, {
        truncation: [...collectGitContextTruncation(context), prompt.truncation],
      });

      return {
        content: [{ type: "text", text: prompt.text }],
        details,
      };
    },
  });
}

export function registerCommitMeTool(pi: ExtensionAPI) {
  pi.registerTool(createCommitMeTool(pi));
}
