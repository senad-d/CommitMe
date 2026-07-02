# Plan: Remediate Current SonarQube Issues

## Task Description
Create an implementation plan for resolving every active Sonar issue currently reported for the `senad-d_CommitMe` SonarCloud project.

This plan intentionally targets the repository-local Sonar project from `sonar-project.properties`:

- Project key: `senad-d_CommitMe`
- Organization: `senad-d`
- Active issues retrieved: 20
- Issue types retrieved: 20 code smells, 0 bugs, 0 vulnerabilities
- Security hotspots: 0
- Quality gate: `ERROR`

Note: the AnalyseMe default environment initially resolved `SONARQUBE_PROJECT_KEY` to another project. Always pass `projectKey: "senad-d_CommitMe"` and `organization: "senad-d"` when validating this work.

## Objective
Remove all 20 active Sonar code-smell issues without changing user-facing CommitMe behavior, and add/confirm tests so regex cleanup and display-path escaping remain stable.

## Problem Statement
The current Sonar report is concentrated in three files:

- Regex constants are built with `RegExp` constructors even though Sonar expects regex literals for static patterns.
- One bearer-token character class is flagged for duplicate/ambiguous character-class contents.
- Display-path escape strings use double-escaped string literals where Sonar expects `String.raw` for readability.

## Solution Approach
Make focused, behavior-preserving refactors in the files reported by Sonar:

1. Convert static regular expressions to regex literals while preserving flags, capture groups, named groups, and matching behavior.
2. Normalize the bearer-token character class to avoid ambiguous ranges or duplicate class members.
3. Use `String.raw` for returned display escape sequences.
4. Run the existing validation suite and a fresh Sonar scan to verify the active issue count is zero.

Keep helpers top-level and avoid nesting functions.

## Sonar Issue Inventory

| File | Issue IDs | Rules | Summary |
| --- | --- | --- | --- |
| `src/git/commit.ts` | `AZ8iDW6YQNFxXeYuMUdV`, `AZ8iDW6YQNFxXeYuMUdW`, `AZ8iDW6YQNFxXeYuMUdX`, `AZ8iDW6YQNFxXeYuMUdY`, `AZ8iDW6YQNFxXeYuMUdZ` | `typescript:S6325` | Replace static `RegExp` constructors with regex literals. |
| `src/git/context.ts` | `AZ8iDW4HQNFxXeYuMUdK`, `AZ8iDW4HQNFxXeYuMUdL`, `AZ8iDW4HQNFxXeYuMUdM`, `AZ8iDW4HQNFxXeYuMUdN`, `AZ8iDW4HQNFxXeYuMUdO`, `AZ8iDW4HQNFxXeYuMUdP`, `AZ8iDW4HQNFxXeYuMUdQ`, `AZ8iDW4HQNFxXeYuMUdR`, `AZ8iDW4HQNFxXeYuMUdS`, `AZ8iDW4HQNFxXeYuMUdT`, `AZ8iDW4HQNFxXeYuMUdU` | `typescript:S6325`, `typescript:S7780`, `typescript:S5869` | Replace high-confidence secret regex constructors, remove unnecessary `String.raw`, and fix duplicate/ambiguous character class. |
| `src/utils/display-path.ts` | `AZ8iDW6pQNFxXeYuMUda`, `AZ8iDW6pQNFxXeYuMUdb`, `AZ8iDW6pQNFxXeYuMUdc`, `AZ8iDW6pQNFxXeYuMUdd` | `typescript:S7780` | Use `String.raw` for escaped control-character display strings. |

## Relevant Files
Use these files to complete the task:

- `src/git/commit.ts` - Commit-message extraction and validation regex constants reported by Sonar.
- `src/git/context.ts` - High-confidence secret scanner regex constants reported by Sonar.
- `src/utils/display-path.ts` - Control-character escaping reported by Sonar.
- `test/commit.test.mjs` - Regression coverage for commit-message extraction and unsafe-file display behavior.
- `test/context.test.mjs` - Regression coverage for high-confidence secret detection and sensitive-content handling.
- `test/prompt.test.mjs` - Existing coverage for escaped paths in generated prompts.
- `sonar-project.properties` - Confirms the correct Sonar project key and source/test scope.

## Implementation Phases

### Phase 1: Baseline and focused refactor
- Confirm the correct Sonar project key is `senad-d_CommitMe`.
- Refactor `src/git/commit.ts` regex constructors.
- Refactor `src/git/context.ts` high-confidence secret regex constructors and bearer-token class.

### Phase 2: Display escaping and regression tests
- Refactor `src/utils/display-path.ts` escaping to use `String.raw`.
- Add or update focused regression tests only where existing assertions do not already cover the behavior.

### Phase 3: Validation and Sonar verification
- Run local validation.
- Run a fresh Sonar scan.
- Re-read Sonar issues for `senad-d_CommitMe` and verify all 20 issue IDs are resolved.

## Step by Step Tasks
IMPORTANT: Complete one unchecked task at a time, top to bottom. Mark a task with `x` only after its acceptance criteria are met.

### [x] 1. Confirm Sonar baseline and correct project scope
- Use `sonar-project.properties` as the source of truth for this repository: `senad-d_CommitMe` / `senad-d`.
- Record the starting active issue count: 20 active issues, all `CODE_SMELL`.
- Do not use the default AnalyseMe project key if it resolves to another repository.

Implementation notes:
- Confirmed `sonar-project.properties` sets `sonar.projectKey=senad-d_CommitMe` and `sonar.organization=senad-d`.
- Queried AnalyseMe with explicit `projectKey: "senad-d_CommitMe"` and `organization: "senad-d"`; baseline active issues are 20, all `CODE_SMELL`.
- Active issue IDs before fixes (20): `AZ8iDW6YQNFxXeYuMUdV`, `AZ8iDW6YQNFxXeYuMUdW`, `AZ8iDW6YQNFxXeYuMUdX`, `AZ8iDW6YQNFxXeYuMUdY`, `AZ8iDW6YQNFxXeYuMUdZ`, `AZ8iDW4HQNFxXeYuMUdK`, `AZ8iDW4HQNFxXeYuMUdL`, `AZ8iDW4HQNFxXeYuMUdM`, `AZ8iDW4HQNFxXeYuMUdN`, `AZ8iDW4HQNFxXeYuMUdO`, `AZ8iDW4HQNFxXeYuMUdP`, `AZ8iDW4HQNFxXeYuMUdQ`, `AZ8iDW4HQNFxXeYuMUdR`, `AZ8iDW4HQNFxXeYuMUdS`, `AZ8iDW4HQNFxXeYuMUdT`, `AZ8iDW4HQNFxXeYuMUdU`, `AZ8iDW6pQNFxXeYuMUda`, `AZ8iDW6pQNFxXeYuMUdb`, `AZ8iDW6pQNFxXeYuMUdc`, `AZ8iDW6pQNFxXeYuMUdd`.
- Confirmed project metrics report 20 code smells, 0 bugs, 0 vulnerabilities, 0 security hotspots, and quality gate `ERROR`.

Acceptance criteria:
- The baseline references `senad-d_CommitMe`, not any other Sonar project.
- The implementation notes list 20 active issues before fixes.
- No source files are changed in this task.

### [x] 2. Replace commit-message regex constructors in `src/git/commit.ts`
- Replace these `RegExp` constructor constants with regex literals:
  - `CONVENTIONAL_SUBJECT_RE`
  - `MATCHING_QUOTES_RE`
  - `SIMPLE_PREFIX_RE`
  - `HERE_IS_PREFIX_RE`
  - `LIST_BULLET_RE`
  - `LIST_NUMBER_RE`
- Preserve existing behavior for:
  - Lightweight Conventional Commit validation.
  - Optional scope and breaking-change marker matching.
  - The named `summary` capture group.
  - Markdown fence stripping.
  - Simple prefix stripping.
  - List marker stripping.
- If the conventional commit type list must be duplicated in a regex literal, add or update a regression assertion that every `CONVENTIONAL_COMMIT_TYPES` entry still validates.

Implementation notes:
- Replaced all `RegExp` constructor constants in `src/git/commit.ts` with regex literals and removed the dynamic `COMMIT_TYPE_PATTERN` helper.
- Preserved case-insensitive flags on prefix stripping patterns and kept the named `summary` capture group in `CONVENTIONAL_SUBJECT_RE`.
- Added a regression test that every `CONVENTIONAL_COMMIT_TYPES` entry validates with the duplicated literal type list.
- Focused static check `rg "new RegExp|String\\.raw|COMMIT_TYPE_PATTERN" src/git/commit.ts test/commit.test.mjs` returned no matches; final Sonar issue closure remains covered by task 6 re-analysis.

Acceptance criteria:
- Sonar issues `AZ8iDW6YQNFxXeYuMUdV` through `AZ8iDW6YQNFxXeYuMUdZ` no longer appear after re-analysis.
- `npm run test -- commit.test.mjs` passes, or the equivalent targeted Node test command passes.
- Existing valid and invalid commit-message tests keep the same expected results.

### [x] 3. Replace secret-scanner regex constructors in `src/git/context.ts`
- Replace every static regex in `HIGH_CONFIDENCE_SECRET_PATTERNS` with a regex literal.
- Preserve the existing flags exactly:
  - Global matching stays global.
  - Bearer-token matching stays global and case-insensitive.
- Remove unnecessary `String.raw` usage for patterns that become regex literals.
- Rewrite the bearer-token allowed-character class so the hyphen is unambiguous, for example by placing it first or escaping it.
- Ensure each pattern still detects the same high-confidence token families: private keys, bearer tokens, AWS keys, GitHub tokens, GitHub fine-grained tokens, GitLab tokens, OpenAI/Anthropic-style keys, Slack tokens, and JWTs.

Implementation notes:
- Converted every `HIGH_CONFIDENCE_SECRET_PATTERNS` entry in `src/git/context.ts` from `new RegExp(String.raw...)` to a regex literal.
- Preserved global flags for all patterns and preserved `gi` for bearer-token matching.
- Moved the bearer-token hyphen to the front of the allowed-character class: `[-A-Za-z0-9._~+/=]`.
- Expanded `looksHighConfidenceSecretContent` regression samples to cover bearer tokens, GitHub fine-grained tokens, and Anthropic-style `sk-ant-` tokens in addition to existing token families.
- Focused static check `rg "new RegExp|String\\.raw" src/git/context.ts` returned no matches; final Sonar issue closure remains covered by task 6 re-analysis.

Acceptance criteria:
- Sonar issues `AZ8iDW4HQNFxXeYuMUdK` through `AZ8iDW4HQNFxXeYuMUdU` no longer appear after re-analysis.
- `npm run test -- context.test.mjs` passes, or the equivalent targeted Node test command passes.
- Existing secret redaction and unsafe commit protections still pass for generated, binary-looking, renamed, oversized, and symlinked files.

### [x] 4. Use `String.raw` in `src/utils/display-path.ts`
- Replace returned escaped string literals with `String.raw` equivalents:
  - carriage return display: `\r`
  - newline display: `\n`
  - tab display: `\t`
  - generic control character display: `\xNN`
- Preserve the exact output of `formatDisplayPath` for printable characters, control characters, and DEL.
- Keep the implementation simple and top-level; do not introduce nested helper functions.

Implementation notes:
- Replaced display escape return values in `src/utils/display-path.ts` with `String.raw` for `\r`, `\n`, `\t`, and generic `\xNN` control-character output.
- Added `test/display-path.test.mjs` with a direct assertion for `formatDisplayPath("a\rb\nc\td\x7f")` returning `String.raw` escaped display output.
- Existing prompt and commit escaped-path tests passed with the new display-path assertion; final Sonar issue closure remains covered by task 6 re-analysis.

Acceptance criteria:
- Sonar issues `AZ8iDW6pQNFxXeYuMUda` through `AZ8iDW6pQNFxXeYuMUdd` no longer appear after re-analysis.
- Existing prompt and commit tests that assert escaped paths still pass.
- Add or update a direct assertion for `formatDisplayPath("a\rb\nc\td\x7f")` if no direct test already exists.

### [x] 5. Run local validation and fix regressions
- Run the targeted tests for changed areas first.
- Run the full project validation after targeted tests pass.
- Fix any TypeScript, format, or test failures caused by the refactor.

Implementation notes:
- Targeted changed-area tests passed: `node --test test/commit.test.mjs test/context.test.mjs test/display-path.test.mjs test/prompt.test.mjs` (78/78).
- `npm run typecheck` passed.
- `npm run test` passed (149/149).
- `npm run format:check` passed.
- `npm run validate` passed, including lint, format check, full tests, and package contents check.
- No regressions required additional fixes during this task.

Acceptance criteria:
- `npm run typecheck` passes.
- `npm run test` passes.
- `npm run format:check` passes.
- `npm run validate` passes.

### [ ] 6. Run Sonar re-analysis and verify issue closure
- Run the repository Sonar scan using `sonar-project.properties` and an environment-provided token.
- Re-query active Sonar issues for `projectKey: "senad-d_CommitMe"`, `organization: "senad-d"`.
- Verify the active issue count drops from 20 to 0, or document any remaining issue IDs with their current messages.
- If the quality gate remains `ERROR` only because coverage is `0.0`, create a separate follow-up coverage task/spec instead of mixing it into this Sonar issue cleanup.

Acceptance criteria:
- Active Sonar issues for `senad-d_CommitMe` are zero.
- No bugs, vulnerabilities, or security hotspots were introduced.
- Any remaining quality-gate failure reason is recorded separately.

## Testing Strategy
- Prefer behavior-preserving tests over snapshot-heavy tests.
- Use existing `commit.test.mjs`, `context.test.mjs`, and `prompt.test.mjs` coverage where possible.
- Add focused assertions only for behavior not already covered:
  - Each conventional commit type validates if `CONVENTIONAL_SUBJECT_RE` is inlined.
  - Display-path escape strings remain exactly `\r`, `\n`, `\t`, and `\x7f`.
  - Bearer-token detection still works after character-class cleanup if current tests do not cover it.

## Acceptance Criteria
- All 20 active Sonar issues listed in this spec are resolved.
- No CommitMe behavior changes beyond code readability and Sonar compliance.
- Local validation passes.
- A fresh Sonar analysis for `senad-d_CommitMe` reports zero active issues.
- Any non-issue quality-gate failures, such as coverage, are tracked separately.

## Validation Commands
Execute these commands to validate the work locally:

- `npm run typecheck` - TypeScript compile check.
- `npm run test` - Full Node test suite.
- `npm run format:check` - Formatting policy check.
- `npm run validate` - Full repository validation pipeline.

Execute Sonar validation with the repository project key:

- `sonar-scanner -Dsonar.projectKey=senad-d_CommitMe -Dsonar.organization=senad-d` - Run a fresh Sonar analysis using an environment-provided token.
- AnalyseMe check: call `analyseme_list_issues` with `projectKey: "senad-d_CommitMe"`, `organization: "senad-d"`, `limit: 100`, `page: 1` and verify total active issues is `0`.

## Notes
- Do not include or print Sonar tokens, environment secrets, or `.env` contents.
- The Sonar issue set was collected on 2026-07-02.
- The current quality gate is `ERROR`; active code-smell remediation may not fix coverage-related gate conditions.
