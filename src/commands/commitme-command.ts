import { complete } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

import { collectGitContextTruncation, createCommitMeDetails } from "../commitme-details.ts";
import { COMMITME_COMMAND_NAME, EXTENSION_DISPLAY_NAME } from "../constants.ts";
import { assertNoUnsafeCommitFiles, createCommit } from "../git/commit.ts";
import { gatherGitContext } from "../git/context.ts";
import { buildBoundedCommitPrompt } from "../prompt/build-commit-prompt.ts";
import type { CommitMeParseResult, CommitMeToolDetails } from "../types.ts";

const HELP_FLAGS = new Set(["--help", "-h"]);
const HELP_COMMAND = "help";

export type DraftCommitMessage = (prompt: string, ctx: ExtensionCommandContext) => Promise<string>;

export interface RegisterCommitMeCommandOptions {
  draftCommitMessage?: DraftCommitMessage;
}

interface CommitMeArgToken {
  text: string;
  lowerText: string;
  start: number;
  end: number;
}

function tokenizeCommitMeArgs(raw: string): CommitMeArgToken[] {
  return Array.from(raw.matchAll(/\S+/g), (match) => {
    const text = match[0];
    const start = match.index ?? 0;
    return {
      text,
      lowerText: text.toLowerCase(),
      start,
      end: start + text.length,
    };
  });
}

function helpCommandWasRequested(tokens: CommitMeArgToken[]): boolean {
  const firstToken = tokens[0];
  if (!firstToken) return false;
  if (HELP_FLAGS.has(firstToken.lowerText)) return true;
  if (firstToken.lowerText !== HELP_COMMAND) return false;
  return tokens.slice(1).every((token) => token.text.startsWith("-"));
}

export function parseCommitMeArgs(rawArgs: string): CommitMeParseResult {
  const raw = rawArgs.trim();
  const tokens = tokenizeCommitMeArgs(raw);

  if (helpCommandWasRequested(tokens)) {
    return {
      ok: true,
      options: {
        mode: "help",
        confirm: false,
        rawArgs,
      },
    };
  }

  let confirm = false;
  let tokenIndex = 0;
  while (tokenIndex < tokens.length) {
    const token = tokens[tokenIndex];
    if (!token) break;

    if (token.text === "--") {
      const steeringPrompt = raw.slice(token.end).trim();
      return {
        ok: true,
        options: {
          mode: "commit",
          confirm,
          rawArgs,
          ...(steeringPrompt ? { steeringPrompt } : {}),
        },
      };
    }

    if (HELP_FLAGS.has(token.lowerText)) {
      return {
        ok: true,
        options: {
          mode: "help",
          confirm: false,
          rawArgs,
        },
      };
    }

    if (token.text === "--commit") {
      tokenIndex += 1;
      continue;
    }

    if (token.text === "--confirm") {
      confirm = true;
      tokenIndex += 1;
      continue;
    }

    if (token.text.startsWith("-")) {
      return {
        ok: false,
        error: `Unknown flag: ${token.text}`,
        unknownFlags: [token.text],
      };
    }

    break;
  }

  const steeringPrompt = tokenIndex < tokens.length ? raw.slice(tokens[tokenIndex]?.start ?? raw.length).trim() : "";

  return {
    ok: true,
    options: {
      mode: "commit",
      confirm,
      rawArgs,
      ...(steeringPrompt ? { steeringPrompt } : {}),
    },
  };
}

function extractTextContent(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content
    .filter((part): part is { type: "text"; text: string } => {
      return (
        Boolean(part) &&
        typeof part === "object" &&
        "type" in part &&
        part.type === "text" &&
        "text" in part &&
        typeof part.text === "string"
      );
    })
    .map((part) => part.text)
    .join("\n")
    .trim();
}

export const draftCommitMessageWithActiveModel: DraftCommitMessage = async (prompt, ctx) => {
  if (!ctx.model) {
    throw new Error("No active Pi model is selected for CommitMe drafting.");
  }

  const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model);
  if (!auth.ok) {
    throw new Error(auth.error);
  }
  if (!auth.apiKey) {
    throw new Error(`No API key is available for ${ctx.model.provider}/${ctx.model.id}.`);
  }

  const response = await complete(
    ctx.model,
    {
      messages: [
        {
          role: "user" as const,
          content: [{ type: "text" as const, text: prompt }],
          timestamp: Date.now(),
        },
      ],
    },
    {
      apiKey: auth.apiKey,
      headers: auth.headers,
      maxTokens: 512,
      signal: ctx.signal,
    },
  );

  if (response.stopReason === "error") {
    throw new Error(response.errorMessage ?? "CommitMe model request failed.");
  }

  const draft = extractTextContent(response.content);
  if (!draft) {
    throw new Error("CommitMe received an empty commit message draft from the model.");
  }
  return draft;
};

function sendCommitMeMessage(pi: ExtensionAPI, content: string, details: CommitMeToolDetails) {
  pi.sendMessage(
    {
      customType: "commitme",
      content,
      display: true,
      details,
    },
    { triggerTurn: false },
  );
}

export function buildCommitMeHelpText(): string {
  return [
    "# CommitMe help",
    "",
    "CommitMe creates a Lightweight Conventional Commit from your current git changes.",
    "",
    "## Commands",
    "",
    "### /commitme [steering prompt]",
    "Generates a commit message, stages all changes with `git add -A`, and creates a local git commit.",
    "Optional steering text guides the draft when it matches the actual git changes.",
    "",
    "### /commitme --confirm [steering prompt]",
    "Generates a commit message, shows a confirmation prompt with that message, and commits only if you confirm.",
    "",
    "### /commitme -- --steering that starts with a dash",
    "Use `--` before steering text that begins with `-` or `--`.",
    "",
    "### /commitme help",
    "Shows this help panel. `/commitme --help` and `/commitme -h` work too.",
    "",
    "## Commit message standard",
    "",
    "Format: `<type>(optional-scope): <summary>`",
    "",
    "Allowed types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `build`, `ci`, `perf`, `style`, `revert`.",
    "",
    "Rules:",
    "- Use imperative mood: `add`, `fix`, `remove`; not `added` or `fixed`.",
    "- Keep the summary clear and specific.",
    "- Do not end the summary with a period.",
    "- Use a scope when it helps identify the affected area.",
    "- Use the body for why, `BREAKING CHANGE` for incompatible changes, and issue references when relevant.",
    "",
    "## Safety",
    "",
    "- CommitMe never runs `git push`.",
    "- Secret-like, generated, and binary file contents are omitted from model context.",
  ].join("\n");
}

function sendCommitMeHelp(pi: ExtensionAPI) {
  pi.sendMessage(
    {
      customType: "commitme",
      content: buildCommitMeHelpText(),
      display: true,
      details: { action: "help" },
    },
    { triggerTurn: false },
  );
}

async function confirmCommitIfNeeded(ctx: ExtensionCommandContext, message: string, confirm: boolean): Promise<boolean> {
  if (!confirm) return true;
  if (!ctx.hasUI) {
    throw new Error(`${EXTENSION_DISPLAY_NAME}: --confirm requires a UI-capable Pi mode.`);
  }
  return ctx.ui.confirm(`${EXTENSION_DISPLAY_NAME}: create commit?`, `Commit with this message?\n\n${message}`);
}

export function registerCommitMeCommand(pi: ExtensionAPI, options: RegisterCommitMeCommandOptions = {}) {
  const draftCommitMessage = options.draftCommitMessage ?? draftCommitMessageWithActiveModel;

  pi.registerCommand(COMMITME_COMMAND_NAME, {
    description: "Create a Conventional Commit from staged and unstaged git changes",
    handler: async (args, ctx) => {
      const parsed = parseCommitMeArgs(args);
      if (!parsed.ok) {
        ctx.ui.notify(`${EXTENSION_DISPLAY_NAME}: ${parsed.error}`, "warning");
        return;
      }

      if (parsed.options.mode === "help") {
        sendCommitMeHelp(pi);
        return;
      }

      if (parsed.options.confirm && !ctx.hasUI) {
        throw new Error(`${EXTENSION_DISPLAY_NAME}: --confirm requires a UI-capable Pi mode.`);
      }

      if (!ctx.isIdle()) {
        ctx.ui.notify(`${EXTENSION_DISPLAY_NAME}: waiting for the current agent turn to finish...`, "info");
        await ctx.waitForIdle();
      }

      const gitContext = await gatherGitContext(pi, { cwd: ctx.cwd, signal: ctx.signal });
      if (!gitContext.hasChanges) {
        ctx.ui.notify(`${EXTENSION_DISPLAY_NAME}: no staged or unstaged git changes found.`, "warning");
        return;
      }
      assertNoUnsafeCommitFiles(gitContext.changedFiles);

      const prompt = buildBoundedCommitPrompt(gitContext, { steeringPrompt: parsed.options.steeringPrompt });
      const draft = await draftCommitMessage(prompt.text, ctx);
      const details = createCommitMeDetails("gather", gitContext, {
        ...(parsed.options.steeringPrompt ? { steeringPrompt: parsed.options.steeringPrompt } : {}),
        truncation: [...collectGitContextTruncation(gitContext), prompt.truncation],
      });

      const confirmed = await confirmCommitIfNeeded(ctx, draft, parsed.options.confirm);
      if (!confirmed) {
        ctx.ui.notify(`${EXTENSION_DISPLAY_NAME}: commit cancelled.`, "info");
        return;
      }

      const committed = await createCommit(pi, {
        cwd: ctx.cwd,
        signal: ctx.signal,
        message: draft,
        expectedStatusPorcelain: gitContext.statusPorcelain,
      });
      sendCommitMeMessage(pi, `Committed ${committed.commitHash}: ${committed.subject}`, {
        ...details,
        action: "commit",
        committed,
      });
    },
  });
}
