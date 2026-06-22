export const EXTENSION_DISPLAY_NAME = "CommitMe";
export const COMMITME_COMMAND_NAME = "commitme";
export const COMMITME_TOOL_NAME = "commitme";

export const DEFAULT_GIT_TIMEOUT_MS = 5_000;
export const DEFAULT_COMMIT_TIMEOUT_MS = 15_000;
export const DEFAULT_DIFF_FILE_LIMIT = 24;
export const DEFAULT_DIFF_MAX_LINES = 360;
export const DEFAULT_DIFF_MAX_BYTES = 28_000;
export const DEFAULT_PROJECT_CONTEXT_FILE_LIMIT = 10;
export const DEFAULT_PROJECT_FILE_MAX_LINES = 80;
export const DEFAULT_PROJECT_FILE_MAX_BYTES = 8_000;
export const DEFAULT_PROMPT_MAX_BYTES = 48_000;
export const COMPACT_PROMPT_MAX_BYTES = 28_000;
export const LARGE_PROMPT_MAX_BYTES = 56_000;
export const DEFAULT_PROMPT_MAX_LINES = 1_200;
export const COMPACT_PROMPT_MAX_LINES = 900;
export const LARGE_PROMPT_MAX_LINES = 1_500;
export const DEFAULT_STEERING_PROMPT_MAX_LINES = 80;
export const DEFAULT_STEERING_PROMPT_MAX_BYTES = 4_000;
export const DEFAULT_DRAFT_MAX_TOKENS = 1_024;
export const DEFAULT_DRAFT_RETRY_MAX_TOKENS = 1_536;
export const DRAFT_REPAIR_MAX_TOKENS = 1_024;
export const DRAFT_RETRY_MAX_ATTEMPTS = 1;

export const COMMIT_PROMPT_SECTION_BUDGETS = {
  compact: {
    steeringPrompt: { maxBytes: 1_500, maxLines: 30 },
    repositorySummary: { maxBytes: 1_500, maxLines: 40 },
    changedFiles: { maxBytes: 3_000, maxLines: 90 },
    diffStats: { maxBytes: 2_000, maxLines: 70 },
    changedFileSnippets: { maxBytes: 4_500, maxLines: 150 },
    diffExcerpts: { maxBytes: 5_500, maxLines: 190 },
    omittedContext: { maxBytes: 1_500, maxLines: 50 },
    projectMetadata: { maxBytes: 1_500, maxLines: 60 },
  },
  default: {
    steeringPrompt: { maxBytes: 2_500, maxLines: 50 },
    repositorySummary: { maxBytes: 2_000, maxLines: 50 },
    changedFiles: { maxBytes: 5_000, maxLines: 150 },
    diffStats: { maxBytes: 3_500, maxLines: 110 },
    changedFileSnippets: { maxBytes: 9_000, maxLines: 280 },
    diffExcerpts: { maxBytes: 12_000, maxLines: 380 },
    omittedContext: { maxBytes: 2_500, maxLines: 80 },
    projectMetadata: { maxBytes: 3_000, maxLines: 100 },
  },
  large: {
    steeringPrompt: { maxBytes: 3_000, maxLines: 60 },
    repositorySummary: { maxBytes: 2_500, maxLines: 60 },
    changedFiles: { maxBytes: 6_000, maxLines: 180 },
    diffStats: { maxBytes: 4_000, maxLines: 130 },
    changedFileSnippets: { maxBytes: 12_000, maxLines: 360 },
    diffExcerpts: { maxBytes: 16_000, maxLines: 480 },
    omittedContext: { maxBytes: 3_000, maxLines: 100 },
    projectMetadata: { maxBytes: 4_000, maxLines: 130 },
  },
} as const;

export const CONVENTIONAL_COMMIT_TYPES = [
  "feat",
  "fix",
  "refactor",
  "docs",
  "test",
  "chore",
  "build",
  "ci",
  "perf",
  "style",
  "revert",
] as const;

export const CONVENTIONAL_COMMIT_TYPE_DESCRIPTIONS = {
  feat: "new feature",
  fix: "bug fix",
  refactor: "code change without behavior change",
  docs: "documentation only",
  test: "tests only",
  chore: "maintenance",
  build: "build system or dependency changes",
  ci: "CI/CD changes",
  perf: "performance improvement",
  style: "formatting only",
  revert: "revert a previous commit",
} as const satisfies Record<(typeof CONVENTIONAL_COMMIT_TYPES)[number], string>;

export const PROJECT_METADATA_CANDIDATES = [
  "package.json",
  "README.md",
  "CHANGELOG.md",
  "pyproject.toml",
  "Cargo.toml",
  "go.mod",
  "pom.xml",
  "build.gradle",
  "deno.json",
  "tsconfig.json",
  "AGENTS.md",
  "CLAUDE.md",
] as const;
