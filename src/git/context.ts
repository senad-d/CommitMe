import { createReadStream } from "node:fs";
import { lstat, readFile, readlink, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";

import type {
  ChangedFile,
  CommitMeExecOptions,
  CommitMeExecResult,
  CommitMeExecutor,
  GitChangeScope,
  GitContext,
  GitDiffSummary,
  ProjectContext,
  ProjectContextEntry,
  ProjectContextEntryKind,
  SkippedProjectContextEntry,
} from "../types.ts";
import {
  DEFAULT_DIFF_FILE_LIMIT,
  DEFAULT_DIFF_MAX_BYTES,
  DEFAULT_DIFF_MAX_LINES,
  DEFAULT_GIT_TIMEOUT_MS,
  DEFAULT_PROJECT_CONTEXT_FILE_LIMIT,
  DEFAULT_PROJECT_FILE_MAX_BYTES,
  DEFAULT_PROJECT_FILE_MAX_LINES,
  PROJECT_METADATA_CANDIDATES,
} from "../constants.ts";
import { appendTruncationNotice, truncateText } from "../utils/truncation.ts";

const CONTENT_SENSITIVITY_SCAN_MAX_BYTES = 128_000;
const SECRET_SCAN_CHUNK_BYTES = 64_000;
const SECRET_SCAN_OVERLAP_CHARS = 4_096;
const SECRET_ASSIGNMENT_RE =
  /(?:^|[^A-Za-z0-9])(?:api[_-]?key|access[_-]?key|access[_-]?token|auth[_-]?token|bearer[_-]?token|client[_-]?secret|credential|credentials|id[_-]?token|password|passwd|private[_-]?key|refresh[_-]?token|secret|session[_-]?token|token)\s*[:=]\s*[^\s#]+/i;
const HIGH_CONFIDENCE_SECRET_RE =
  /-----BEGIN [A-Z ]*PRIVATE KEY-----|Authorization:\s*Bearer\s+[A-Za-z0-9._~+/=-]{20,}|\b(?:AKIA|ASIA)[A-Z0-9]{16}\b|\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{20,}\b|\bglpat-[A-Za-z0-9_-]{20,}\b|\bsk-(?:ant-)?[A-Za-z0-9_-]{20,}\b|\bxox[barps]-[A-Za-z0-9-]{20,}\b|\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/gi;
const SECRET_PLACEHOLDER_RE = /fake|dummy|example|placeholder|not[-_]?real|changeme|redacted|xxxx/i;

export class GitCommandError extends Error {
  readonly code: string;
  readonly args: string[];
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;

  constructor(message: string, options: { code: string; args: string[]; result: CommitMeExecResult }) {
    super(message);
    this.name = "GitCommandError";
    this.code = options.code;
    this.args = options.args;
    this.stdout = options.result.stdout;
    this.stderr = options.result.stderr;
    this.exitCode = options.result.code;
  }
}

export interface GitRunOptions extends CommitMeExecOptions {
  allowFailure?: boolean;
}

export interface GatherGitContextOptions extends CommitMeExecOptions {
  diffFileLimit?: number;
  diffMaxLines?: number;
  diffMaxBytes?: number;
  projectContextFileLimit?: number;
  projectFileMaxLines?: number;
  projectFileMaxBytes?: number;
}

export const STATUS_PORCELAIN_ARGS = ["status", "--porcelain=v1", "--branch", "-uall"];
export const STATUS_PORCELAIN_Z_ARGS = ["status", "--porcelain=v1", "-z", "-uall"];

export async function runGit(
  executor: CommitMeExecutor,
  args: string[],
  options: GitRunOptions = {},
): Promise<CommitMeExecResult> {
  const { allowFailure = false, timeout = DEFAULT_GIT_TIMEOUT_MS, ...execOptions } = options;
  const result = await executor.exec("git", args, { ...execOptions, timeout });

  if (!allowFailure && result.code !== 0) {
    throw new GitCommandError(`git ${args.join(" ")} failed: ${result.stderr.trim() || result.stdout.trim()}`.trim(), {
      code: "git-command-failed",
      args,
      result,
    });
  }

  return result;
}

export async function getRepositoryRoot(
  executor: CommitMeExecutor,
  options: CommitMeExecOptions = {},
): Promise<string> {
  const result = await runGit(executor, ["rev-parse", "--show-toplevel"], { ...options, allowFailure: true });

  if (result.code !== 0) {
    throw new GitCommandError("CommitMe must be run inside a git repository.", {
      code: "not-a-git-repository",
      args: ["rev-parse", "--show-toplevel"],
      result,
    });
  }

  return result.stdout.trim();
}

export async function getBranchName(
  executor: CommitMeExecutor,
  options: CommitMeExecOptions = {},
): Promise<{ branch: string; isDetachedHead: boolean }> {
  const branchResult = await runGit(executor, ["branch", "--show-current"], { ...options, allowFailure: true });
  const branch = branchResult.stdout.trim();
  if (branchResult.code === 0 && branch.length > 0) {
    return { branch, isDetachedHead: false };
  }

  const headResult = await runGit(executor, ["rev-parse", "--short", "HEAD"], { ...options, allowFailure: true });
  const head = headResult.stdout.trim();
  return { branch: head.length > 0 ? `HEAD:${head}` : "HEAD", isDetachedHead: true };
}

function isDotEnvVariantPath(path: string): boolean {
  const basename = path.replace(/\\/g, "/").split("/").at(-1)?.toLowerCase() ?? "";
  return basename.startsWith(".env.");
}

export function isKnownSecretPath(path: string): boolean {
  const normalized = path.replace(/\\/g, "/");
  const segments = normalized.split("/").map((segment) => segment.toLowerCase());
  const basename = segments.at(-1) ?? "";
  const parentDirectories = new Set(segments.slice(0, -1));

  if (isDotEnvVariantPath(path)) return false;

  return (
    basename === ".env" ||
    basename === ".envrc" ||
    basename === ".dockercfg" ||
    basename === ".netrc" ||
    basename === ".npmrc" ||
    basename === ".pypirc" ||
    basename === "_netrc" ||
    basename === "id_rsa" ||
    basename === "id_dsa" ||
    basename === "id_ecdsa" ||
    basename === "id_ed25519" ||
    basename === "kubeconfig" ||
    basename.endsWith(".kubeconfig") ||
    (parentDirectories.has(".kube") && basename === "config") ||
    (parentDirectories.has(".docker") && basename === "config.json") ||
    (parentDirectories.has(".aws") && (basename === "credentials" || basename === "config")) ||
    /(^|[._-])(secret|secrets|credential|credentials|private-key|service[._-]?account)([._-]|$)/i.test(basename) ||
    /\.(pem|key|p12|pfx|crt|cer)$/i.test(basename)
  );
}

export function isSensitivePath(path: string): boolean {
  if (isDotEnvVariantPath(path)) return false;
  const basename = path.replace(/\\/g, "/").split("/").at(-1)?.toLowerCase() ?? "";
  return isKnownSecretPath(path) || /(^|[._-])token([._-]|$)/i.test(basename);
}

export function isGeneratedPath(path: string): boolean {
  const normalized = path.replace(/\\/g, "/");
  return /(^|\/)(node_modules|dist|build|coverage|\.git|\.cache|\.local|\.turbo|\.next|vendor)(\/|$)/.test(
    normalized,
  );
}

export function looksBinaryByPath(path: string): boolean {
  return /\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|tgz|xz|7z|tar|mp4|mov|avi|woff2?|ttf|eot|wasm|bin)$/i.test(path);
}

function isBinaryBuffer(buffer: Buffer): boolean {
  return buffer.subarray(0, Math.min(buffer.length, 8_000)).includes(0);
}

export function looksHighConfidenceSecretContent(text: string): boolean {
  for (const match of text.matchAll(HIGH_CONFIDENCE_SECRET_RE)) {
    const value = match[0];
    if (!SECRET_PLACEHOLDER_RE.test(value)) return true;
  }
  return false;
}

export function looksSensitiveContent(text: string): boolean {
  return SECRET_ASSIGNMENT_RE.test(text) || looksHighConfidenceSecretContent(text);
}

function redactSensitiveLines(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => {
      if (!looksSensitiveContent(line)) return line;
      const diffPrefix = /^[+\- ]/.test(line) ? line[0] : "";
      return `${diffPrefix}[redacted sensitive line]`;
    })
    .join("\n");
}

function isInsidePath(root: string, candidate: string): boolean {
  const backToRoot = relative(root, candidate);
  return backToRoot === "" || (!backToRoot.startsWith("..") && !isAbsolute(backToRoot));
}

function resolveRepositoryPath(root: string, relativePath: string): string | undefined {
  if (!relativePath || isAbsolute(relativePath)) return undefined;
  const absolute = resolve(root, relativePath);
  if (!isInsidePath(root, absolute)) return undefined;
  return absolute;
}

function skippedReasonForRepositoryPath(path: string): SkippedProjectContextEntry["reason"] | undefined {
  if (isSensitivePath(path)) return "sensitive";
  if (isGeneratedPath(path)) return "generated";
  if (looksBinaryByPath(path)) return "binary";
  return undefined;
}

async function getReadableRepositoryFile(root: string, path: string): Promise<string | SkippedProjectContextEntry> {
  const repositoryRoot = await realpath(root);
  const absolute = resolveRepositoryPath(repositoryRoot, path);
  if (!absolute) return { path, reason: "outside-repository" };

  const info = await lstat(absolute);
  if (info.isSymbolicLink()) {
    const targetPath = await readlink(absolute);
    const target = resolve(dirname(absolute), targetPath);
    if (!isInsidePath(repositoryRoot, target)) return { path, reason: "outside-repository" };

    const targetRelativePath = relative(repositoryRoot, target).replace(/\\/g, "/");
    const targetSkipReason = skippedReasonForRepositoryPath(targetRelativePath);
    if (targetSkipReason) return { path, reason: targetSkipReason };

    return { path, reason: "symlink" };
  }

  if (!info.isFile()) return { path, reason: "missing" };

  const canonicalFilePath = await realpath(absolute);
  if (!isInsidePath(repositoryRoot, canonicalFilePath)) return { path, reason: "outside-repository" };

  const canonicalRelativePath = relative(repositoryRoot, canonicalFilePath).replace(/\\/g, "/");
  if (canonicalRelativePath !== path.replace(/\\/g, "/")) {
    const canonicalSkipReason = skippedReasonForRepositoryPath(canonicalRelativePath);
    return { path, reason: canonicalSkipReason ?? "symlink" };
  }

  return canonicalFilePath;
}

async function readContextEntry(
  root: string,
  path: string,
  kind: ProjectContextEntryKind,
  options: Required<Pick<GatherGitContextOptions, "projectFileMaxBytes" | "projectFileMaxLines">>,
): Promise<ProjectContextEntry | SkippedProjectContextEntry> {
  const pathSkipReason = skippedReasonForRepositoryPath(path);
  if (pathSkipReason) return { path, reason: pathSkipReason };

  try {
    const resolved = await getReadableRepositoryFile(root, path);
    if (typeof resolved !== "string") return resolved;
    const fileInfo = await stat(resolved);
    if (fileInfo.size > CONTENT_SENSITIVITY_SCAN_MAX_BYTES) return { path, reason: "too-large" };

    const buffer = await readFile(resolved);
    if (isBinaryBuffer(buffer)) return { path, reason: "binary" };

    const content = buffer.toString("utf8");
    if (looksHighConfidenceSecretContent(content)) return { path, reason: "sensitive" };

    const redactedContent = redactSensitiveLines(content);
    const truncated = truncateText(redactedContent, {
      maxBytes: options.projectFileMaxBytes,
      maxLines: options.projectFileMaxLines,
      strategy: "head",
      label: path,
    });
    return {
      path,
      kind,
      content: appendTruncationNotice(truncated),
      truncation: truncated.metadata,
    };
  } catch (error) {
    const code = errorCode(error);
    if (code === "ENOENT") return { path, reason: "missing" };
    if (code === "EACCES" || code === "EPERM") return { path, reason: "unreadable" };
    return { path, reason: "too-large" };
  }
}

function isProjectContextEntry(entry: ProjectContextEntry | SkippedProjectContextEntry): entry is ProjectContextEntry {
  return "content" in entry;
}

function dedupeChangedFileCandidates(files: ChangedFile[]): ChangedFile[] {
  const byPath = new Map<string, ChangedFile>();
  for (const file of files) {
    const existing = byPath.get(file.path);
    if (!existing) {
      byPath.set(file.path, { ...file });
      continue;
    }

    existing.sensitive = existing.sensitive || file.sensitive;
    existing.generated = existing.generated || file.generated;
    existing.binary = existing.binary || file.binary;
    existing.secretContent = existing.secretContent || file.secretContent;
    existing.unreadable = existing.unreadable || file.unreadable;
    const relatedPaths = [...(existing.relatedPaths ?? []), ...(file.relatedPaths ?? [])];
    if (relatedPaths.length > 0) existing.relatedPaths = [...new Set(relatedPaths)];
  }
  return [...byPath.values()];
}

function skippedReasonForChangedFile(file: ChangedFile): SkippedProjectContextEntry["reason"] | undefined {
  if (file.sensitive) return "sensitive";
  if (file.generated) return "generated";
  if (file.binary) return "binary";
  if (file.unreadable) return "unreadable";
  return undefined;
}

function createAbortError(signal: AbortSignal): Error {
  if (signal.reason instanceof Error) return signal.reason;
  const error = new Error("CommitMe secret scan aborted.");
  error.name = "AbortError";
  return error;
}

async function scanFileForHighConfidenceSecret(path: string, signal?: AbortSignal): Promise<boolean> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(createAbortError(signal));
      return;
    }

    const stream = createReadStream(path, { encoding: "utf8", highWaterMark: SECRET_SCAN_CHUNK_BYTES });
    let settled = false;
    let tail = "";

    function cleanup() {
      signal?.removeEventListener("abort", onAbort);
    }

    function resolveOnce(value: boolean) {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
      stream.destroy();
    }

    function rejectOnce(error: unknown) {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
      stream.destroy();
    }

    function onAbort() {
      if (signal) rejectOnce(createAbortError(signal));
    }

    signal?.addEventListener("abort", onAbort, { once: true });
    stream.on("data", (chunk) => {
      const text = `${tail}${chunk}`;
      if (looksHighConfidenceSecretContent(text)) {
        resolveOnce(true);
        return;
      }
      tail = text.slice(-SECRET_SCAN_OVERLAP_CHARS);
    });
    stream.once("end", () => resolveOnce(false));
    stream.once("error", (error) => rejectOnce(error));
  });
}

type ChangedFileContentSafety = "safe" | "secret" | "unreadable";

function errorCode(error: unknown): string {
  return typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
}

async function inspectChangedFileContentSafety(root: string, path: string, signal?: AbortSignal): Promise<ChangedFileContentSafety> {
  try {
    if (signal?.aborted) throw createAbortError(signal);
    const resolved = await getReadableRepositoryFile(root, path);
    if (typeof resolved !== "string") return resolved.reason === "sensitive" ? "secret" : "safe";
    return (await scanFileForHighConfidenceSecret(resolved, signal)) ? "secret" : "safe";
  } catch (error) {
    if (signal?.aborted) throw error;
    const code = errorCode(error);
    if (code === "EACCES" || code === "EPERM") return "unreadable";
    return "safe";
  }
}

async function applyContentSensitivity(root: string, changedFiles: ChangedFile[], signal?: AbortSignal): Promise<ChangedFile[]> {
  const scannedPaths = new Map<string, ChangedFileContentSafety>();
  const output: ChangedFile[] = [];

  for (const file of changedFiles) {
    if (signal?.aborted) throw createAbortError(signal);

    if (isKnownSecretPath(file.path) || file.status.startsWith("D")) {
      output.push(file);
      continue;
    }

    let contentSafety = scannedPaths.get(file.path);
    if (contentSafety === undefined) {
      contentSafety = await inspectChangedFileContentSafety(root, file.path, signal);
      scannedPaths.set(file.path, contentSafety);
    }

    if (contentSafety === "secret") {
      output.push({ ...file, sensitive: true, secretContent: true });
    } else if (contentSafety === "unreadable") {
      output.push({ ...file, unreadable: true });
    } else {
      output.push(file);
    }
  }

  return output;
}

export async function gatherProjectContext(
  root: string,
  changedFiles: ChangedFile[],
  options: Pick<GatherGitContextOptions, "projectContextFileLimit" | "projectFileMaxBytes" | "projectFileMaxLines"> = {},
): Promise<ProjectContext> {
  const resolvedOptions = {
    projectContextFileLimit: options.projectContextFileLimit ?? DEFAULT_PROJECT_CONTEXT_FILE_LIMIT,
    projectFileMaxBytes: options.projectFileMaxBytes ?? DEFAULT_PROJECT_FILE_MAX_BYTES,
    projectFileMaxLines: options.projectFileMaxLines ?? DEFAULT_PROJECT_FILE_MAX_LINES,
  };
  const metadata: ProjectContextEntry[] = [];
  const changedFileSnippets: ProjectContextEntry[] = [];
  const skipped: SkippedProjectContextEntry[] = [];

  const metadataPaths = PROJECT_METADATA_CANDIDATES.slice(0, resolvedOptions.projectContextFileLimit);
  for (const path of metadataPaths) {
    const entry = await readContextEntry(root, path, "metadata", resolvedOptions);
    if (isProjectContextEntry(entry)) metadata.push(entry);
  }

  const metadataSet = new Set(metadata.map((entry) => entry.path));
  const snippetCandidates = dedupeChangedFileCandidates(
    changedFiles
      .filter((file) => file.scope === "staged" || file.scope === "unstaged")
      .filter((file) => !metadataSet.has(file.path))
      .sort((a, b) => a.path.localeCompare(b.path)),
  ).slice(0, resolvedOptions.projectContextFileLimit);

  for (const file of snippetCandidates) {
    const skippedReason = skippedReasonForChangedFile(file);
    if (skippedReason) {
      skipped.push({ path: file.path, reason: skippedReason });
      continue;
    }

    const entry = await readContextEntry(root, file.path, "changed-file-snippet", resolvedOptions);
    if (isProjectContextEntry(entry)) {
      changedFileSnippets.push(entry);
    } else if (entry.reason !== "missing") {
      skipped.push(entry);
    }
  }

  return { root, metadata, changedFileSnippets, skipped };
}

export function parseNameStatusZ(output: string, scope: GitChangeScope): ChangedFile[] {
  const files: ChangedFile[] = [];
  const fields = output.split("\0");

  for (let index = 0; index < fields.length; ) {
    const status = fields[index++];
    if (!status) continue;

    const isRenameOrCopy = /^[RC]/.test(status);
    const firstPath = fields[index++];
    const secondPath = isRenameOrCopy ? fields[index++] : undefined;
    const path = secondPath ?? firstPath;
    if (!path) continue;

    files.push(createChangedFile(path, status, scope, secondPath && firstPath ? [firstPath] : []));
  }

  return files;
}

function createChangedFile(path: string, status: string, scope: GitChangeScope, relatedPaths: string[] = []): ChangedFile {
  const paths = [path, ...relatedPaths];
  return {
    path,
    status,
    scope,
    sensitive: paths.some(isSensitivePath),
    generated: paths.some(isGeneratedPath),
    binary: paths.some(looksBinaryByPath),
    ...(relatedPaths.length > 0 ? { relatedPaths } : {}),
  };
}

export function parseStatusPorcelainZ(output: string): ChangedFile[] {
  const files: ChangedFile[] = [];
  const records = output.split("\0");

  for (let index = 0; index < records.length; ) {
    const record = records[index++];
    if (!record) continue;

    const xy = record.slice(0, 2);
    const path = record.slice(3);
    const hasRenameSource = xy.includes("R") || xy.includes("C");
    const previousPath = hasRenameSource ? records[index++] : undefined;
    if (!path) continue;

    const relatedPaths = previousPath ? [previousPath] : [];
    const indexStatus = xy[0] ?? " ";
    const worktreeStatus = xy[1] ?? " ";
    if (xy === "??") {
      files.push(createChangedFile(path, "??", "unstaged", relatedPaths));
      continue;
    }
    if (indexStatus !== " " && indexStatus !== "?") {
      files.push(createChangedFile(path, indexStatus, "staged", relatedPaths));
    }
    if (worktreeStatus !== " " && worktreeStatus !== "?") {
      files.push(createChangedFile(path, worktreeStatus, "unstaged", relatedPaths));
    }
  }
  return files;
}

function dedupeChangedFiles(files: ChangedFile[]): ChangedFile[] {
  const seen = new Set<string>();
  const output: ChangedFile[] = [];
  for (const file of files) {
    const key = `${file.scope}:${file.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(file);
  }
  return output;
}

function diffArgsForScope(scope: GitChangeScope, extraArgs: string[] = []): string[] {
  const baseArgs = scope === "staged" ? ["diff", "--cached"] : ["diff"];
  return [...baseArgs, "--no-ext-diff", "--no-textconv", ...extraArgs];
}

async function collectDiffSummary(
  executor: CommitMeExecutor,
  scope: GitChangeScope,
  files: ChangedFile[],
  options: Required<Pick<GatherGitContextOptions, "diffFileLimit" | "diffMaxBytes" | "diffMaxLines">> & CommitMeExecOptions,
): Promise<GitDiffSummary> {
  const stat = (await runGit(executor, diffArgsForScope(scope, ["--stat"]), options)).stdout.trim();
  const safePaths: string[] = [];
  const candidates = files
    .filter((file) => file.scope === scope && !file.sensitive && !file.generated && !file.binary && !file.status.startsWith("D"))
    .slice(0, options.diffFileLimit);

  if (options.cwd) {
    for (const file of candidates) {
      const entry = await readContextEntry(options.cwd, file.path, "changed-file-snippet", {
        projectFileMaxBytes: CONTENT_SENSITIVITY_SCAN_MAX_BYTES,
        projectFileMaxLines: Number.MAX_SAFE_INTEGER,
      });
      if (isProjectContextEntry(entry)) safePaths.push(file.path);
    }
  }

  let rawExcerpt = "";
  if (safePaths.length > 0) {
    rawExcerpt = redactSensitiveLines((await runGit(executor, diffArgsForScope(scope, ["--", ...safePaths]), options)).stdout).trim();
  }

  const truncated = truncateText(rawExcerpt, {
    maxLines: options.diffMaxLines,
    maxBytes: options.diffMaxBytes,
    strategy: "head",
    label: `${scope} diff`,
  });

  return {
    scope,
    stat,
    excerpt: appendTruncationNotice(truncated),
    truncation: truncated.metadata,
  };
}

export async function gatherGitContext(
  executor: CommitMeExecutor,
  options: GatherGitContextOptions = {},
): Promise<GitContext> {
  const repositoryRoot = await getRepositoryRoot(executor, options);
  const cwd = repositoryRoot;
  const commonOptions = { ...options, cwd };
  const { branch, isDetachedHead } = await getBranchName(executor, commonOptions);
  const statusPorcelain = (await runGit(executor, STATUS_PORCELAIN_ARGS, commonOptions)).stdout.trim();

  const statusPorcelainZ = (await runGit(executor, STATUS_PORCELAIN_Z_ARGS, commonOptions)).stdout;
  const stagedNameStatusZ = (await runGit(executor, diffArgsForScope("staged", ["--name-status", "-z"]), commonOptions)).stdout;
  const unstagedNameStatusZ = (await runGit(executor, diffArgsForScope("unstaged", ["--name-status", "-z"]), commonOptions)).stdout;
  const changedFiles = await applyContentSensitivity(
    repositoryRoot,
    dedupeChangedFiles([
      ...parseNameStatusZ(stagedNameStatusZ, "staged"),
      ...parseNameStatusZ(unstagedNameStatusZ, "unstaged"),
      ...parseStatusPorcelainZ(statusPorcelainZ),
    ]),
    options.signal,
  );

  const diffOptions = {
    ...commonOptions,
    diffFileLimit: options.diffFileLimit ?? DEFAULT_DIFF_FILE_LIMIT,
    diffMaxBytes: options.diffMaxBytes ?? DEFAULT_DIFF_MAX_BYTES,
    diffMaxLines: options.diffMaxLines ?? DEFAULT_DIFF_MAX_LINES,
  };

  const staged = await collectDiffSummary(executor, "staged", changedFiles, diffOptions);
  const unstaged = await collectDiffSummary(executor, "unstaged", changedFiles, diffOptions);
  const project = await gatherProjectContext(repositoryRoot, changedFiles, options);

  return {
    repositoryRoot,
    branch,
    isDetachedHead,
    statusPorcelain,
    staged,
    unstaged,
    changedFiles,
    project,
    hasChanges: changedFiles.length > 0,
    warnings: [],
  };
}
