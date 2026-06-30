import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

import { COMMITME_COMMAND_NAME, EXTENSION_DISPLAY_NAME } from "../constants.ts";
import type { DraftCommitMessageDependency } from "../model/draft-commit-message.ts";
import type { CommitMeParseResult, CommitMeToolDetails } from "../types.ts";
import { draftAndCreateCommit } from "../workflows/commitme-commit-flow.ts";

const HELP_FLAGS = new Set(["--help", "-h"]);
const HELP_COMMAND = "help";

export type { DraftCommitMessage } from "../model/draft-commit-message.ts";

export interface RegisterCommitMeCommandOptions {
  draftCommitMessage?: DraftCommitMessageDependency;
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
    "CommitMe creates a one-line Lightweight Conventional Commit subject from your current git changes.",
    "",
    "## Commands",
    "",
    "### /commitme [steering prompt]",
    "Generates a one-line commit subject, stages the gathered changed paths, and creates a local git commit.",
    "Optional steering text guides the draft when it matches the actual git changes.",
    "",
    "### /commitme --confirm [steering prompt]",
    "Generates a one-line commit subject, shows a confirmation prompt with that subject, and commits only if you confirm.",
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
    "- CommitMe creates subject-only commits: no body, footer, bullets, or explanations.",
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

      const result = await draftAndCreateCommit(pi, {
        cwd: ctx.cwd,
        signal: ctx.signal,
        steeringPrompt: parsed.options.steeringPrompt,
        draftContext: ctx,
        ...(options.draftCommitMessage ? { draftCommitMessage: options.draftCommitMessage } : {}),
        confirmCommit: (subject) => confirmCommitIfNeeded(ctx, subject, parsed.options.confirm),
      });

      if (result.status === "no-changes") {
        ctx.ui.notify(`${EXTENSION_DISPLAY_NAME}: no staged or unstaged git changes found.`, "warning");
        return;
      }

      if (result.status === "cancelled") {
        ctx.ui.notify(`${EXTENSION_DISPLAY_NAME}: commit cancelled.`, "info");
        return;
      }

      sendCommitMeMessage(pi, `Committed ${result.committed.commitHash}: ${result.committed.subject}`, result.details);
    },
  });
}
