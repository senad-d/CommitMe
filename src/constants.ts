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
