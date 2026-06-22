import type { CONVENTIONAL_COMMIT_TYPES } from "./constants.ts";

export type ConventionalCommitType = (typeof CONVENTIONAL_COMMIT_TYPES)[number];
export type CommitMeMode = "commit" | "help";
export type GitChangeScope = "staged" | "unstaged";
export type TruncationStrategy = "head" | "tail";
export type ProjectContextEntryKind = "metadata" | "changed-file-snippet";
export type SkippedContextReason =
  | "sensitive"
  | "generated"
  | "binary"
  | "missing"
  | "too-large"
  | "unreadable"
  | "outside-repository";

export interface CommitMeCommandOptions {
  mode: CommitMeMode;
  confirm: boolean;
  rawArgs: string;
  steeringPrompt?: string;
}

export type CommitMeParseResult =
  | { ok: true; options: CommitMeCommandOptions }
  | { ok: false; error: string; unknownFlags: string[] };

export interface CommitMeExecOptions {
  cwd?: string;
  timeout?: number;
  signal?: AbortSignal;
}

export interface CommitMeExecResult {
  stdout: string;
  stderr: string;
  code: number;
  killed: boolean;
}

export interface CommitMeExecutor {
  exec(command: string, args: string[], options?: CommitMeExecOptions): Promise<CommitMeExecResult>;
}

export interface TruncationMetadata {
  truncated: boolean;
  strategy: TruncationStrategy;
  originalBytes: number;
  outputBytes: number;
  originalLines: number;
  outputLines: number;
  label?: string;
}

export interface TruncatedText {
  text: string;
  metadata: TruncationMetadata;
  notice?: string;
}

export interface PromptSectionBudget {
  maxBytes: number;
  maxLines: number;
}

export interface CommitPromptBudget {
  profile: "compact" | "default" | "large";
  maxBytes: number;
  maxLines: number;
  sections: Record<
    | "steeringPrompt"
    | "repositorySummary"
    | "changedFiles"
    | "diffStats"
    | "changedFileSnippets"
    | "diffExcerpts"
    | "omittedContext"
    | "projectMetadata",
    PromptSectionBudget
  >;
}

export interface CommitPromptDiagnostics {
  budgetProfile: CommitPromptBudget["profile"];
  maxBytes: number;
  maxLines: number;
  systemPromptBytes: number;
  userPromptBytes: number;
  textBytes: number;
  truncationCount: number;
}

export interface CommitPromptPayload {
  systemPrompt: string;
  userPrompt: string;
  summaryPrompt: string;
  text: string;
  truncation: TruncationMetadata[];
  diagnostics: CommitPromptDiagnostics;
}

export interface DraftUsageDiagnostics {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  totalTokens?: number;
}

export interface DraftResponseDiagnostics {
  stopReason?: string;
  contentTypeCounts: Record<string, number>;
  contentTypes: string[];
  textCharacterCount: number;
  usableTextCharacterCount: number;
  empty: boolean;
  thinkingOnly: boolean;
  lengthStopped: boolean;
  usage?: DraftUsageDiagnostics;
}

export interface DraftAttemptDiagnostics {
  attempt: number;
  purpose: "draft" | "retry" | "repair";
  maxTokens: number;
  response?: DraftResponseDiagnostics;
  validationError?: string;
}

export interface ChangedFile {
  path: string;
  status: string;
  scope: GitChangeScope;
  sensitive: boolean;
  generated: boolean;
  binary: boolean;
  secretContent?: boolean;
}

export interface GitDiffSummary {
  scope: GitChangeScope;
  stat: string;
  excerpt: string;
  truncation: TruncationMetadata;
}

export interface ProjectContextEntry {
  path: string;
  kind: ProjectContextEntryKind;
  content: string;
  truncation: TruncationMetadata;
}

export interface SkippedProjectContextEntry {
  path: string;
  reason: SkippedContextReason;
}

export interface ProjectContext {
  root: string;
  metadata: ProjectContextEntry[];
  changedFileSnippets: ProjectContextEntry[];
  skipped: SkippedProjectContextEntry[];
}

export interface GitContext {
  repositoryRoot: string;
  branch: string;
  isDetachedHead: boolean;
  statusPorcelain: string;
  staged: GitDiffSummary;
  unstaged: GitDiffSummary;
  changedFiles: ChangedFile[];
  project: ProjectContext;
  hasChanges: boolean;
  warnings: string[];
}

export interface CommitMessageValidationOk {
  ok: true;
  subject: string;
  body: string;
  message: string;
}

export type CommitMessageValidationResult =
  | CommitMessageValidationOk
  | { ok: false; error: string };

export interface CommitResult {
  commitHash: string;
  subject: string;
  body: string;
  stdout: string;
  stderr: string;
}

export interface CommitMeToolDetails {
  action: "gather" | "commit" | "help";
  steeringPrompt?: string;
  repositoryRoot?: string;
  branch?: string;
  statusPorcelain?: string;
  hasChanges?: boolean;
  changedFiles?: ChangedFile[];
  truncation?: TruncationMetadata[];
  prompt?: CommitPromptDiagnostics;
  draft?: DraftAttemptDiagnostics[];
  warnings?: string[];
  committed?: CommitResult;
}
