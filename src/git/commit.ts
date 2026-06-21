import { DEFAULT_COMMIT_TIMEOUT_MS, CONVENTIONAL_COMMIT_TYPES } from "../constants.ts";
import type {
  ChangedFile,
  CommitMeExecOptions,
  CommitMeExecResult,
  CommitMeExecutor,
  CommitMessageValidationResult,
  CommitResult,
} from "../types.ts";
import { isKnownSecretPath, runGit, STATUS_PORCELAIN_ARGS } from "./context.ts";

const COMMIT_TYPE_PATTERN = CONVENTIONAL_COMMIT_TYPES.join("|");
const CONVENTIONAL_SUBJECT_RE = new RegExp(
  `^(${COMMIT_TYPE_PATTERN})(\\([A-Za-z0-9._\\/-]+\\))?!?: (?<summary>[^\\s].*)$`,
);

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

export function findUnsafeCommitFiles(files: ChangedFile[]): ChangedFile[] {
  const byPath = new Map<string, ChangedFile>();
  for (const file of files) {
    if (isDeletionStatus(file.status)) continue;
    if (!file.secretContent && !isKnownSecretPath(file.path)) continue;
    byPath.set(file.path, file);
  }
  return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
}

export function assertNoUnsafeCommitFiles(files: ChangedFile[]): void {
  const unsafeFiles = findUnsafeCommitFiles(files);
  if (unsafeFiles.length === 0) return;

  const displayedPaths = unsafeFiles.slice(0, 10).map((file) => file.path).join(", ");
  const omittedCount = unsafeFiles.length - 10;
  const suffix = omittedCount > 0 ? `, and ${omittedCount} more` : "";
  throw new CommitMeCommitError(
    `CommitMe refused to create a commit because known secret files or high-confidence secret tokens would be staged: ${displayedPaths}${suffix}. Remove them from the commit or commit them manually if intentional.`,
    { code: "unsafe-sensitive-files" },
  );
}

function stripMarkdownFence(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:\w+)?\s*\n([\s\S]*?)\n```$/);
  return match?.[1]?.trim() ?? trimmed;
}

function stripMatchingQuotes(text: string): string {
  const match = text.match(/^(["'])([\s\S]*)\1$/);
  return match?.[2]?.trim() ?? text;
}

export function extractCommitMessage(raw: string): string {
  let text = stripMarkdownFence(raw).replace(/\r\n/g, "\n").trim();
  text = text.replace(/^commit message:\s*/i, "").trim();
  text = text.replace(/^message:\s*/i, "").trim();
  text = stripMatchingQuotes(text).trim();
  return text;
}

export function validateCommitMessage(raw: string): CommitMessageValidationResult {
  const message = extractCommitMessage(raw);
  if (!message) {
    return { ok: false, error: "Commit message is empty." };
  }

  const lines = message.split("\n");
  const subject = lines[0]?.trim() ?? "";
  const body = lines.slice(1).join("\n").trim();

  if (!subject) {
    return { ok: false, error: "Commit message subject is empty." };
  }

  const subjectMatch = subject.match(CONVENTIONAL_SUBJECT_RE);
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
    message: body ? `${subject}\n\n${body}` : subject,
  };
}

export async function createCommit(executor: CommitMeExecutor, options: CreateCommitOptions): Promise<CommitResult> {
  const validation = validateCommitMessage(options.message);
  if (!validation.ok) {
    throw new CommitMeCommitError(validation.error, { code: "invalid-message" });
  }

  const commonOptions = { cwd: options.cwd, signal: options.signal, timeout: options.timeout ?? DEFAULT_COMMIT_TIMEOUT_MS };
  if (options.expectedStatusPorcelain !== undefined) {
    const currentStatus = (await runGit(executor, STATUS_PORCELAIN_ARGS, commonOptions)).stdout.trim();
    if (currentStatus !== options.expectedStatusPorcelain.trim()) {
      throw new CommitMeCommitError("Git status changed since CommitMe gathered context; rerun CommitMe before committing.", {
        code: "working-tree-changed",
      });
    }
  }

  await runGit(executor, ["add", "-A"], commonOptions);

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
