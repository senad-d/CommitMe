import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

import { COMMITME_COMMAND_NAME, EXTENSION_DISPLAY_NAME } from "../constants.ts";
import type { DraftCommitMessageDependency } from "../model/draft-commit-message.ts";
import type { CommitMeCommandOptions, CommitMeParseResult, CommitMeToolDetails } from "../types.ts";
import { draftAndCreateCommit } from "../workflows/commitme-commit-flow.ts";
import { createUnsafeCommitFileApproval } from "../workflows/unsafe-commit-approval.ts";

const HELP_FLAGS = new Set(["--help", "-h"]);
const HELP_COMMAND = "help";
const STEERING_FLAG = "--steering";
const STEERING_FLAG_PREFIX = "--steering=";

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

function helpParseResult(rawArgs: string): CommitMeParseResult {
  return {
    ok: true,
    options: {
      mode: "help",
      confirm: false,
      rawArgs,
    },
  };
}

function commitParseResult(rawArgs: string, confirm: boolean, steeringPrompt: string): CommitMeParseResult {
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

function unknownFlagParseResult(token: CommitMeArgToken): CommitMeParseResult {
  return {
    ok: false,
    error: `Unknown flag: ${token.text}`,
    unknownFlags: [token.text],
  };
}

function steeringFlagPrompt(raw: string, token: CommitMeArgToken): string {
  if (token.text === STEERING_FLAG) return raw.slice(token.end).trim();

  const inlinePrompt = token.text.slice(STEERING_FLAG_PREFIX.length);
  const trailingPrompt = raw.slice(token.end).trim();
  return [inlinePrompt, trailingPrompt].filter(Boolean).join(" ").trim();
}

function terminatingTokenParseResult(
  raw: string,
  rawArgs: string,
  token: CommitMeArgToken,
  confirm: boolean,
): CommitMeParseResult | undefined {
  if (token.text === "--") return commitParseResult(rawArgs, confirm, raw.slice(token.end).trim());
  if (HELP_FLAGS.has(token.lowerText)) return helpParseResult(rawArgs);
  if (token.text === STEERING_FLAG || token.text.startsWith(STEERING_FLAG_PREFIX)) {
    return commitParseResult(rawArgs, confirm, steeringFlagPrompt(raw, token));
  }
  if (token.text.startsWith("-") && token.text !== "--commit" && token.text !== "--confirm") return unknownFlagParseResult(token);
  return undefined;
}

interface CommitOptionScanResult {
  confirm: boolean;
  tokenIndex: number;
  result?: CommitMeParseResult;
}

function scanCommitOptionTokens(raw: string, rawArgs: string, tokens: CommitMeArgToken[]): CommitOptionScanResult {
  let confirm = false;

  for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex += 1) {
    const token = tokens[tokenIndex];
    if (!token) return { confirm, tokenIndex };

    const result = terminatingTokenParseResult(raw, rawArgs, token, confirm);
    if (result) return { confirm, tokenIndex, result };

    if (token.text === "--confirm") {
      confirm = true;
      continue;
    }
    if (token.text !== "--commit") return { confirm, tokenIndex };
  }

  return { confirm, tokenIndex: tokens.length };
}

export function parseCommitMeArgs(rawArgs: string): CommitMeParseResult {
  const raw = rawArgs.trim();
  const tokens = tokenizeCommitMeArgs(raw);

  if (helpCommandWasRequested(tokens)) return helpParseResult(rawArgs);

  const scan = scanCommitOptionTokens(raw, rawArgs, tokens);
  if (scan.result) return scan.result;

  const steeringStart = tokens[scan.tokenIndex]?.start ?? raw.length;
  const steeringPrompt = scan.tokenIndex < tokens.length ? raw.slice(steeringStart).trim() : "";
  return commitParseResult(rawArgs, scan.confirm, steeringPrompt);
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
    "### /commitme --steering <prompt>",
    "Passes explicit steering text (`--steering=<prompt>` also works). This is equivalent to positional steering text and works with `--confirm`.",
    "",
    "### /commitme -- --prompt-that-starts-with-a-dash",
    "Use `--` before positional steering text that begins with `-` or `--`.",
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

type CommitMeWorkflowOptions = Parameters<typeof draftAndCreateCommit>[1];

type CommitMeWorkflowResult = Awaited<ReturnType<typeof draftAndCreateCommit>>;

async function confirmCommitIfNeeded(ctx: ExtensionCommandContext, message: string, confirm: boolean): Promise<boolean> {
  if (!confirm) return true;
  if (!ctx.hasUI) {
    throw new Error(`${EXTENSION_DISPLAY_NAME}: --confirm requires a UI-capable Pi mode.`);
  }
  return ctx.ui.confirm(`${EXTENSION_DISPLAY_NAME}: create commit?`, `Commit with this message?\n\n${message}`);
}

function notifyParseError(ctx: ExtensionCommandContext, parsed: Extract<CommitMeParseResult, { ok: false }>): void {
  ctx.ui.notify(`${EXTENSION_DISPLAY_NAME}: ${parsed.error}`, "warning");
}

function handleHelpMode(pi: ExtensionAPI, parsedOptions: CommitMeCommandOptions): boolean {
  if (parsedOptions.mode !== "help") return false;
  sendCommitMeHelp(pi);
  return true;
}

function requireCommandConfirmationUi(ctx: ExtensionCommandContext, confirm: boolean): void {
  if (confirm && !ctx.hasUI) {
    throw new Error(`${EXTENSION_DISPLAY_NAME}: --confirm requires a UI-capable Pi mode.`);
  }
}

async function waitForIdleIfNeeded(ctx: ExtensionCommandContext): Promise<void> {
  if (ctx.isIdle()) return;
  ctx.ui.notify(`${EXTENSION_DISPLAY_NAME}: waiting for the current agent turn to finish...`, "info");
  await ctx.waitForIdle();
}

function buildWorkflowOptions(
  ctx: ExtensionCommandContext,
  parsedOptions: CommitMeCommandOptions,
  options: RegisterCommitMeCommandOptions,
): CommitMeWorkflowOptions {
  const approveUnsafeCommitFiles = createUnsafeCommitFileApproval(ctx);
  return {
    cwd: ctx.cwd,
    signal: ctx.signal,
    steeringPrompt: parsedOptions.steeringPrompt,
    draftContext: ctx,
    ...(options.draftCommitMessage ? { draftCommitMessage: options.draftCommitMessage } : {}),
    ...(approveUnsafeCommitFiles ? { approveUnsafeCommitFiles } : {}),
    confirmCommit: (subject) => confirmCommitIfNeeded(ctx, subject, parsedOptions.confirm),
  };
}

function handleWorkflowResult(pi: ExtensionAPI, ctx: ExtensionCommandContext, result: CommitMeWorkflowResult): void {
  if (result.status === "no-changes") {
    ctx.ui.notify(`${EXTENSION_DISPLAY_NAME}: no staged or unstaged git changes found.`, "warning");
    return;
  }

  if (result.status === "cancelled") {
    ctx.ui.notify(`${EXTENSION_DISPLAY_NAME}: commit cancelled.`, "info");
    return;
  }

  if (result.status === "blocked") {
    ctx.ui.notify(`${EXTENSION_DISPLAY_NAME}: commit blocked because potentially unsafe files were not approved.`, "warning");
    return;
  }

  sendCommitMeMessage(pi, `Committed ${result.committed.commitHash}: ${result.committed.subject}`, result.details);
}

async function handleCommitMeCommand(
  pi: ExtensionAPI,
  options: RegisterCommitMeCommandOptions,
  args: string,
  ctx: ExtensionCommandContext,
): Promise<void> {
  const parsed = parseCommitMeArgs(args);
  if (!parsed.ok) {
    notifyParseError(ctx, parsed);
    return;
  }

  if (handleHelpMode(pi, parsed.options)) return;

  requireCommandConfirmationUi(ctx, parsed.options.confirm);
  await waitForIdleIfNeeded(ctx);

  const workflowOptions = buildWorkflowOptions(ctx, parsed.options, options);
  const result = await draftAndCreateCommit(pi, workflowOptions);
  handleWorkflowResult(pi, ctx, result);
}

export function registerCommitMeCommand(pi: ExtensionAPI, options: RegisterCommitMeCommandOptions = {}) {
  pi.registerCommand(COMMITME_COMMAND_NAME, {
    description: "Create a Conventional Commit from staged and unstaged git changes",
    handler: (args, ctx) => handleCommitMeCommand(pi, options, args, ctx),
  });
}
