import { DEFAULT_COMMIT_TIMEOUT_MS } from "../constants.ts";
import type {
  ChangedFile,
  CommitMeExecOptions,
  CommitMeExecResult,
  CommitMeExecutor,
  CommitMessageValidationResult,
  CommitResult,
} from "../types.ts";
import { formatDisplayPath } from "../utils/display-path.ts";
import { gatherGitContext, isKnownSecretPath, runGit, STATUS_PORCELAIN_ARGS } from "./context.ts";

const CONVENTIONAL_SUBJECT_RE = /^(feat|fix|refactor|docs|test|chore|build|ci|perf|style|revert)(\([A-Za-z0-9._/-]+\))?!?: (?<summary>[^\s].*)$/;
const MARKDOWN_FENCE_LANGUAGE_RE = /^[A-Za-z0-9_-]+$/u;
const MATCHING_QUOTES_RE = /^(["'])([\s\S]*)\1$/;
const SIMPLE_PREFIX_RE = /^(?:final\s+answer|final\s+commit\s+message|commit\s+message|message|subject):\s*/i;
const HERE_IS_PREFIX_RE = /^here(?:'s|\s+is)\s+(?:the\s+)?(?:final\s+)?(?:commit\s+message|message):\s*/i;
const LIST_BULLET_RE = /^[-*]\s+/;
const LIST_NUMBER_RE = /^\d+[.)]\s+/;

export class CommitMeCommitError extends Error {
  readonly code: string;
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode?: number;

  constructor(message: string, options: { code: string; result?: CommitMeExecResult }) {
    super(message);
    this.name = "CommitMeCommitError";
    this.code = options.code;
    this.stdout = options.result?.stdout ?? "";
    this.stderr = options.result?.stderr ?? "";
    this.exitCode = options.result?.code;
  }
}

export interface CreateCommitOptions extends CommitMeExecOptions {
  message: string;
  expectedStatusPorcelain?: string;
}

function isDeletionStatus(status: string): boolean {
  return status.trim() === "D";
}

function collectChangedFilePathspecs(files: ChangedFile[]): { add: string[]; remove: string[] } {
  const add = new Set<string>();
  const remove = new Set<string>();
  for (const file of files) {
    if (isDeletionStatus(file.status)) {
      remove.add(file.path);
    } else {
      add.add(file.path);
    }

    if (file.status.startsWith("R")) {
      for (const relatedPath of file.relatedPaths ?? []) remove.add(relatedPath);
    }
  }
  return {
    add: [...add].sort((a, b) => a.localeCompare(b)),
    remove: [...remove].sort((a, b) => a.localeCompare(b)),
  };
}

async function assertGitStatusUnchanged(
  executor: CommitMeExecutor,
  expectedStatusPorcelain: string,
  options: CommitMeExecOptions,
): Promise<void> {
  const currentStatus = (await runGit(executor, STATUS_PORCELAIN_ARGS, options)).stdout.trim();
  if (currentStatus !== expectedStatusPorcelain.trim()) {
    throw new CommitMeCommitError("Git status changed since CommitMe gathered context; rerun CommitMe before committing.", {
      code: "working-tree-changed",
    });
  }
}

export function findUnsafeCommitFiles(files: ChangedFile[]): ChangedFile[] {
  const byPath = new Map<string, ChangedFile>();
  for (const file of files) {
    if (isDeletionStatus(file.status)) continue;
    if (!file.secretContent && !file.unreadable && !isKnownSecretPath(file.path)) continue;
    byPath.set(file.path, file);
  }
  return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
}

export function assertNoUnsafeCommitFiles(files: ChangedFile[]): void {
  const unsafeFiles = findUnsafeCommitFiles(files);
  if (unsafeFiles.length === 0) return;

  const displayedPaths = unsafeFiles.slice(0, 10).map((file) => formatDisplayPath(file.path)).join(", ");
  const omittedCount = unsafeFiles.length - 10;
  const suffix = omittedCount > 0 ? `, and ${omittedCount} more` : "";
  throw new CommitMeCommitError(
    `CommitMe refused to create a commit because known secret files or high-confidence secret tokens, or unreadable changed files, would be staged: ${displayedPaths}${suffix}. Remove them from the commit or commit them manually if intentional.`,
    { code: "unsafe-sensitive-files" },
  );
}

function isMarkdownFenceOpening(line: string): boolean {
  if (line === "```") return true;
  if (!line.startsWith("```")) return false;
  return MARKDOWN_FENCE_LANGUAGE_RE.test(line.slice(3));
}

function stripMarkdownFence(text: string): string {
  const trimmed = text.trim();
  const lines = trimmed.split("\n");
  if (lines.length < 3) return trimmed;

  const openingFence = lines[0]?.trim() ?? "";
  const closingFence = lines.at(-1)?.trim() ?? "";
  if (!isMarkdownFenceOpening(openingFence) || closingFence !== "```") return trimmed;

  return lines.slice(1, -1).join("\n").trim();
}

function stripMatchingQuotes(text: string): string {
  const match = MATCHING_QUOTES_RE.exec(text);
  return match?.[2]?.trim() ?? text;
}

function stripSimplePrefix(text: string): string {
  return text.replace(SIMPLE_PREFIX_RE, "").replace(HERE_IS_PREFIX_RE, "").trim();
}

function stripListMarker(text: string): string {
  return text.replace(LIST_BULLET_RE, "").replace(LIST_NUMBER_RE, "").trim();
}

function cleanSubjectLineCandidate(line: string): string {
  return stripListMarker(stripSimplePrefix(stripMatchingQuotes(line.trim()))).trim();
}

function isConventionalSubject(candidate: string): boolean {
  return CONVENTIONAL_SUBJECT_RE.exec(candidate) !== null;
}

function findFirstConventionalSubjectLine(text: string): string | undefined {
  for (const line of text.split("\n")) {
    const candidate = cleanSubjectLineCandidate(line);
    if (isConventionalSubject(candidate)) return candidate;
  }
  return undefined;
}

export function extractCommitMessage(raw: string): string {
  let text = stripMarkdownFence(raw.replaceAll("\r\n", "\n")).trim();
  text = stripMatchingQuotes(stripSimplePrefix(text)).trim();

  const lines = text.split("\n");
  const firstNonEmptyIndex = lines.findIndex((line) => line.trim().length > 0);
  if (firstNonEmptyIndex >= 0) {
    const cleanedFirstLine = cleanSubjectLineCandidate(lines[firstNonEmptyIndex] ?? "");
    if (isConventionalSubject(cleanedFirstLine)) return cleanedFirstLine;
  }

  const extractedSubject = findFirstConventionalSubjectLine(text);
  return extractedSubject ?? text;
}

export function validateCommitMessage(raw: string): CommitMessageValidationResult {
  const message = extractCommitMessage(raw);
  if (!message) {
    return { ok: false, error: "Commit message is empty." };
  }

  const subject = message.split("\n")[0]?.trim() ?? "";
  const body = "";

  if (!subject) {
    return { ok: false, error: "Commit message subject is empty." };
  }

  const subjectMatch = CONVENTIONAL_SUBJECT_RE.exec(subject);
  if (!subjectMatch) {
    return {
      ok: false,
      error: "Commit message subject must use Lightweight Conventional Commit format: type(optional-scope): summary.",
    };
  }

  const summary = subjectMatch.groups?.summary ?? "";
  if (summary.endsWith(".")) {
    return { ok: false, error: "Commit message summary must not end with a period." };
  }

  return {
    ok: true,
    subject,
    body,
    message: subject,
  };
}

export async function createCommit(executor: CommitMeExecutor, options: CreateCommitOptions): Promise<CommitResult> {
  const validation = validateCommitMessage(options.message);
  if (!validation.ok) {
    throw new CommitMeCommitError(validation.error, { code: "invalid-message" });
  }

  const commonOptions = { cwd: options.cwd, signal: options.signal, timeout: options.timeout ?? DEFAULT_COMMIT_TIMEOUT_MS };
  if (options.expectedStatusPorcelain !== undefined) {
    await assertGitStatusUnchanged(executor, options.expectedStatusPorcelain, commonOptions);
  }

  const currentContext = await gatherGitContext(executor, commonOptions);
  assertNoUnsafeCommitFiles(currentContext.changedFiles);
  await assertGitStatusUnchanged(executor, currentContext.statusPorcelain, commonOptions);

  const changedPathspecs = collectChangedFilePathspecs(currentContext.changedFiles);
  if (changedPathspecs.add.length === 0 && changedPathspecs.remove.length === 0) {
    throw new CommitMeCommitError("No git changes to commit after gathering context.", { code: "no-changes" });
  }

  if (changedPathspecs.add.length > 0) {
    await runGit(executor, ["add", "-A", "--", ...changedPathspecs.add], commonOptions);
  }
  if (changedPathspecs.remove.length > 0) {
    await runGit(executor, ["rm", "--cached", "--ignore-unmatch", "--", ...changedPathspecs.remove], commonOptions);
  }

  const status = (await runGit(executor, ["status", "--porcelain=v1"], commonOptions)).stdout.trim();
  if (!status) {
    throw new CommitMeCommitError("No git changes to commit after staging all changes.", { code: "no-changes" });
  }

  const commitArgs = ["commit", "-m", validation.subject];
  if (validation.body) {
    commitArgs.push("-m", validation.body);
  }

  const commitResult = await runGit(executor, commitArgs, { ...commonOptions, allowFailure: true });
  if (commitResult.code !== 0) {
    const detail = commitResult.stderr.trim() || commitResult.stdout.trim() || "git commit failed";
    throw new CommitMeCommitError(`CommitMe failed to create a git commit: ${detail}`, {
      code: "git-commit-failed",
      result: commitResult,
    });
  }

  const hash = (await runGit(executor, ["rev-parse", "--short", "HEAD"], commonOptions)).stdout.trim();
  return {
    commitHash: hash,
    subject: validation.subject,
    body: validation.body,
    stdout: commitResult.stdout,
    stderr: commitResult.stderr,
  };
}
