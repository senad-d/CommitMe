# Plan: CommitMe Implementation Tasks

## Task Description
Task-focused implementation plan for a later, separate session to build CommitMe from the approved brief, architecture spec, guidelines spec, repository research, and Pi documentation notes.

## Objective
Implement CommitMe one task at a time without ambiguity. All checkboxes are intentionally unchecked during preparation.

## Problem Statement
CommitMe needs to gather local git/project context, construct a compact Conventional Commit prompt, and optionally create commits. The implementation must stay fast, safe, and compatible with weaker/local models.

## Solution Approach
Implement pure helpers first, then Pi command/tool surfaces, then mutation behavior, tests, documentation, and validation.

## Relevant Files

- `src/extension.ts`
- `src/constants.ts`
- `src/types.ts`
- `src/commands/commitme-command.ts`
- `src/tools/commitme-tool.ts`
- `src/git/context.ts`
- `src/git/commit.ts`
- `src/prompt/build-commit-prompt.ts`
- `src/utils/truncation.ts`
- `test/*.test.mjs`
- `README.md`
- `SECURITY.md`
- `docs/STRUCTURE.md`

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom. Do not mark a checkbox complete until its own acceptance criteria are met.

### 1. Establish real feature module skeleton

- [x] Replace preparation placeholders with the final CommitMe module structure and exports.

Create or update the planned modules without adding complex behavior yet. Keep `src/extension.ts` small and limited to registration calls.

#### Acceptance criteria

- `src/extension.ts` exports `commitMeExtension` as the default function.
- `src/extension.ts` only imports registration modules and constants, then calls `register*` functions.
- Planned files exist under `src/commands`, `src/tools`, `src/git`, `src/prompt`, and `src/utils`.
- TypeScript compiles with `npm run typecheck`.

### 2. Define shared domain types and constants

- [x] Add shared types and constants for command options, git context, prompt inputs, truncation metadata, and commit results.

Keep types simple and serializable so they can be stored in tool result `details`.

#### Acceptance criteria

- `src/constants.ts` contains `CommitMe`, `commitme`, `/commitme`-related names, and any default limits.
- `src/types.ts` defines serializable types for context, prompt, commit, and truncation results.
- No module uses ad hoc untyped objects for the main CommitMe data flow.
- Tests or typecheck verify exported types are valid.

### 3. Implement `/commitme` argument parsing

- [x] Implement deterministic parsing for `/commitme`, `/commitme --confirm`, and `/commitme help`.

The parser should be pure and testable. Unknown flags should produce clear feedback.

#### Acceptance criteria

- No flags result in commit-all mode.
- `--confirm` enables confirmation for commit mode.
- `help`, `--help`, and `-h` show usage without git or model work.
- Unknown flags are rejected with a useful message.
- Parser tests cover valid and invalid inputs.

### 4. Implement git repository detection and command wrapper

- [x] Implement safe local git command helpers using `pi.exec("git", args, options)`.

Do not use shell-string interpolation. Return structured errors for non-git repositories and failed git commands.

#### Acceptance criteria

- Helper detects the repository root using git.
- Helper returns a clear non-git error outside repositories.
- Git commands use argument arrays and reasonable timeouts.
- Tests cover successful repo detection and non-repo failure.

### 5. Implement git change context gathering

- [x] Gather branch, status, staged diff summary, unstaged diff summary, changed file names/status, and bounded diff excerpts.

Use both staged and unstaged changes. Keep outputs compact and structured.

#### Acceptance criteria

- Context includes current branch or detached HEAD fallback.
- Context includes `git status --porcelain` information.
- Context includes staged and unstaged diff stats separately.
- Context includes changed files from both staged and unstaged scopes.
- Large diffs are bounded before returning to the caller.
- Tests cover staged-only, unstaged-only, and mixed changes.

### 6. Implement project context selection

- [x] Read relevant project metadata and safe snippets from changed files.

Prioritize files that help explain intent. Avoid sensitive files and generated directories.

#### Acceptance criteria

- Project metadata candidates include `package.json`, `README.md`, and common build/config manifests when present.
- Sensitive files such as `.env` are not read for contents.
- Binary/generated files are skipped or represented only by path/status.
- Context selection is deterministic and fast.
- Tests cover metadata inclusion, generated directory exclusion, and sensitive file filtering.

### 7. Implement truncation utilities

- [x] Add truncation helpers for line and byte limits with explicit metadata.

The agent must be told when output was truncated.

#### Acceptance criteria

- Truncation preserves useful beginning or summary content according to the caller's needs.
- Truncation metadata includes original size, output size, and whether truncation occurred.
- User/model-facing text includes a clear truncation notice when applicable.
- Tests cover line-limit and byte-limit truncation.

### 8. Implement the Conventional Commit prompt builder

- [x] Build a compact deterministic prompt from git context and project context.

Optimize for weaker/local models by using simple sections and a strict output contract.

#### Acceptance criteria

- Prompt asks for exactly one Conventional Commit message.
- Prompt states subject/body rules and common commit types.
- Prompt includes repository summary, change summary, relevant context, and diff excerpts.
- Prompt avoids asking for chain-of-thought.
- Prompt output is deterministic for the same input.
- Tests assert required sections and formatting constraints.

### 9. Implement the `commitme` Pi tool

- [x] Register the `commitme` tool with TypeBox schema, prompt metadata, gather behavior, and structured details.

Use `StringEnum` from `@earendil-works/pi-ai` for action enum fields if actions are represented as strings.

#### Acceptance criteria

- Tool name is exactly `commitme`.
- Tool has a clear label, description, `promptSnippet`, and tool-specific `promptGuidelines` that name `commitme`.
- Tool can gather commit context and return compact model-facing content.
- Tool result `details` contains structured branch/status/files/truncation metadata.
- Tool throws for real execution errors rather than returning fake success.
- Typecheck passes.

### 10. Implement the `/commitme` command flow

- [x] Register `/commitme` so it gathers context, sends a compact prompt to the active Pi LLM provider, and creates a commit.

Tool gather mode remains the read-only path.

#### Acceptance criteria

- `/commitme` is registered with a clear description.
- Running `/commitme` gathers both staged and unstaged context.
- Running `/commitme` runs `git add -A` and `git commit` only after a generated message exists.
- The generated prompt follows the prompt builder output.
- User-visible feedback is concise.
- Manual smoke test confirms the command appears in Pi.

### 11. Implement commit message extraction/validation

- [x] Validate the generated commit message before using it for commit mode.

The validation should accept a Conventional Commit subject with optional body and reject empty or clearly malformed messages.

#### Acceptance criteria

- Empty messages are rejected.
- Subject-only messages are accepted when valid.
- Subject plus body messages are accepted.
- Clearly non-Conventional Commit subjects are rejected or warned according to final UX choice.
- Tests cover valid and invalid messages.

### 12. Implement commit-all behavior

- [x] Implement `/commitme` behavior to stage all changes and create the commit with the generated message.

This task introduces git mutation. Do not push.

#### Acceptance criteria

- `/commitme` runs `git add -A` before `git commit`.
- Commit subject/body are passed safely to git without shell interpolation.
- Successful commits report the commit hash or concise success message.
- Failures return useful errors, including no-changes and git hook failures.
- Tests use a temporary git repository and verify a commit is created.
- No code runs `git push`.

### 13. Implement optional confirmation

- [x] Implement `--confirm` so commit mode asks the user before staging/committing when UI is available.

Default commit mode should not ask unless `--confirm` is set, per approved brief.

#### Acceptance criteria

- `/commitme --confirm` prompts before mutation in UI-capable modes.
- Canceling the confirmation prevents `git add -A` and `git commit`.
- `/commitme` does not prompt by default.
- Non-UI mode behavior is documented and tested or clearly handled.

### 14. Add concise rendering/status polish

- [x] Add minimal user feedback for gather/draft/commit progress without complex custom UI.

Keep the extension fast and unobtrusive.

#### Acceptance criteria

- The extension does not add custom widgets or long-lived status unless useful and documented.
- Notifications/status messages are short and non-sensitive.
- Tool output remains compact in collapsed view.
- No background processes, watchers, sockets, or timers are introduced.

### 15. Add full test coverage for core behavior

- [x] Add tests for pure helpers, git context, prompt building, tool schema expectations, and commit behavior.

Prefer deterministic fixtures and temporary repositories.

#### Acceptance criteria

- Tests cover argument parsing.
- Tests cover truncation.
- Tests cover project context filtering.
- Tests cover prompt shape.
- Tests cover staged/unstaged context gathering.
- Tests cover commit-all success and failure paths.
- `npm run test` passes.

### 16. Update documentation for implemented behavior

- [x] Update README, SECURITY, CHANGELOG, and docs/STRUCTURE after implementation.

Remove preparation-only language once features are implemented.

#### Acceptance criteria

- README documents install/load, `/commitme`, `/commitme --confirm`, and `/commitme help` usage.
- SECURITY documents local git/file reads, commit mutation, no push, no telemetry, and no non-LLM network APIs.
- CHANGELOG has an entry for implemented CommitMe behavior.
- docs/STRUCTURE matches actual files.

### 17. Run validation and isolated smoke test

- [x] Run all agreed validation checks and manually verify isolated Pi loading.

Use isolated loading so other configured extensions do not interfere.

#### Acceptance criteria

- `npm run typecheck` passes.
- `npm run test` passes.
- `npm run check:pack` passes.
- `npm run validate` passes.
- `pi --no-extensions -e .` loads the extension.
- The smoke test confirms `/commitme` and the `commitme` tool are available after implementation.

## Testing Strategy

- Use pure unit tests for parser, prompt, truncation, and filtering.
- Use temporary git repositories for integration behavior.
- Mock Pi command/tool contexts only where needed.
- Avoid real network calls.
- Avoid touching the developer's actual git history during tests.

## Acceptance Criteria

- All tasks above are completed one checkbox at a time in a later implementation session.
- CommitMe creates Conventional Commit messages from both staged and unstaged changes.
- CommitMe stages all changes and commits when `/commitme` is used.
- Commit confirmation happens only when `--confirm` is used.
- The extension remains fast, simple, and safe.

## Validation Commands

- `npm run typecheck` - Type-check TypeScript.
- `npm run test` - Run tests.
- `npm run check:pack` - Check package dry-run contents.
- `npm run validate` - Run all validation checks.
- `pi --no-extensions -e .` - Run isolated manual smoke test.

## Notes

Do not run this task spec through subagents during preparation. Implementation must happen in a new session after preparation is complete.
