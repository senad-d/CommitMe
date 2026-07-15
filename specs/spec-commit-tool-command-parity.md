# Plan: Add `/commitme` Command Parity to the Existing `commitme` Tool

## Task Description
Enhance the existing Pi tool named `commitme` so its `action: "commit"` mode can use the same draft-and-commit logic as the `/commitme` slash command when no explicit `message` is provided.

The existing `commitme` tool stays the only CommitMe tool:

- `action: "gather"` remains the read-only context-gathering path.
- `action: "commit"` with `message` keeps the current explicit-final-subject commit path.
- `action: "commit"` without `message` becomes the one-shot `/commitme` parity path: gather context, draft with the active Pi model, validate, optionally confirm, stage gathered changed paths, and create a local commit.

## Objective
Expose `/commitme` command behavior to agent workflows without adding a second generic tool name. The agent should use `commitme` for both read-only commit-message context and local commit creation, while preserving backwards-compatible explicit-message commits.

## Problem Statement
Currently, `/commitme` can draft and commit end-to-end, but the `commitme` tool can only gather context or commit with a preselected final `message`. When a user asks the agent to commit current changes, the agent must either ask the user to run `/commitme` or perform a multi-step gather/draft/commit flow. Enhancing `commitme action="commit"` to draft when `message` is omitted gives agents one CommitMe tool with command parity.

## Solution Approach
Refactor the existing `/commitme` command orchestration into a shared draft-and-commit workflow, then call that workflow from both the command and `commitme action="commit"` when `message` is absent.

The updated `commitme` tool should:

- Remain named exactly `commitme`; do not add a separate `commit` tool.
- Keep `action` values as `"gather"` and `"commit"`.
- Decision: keep omitted `action` defaulting to `"gather"` for read-only safety and backwards compatibility.
- Treat `action: "commit", message: "..."` as the existing explicit-message commit path.
- Treat `action: "commit"` without `message` as the one-shot draft-and-commit path equivalent to `/commitme`.
- Decision: only an omitted/undefined `message` selects message-less drafting; an empty or whitespace-only `message` remains an invalid explicit-message commit request.
- Decision: message-less commit mode requires an active Pi model/API key and fails before staging/committing if drafting cannot run; explicit-message commit mode continues to work without a model.
- Accept optional `steeringPrompt` for gather prompts and draft-and-commit prompts.
- Accept optional `confirm`; default is no confirmation, matching `/commitme`; `confirm: true` is opt-in.
- Decision: when `confirm: true` is used for message-less commit mode, confirm after model drafting and validation so the dialog shows the exact subject that would be committed.
- Use the active Pi model to draft the final subject for message-less commit mode, including existing retry/repair behavior.
- Reuse existing context gathering, prompt budgeting, sensitive-file refusal, message validation, status-change checks, and commit execution.
- Decision: message-less commit mode returns only final outcome content, not the full draft prompt; prompt diagnostics/truncation and safe draft attempt diagnostics belong in structured `details`.
- Run with `executionMode: "sequential"`.
- Return `terminate: true` for committed, cancelled, and no-changes outcomes in the draft-and-commit path.
- Do not return `terminate: true` for thrown-error outcomes.
- Never push.

Do not implement command parity by queuing `/commitme` through `pi.sendUserMessage()`. The tool should return its own result and errors directly.

## Relevant Files
Use these files to complete the task:

- `src/extension.ts` - Continue registering the existing command and `commitme` tool only.
- `src/constants.ts` - Keep `COMMITME_TOOL_NAME = "commitme"`; no `COMMIT_TOOL_NAME` is needed.
- `src/commands/commitme-command.ts` - Keep argument parsing/help here, but move reusable draft-and-commit logic out of the command handler.
- `src/tools/commitme-tool.ts` - Update schema descriptions, prompt metadata, and `action: "commit"` behavior.
- `src/git/context.ts` - Existing git/project context gathering used by command and tool.
- `src/git/commit.ts` - Existing validation, unsafe-file checks, status-change checks, staging, and commit creation.
- `src/model/draft-commit-message.ts` - Active-model drafting should be usable from both command and tool contexts.
- `src/prompt/build-commit-prompt.ts` - Existing bounded prompt builder reused by the tool.
- `src/commitme-details.ts` - Existing structured details helper reused for tool results and command messages.
- `src/types.ts` - Add or adjust shared workflow/result types as needed.
- `test/command.test.mjs` - Ensure command behavior remains unchanged after refactor.
- `test/tool.test.mjs` - Add coverage for message-less `commitme action="commit"` and keep existing gather/explicit-message tests.
- `test/package.test.mjs` - Ensure extension still registers command and `commitme` tool only.
- `README.md`, `SECURITY.md`, `docs/STRUCTURE.md`, `CHANGELOG.md` - Document the enhanced `commitme` tool.

### New Files

- `src/workflows/commitme-commit-flow.ts` - Shared draft-and-commit orchestration used by `/commitme` and message-less `commitme action="commit"`; accepts injectable drafting for deterministic tests.
- `test/commit-flow.test.mjs` - Optional focused tests for shared workflow edge cases if `test/tool.test.mjs` becomes too broad.

## Implementation Phases

### Phase 1: Shared workflow foundation
- Extract the common `/commitme` draft-and-commit path into a reusable function.
- Broaden drafting context types so active-model drafting works from both `ExtensionCommandContext` and regular tool `ExtensionContext`.
- Make the shared workflow accept a `draftCommitMessage` dependency so command, tool, and tests can use the same path without real network/model calls.
- Preserve command-specific help, argument parsing, idle waiting, notifications, and `pi.sendMessage()` behavior outside the shared workflow.
- Existing `/commitme` user-facing behavior should stay unchanged; structured details may gain safe draft diagnostics if the shared workflow naturally provides them.

### Phase 2: `commitme` tool enhancement
- Update `src/tools/commitme-tool.ts` parameters and descriptions to clarify `message` is optional for `action: "commit"`.
- Keep `executionMode: "sequential"`.
- Call the shared workflow when `action === "commit"` and `message` is omitted.
- Keep the existing explicit-message commit implementation when `message` is provided, or route it through a shared helper without changing behavior.
- Decision: return `terminate: true` only for the new message-less draft-and-commit path; do not change explicit-message commit loop behavior in this feature.
- Map workflow outcomes to concise tool content and structured details, with `terminate: true` on non-error draft-and-commit outcomes.

### Phase 3: Tests, docs, and polish
- Add temporary-git-repo tests for draft-and-commit success, confirmation, cancellation, no changes, unsafe files, invalid drafts, and status-change protection.
- Update documentation and security notes.
- Run full validation.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### 1. Confirm the `commitme` tool contract
- Do not create `src/tools/commit-tool.ts`.
- Do not register a tool named `commit`.
- Keep `CommitMeToolParameters.action` as `"gather" | "commit"`.
- Keep omitted `action` defaulting to `"gather"`; this is an explicit compatibility decision.
- Keep `message?: string`, but update its description:
  - When present with `action: "commit"`, use it as the final one-line Lightweight Conventional Commit subject.
  - When omitted with `action: "commit"`, draft the subject using `/commitme` command logic.
  - Empty or whitespace-only `message` values count as invalid explicit-message requests, not as omitted messages.
- Keep `steeringPrompt?: string` for gather and message-less commit drafting.
- Decision: if `steeringPrompt` is provided with explicit-message commit mode, accept it but ignore it for behavior because `message` is already the final subject.
- Keep `confirm?: boolean`, defaulting to `false`.
- Do not add a required explicit-intent boolean such as `userRequestedCommit`; rely on prompt guidelines and normal tool-use judgment.

### 2. Extract shared draft-and-commit workflow
- Create `src/workflows/commitme-commit-flow.ts`.
- Move the reusable command sequence into a function such as `draftAndCreateCommit(...)`:
  - gather git context
  - return or signal no changes before drafting
  - assert no unsafe commit files before drafting
  - build bounded prompt with optional steering
  - draft with the active model
  - validate/normalize the subject
  - optionally call a supplied confirmation callback after validation, passing the exact subject that would be committed
  - create the commit with `expectedStatusPorcelain`
  - return structured result data and details inputs
- Keep UI-specific side effects out of this workflow.
- Accept a `draftCommitMessage` dependency, defaulting to `draftCommitMessageWithActiveModel`, so tests can inject deterministic drafts.
- Preserve safe draft attempt diagnostics in `details.draft` when available. Diagnostics must remain non-sensitive: no raw prompts, raw diffs, file contents, secrets, or raw model output.
- If a caller injects the existing string-returning draft function, wrap the result with empty `attempts` rather than changing the public injection contract.
- Use the tool execution `signal` for all nested git and model work when called from the tool.

Suggested result shape:

```ts
export type CommitMeCommitFlowResult =
  | { status: "committed"; context: GitContext; prompt: CommitPromptPayload; subject: string; committed: CommitResult; details: CommitMeToolDetails }
  | { status: "cancelled"; context: GitContext; prompt: CommitPromptPayload; subject: string; details: CommitMeToolDetails }
  | { status: "no-changes"; context: GitContext; details: CommitMeToolDetails };
```

For commit attempts, `details.action` should be `"commit"` even when the outcome is cancelled or no-changes.

### 3. Make model drafting context reusable by tools
- Update `DraftCommitMessage` in `src/model/draft-commit-message.ts` to depend on the smallest context it needs rather than `ExtensionCommandContext` specifically.
- Decision: add a separate diagnostics-capable drafting helper for workflow use instead of changing the existing `DraftCommitMessage = Promise<string>` API.
- The new helper should return a safe result such as `{ message: string; attempts: DraftAttemptDiagnostics[] }`.
- Keep the existing string-returning `DraftCommitMessage` API for command/test compatibility and simple injection.
- The minimal context should include `model`, `modelRegistry`, and `signal`.
- Ensure the existing command context and tool context both satisfy this type.
- When called from a tool, pass the tool execute `signal` into this minimal context so Esc/abort cancels nested model requests.
- Preserve existing retry/repair/error behavior exactly.

### 4. Refactor `/commitme` to use the workflow
- Keep `parseCommitMeArgs`, help text, unknown-flag handling, `--confirm` UI preflight, and idle waiting in `src/commands/commitme-command.ts`.
- Replace the duplicated gather/prompt/draft/commit body with a call to the shared workflow.
- Preserve existing command user experience:
  - no changes: warning notification, no message sent
  - cancel: info notification, no commit
  - success: `pi.sendMessage()` with `customType: "commitme"`, content `Committed <hash>: <subject>`, and `details.action === "commit"`

### 5. Enhance `commitme action="commit"`
- In `src/tools/commitme-tool.ts`, branch by `message`:
  - If `message` is present, keep current explicit-message validation and commit behavior.
  - If `message` is absent, call the shared draft-and-commit workflow.
- Preserve `/commitme` drafting failures for missing model/API key in message-less commit mode, with no staging or committing.
- Keep explicit-message commit mode independent of the active model because it already has a final subject.
- Fail before git/model work when `confirm: true` and `ctx.hasUI` is false.
- For message-less commit mode with `confirm: true`, prompt only after a valid subject has been drafted and show that exact subject in the confirmation dialog.
- For message-less commit mode, include `steeringPrompt` in the bounded prompt and `details` when provided.
- For explicit-message commit mode, ignore `steeringPrompt` for behavior; do not alter the provided final `message`.
- Return concise final-outcome content only; do not include the full draft prompt in message-less commit output.
- Decision: no-changes in message-less commit mode is a successful no-op tool result with `terminate: true`, not a thrown error.
- Return content examples:
  - success: `Committed <hash>: <subject>`
  - cancelled: `CommitMe commit cancelled; no git mutation was performed.`
  - no changes: `No staged or unstaged git changes found; no commit was created.`
- Return structured details from `createCommitMeDetails(...)`, including prompt/truncation metadata and safe `draft` attempt diagnostics on drafted paths.
- Return `terminate: true` for committed, cancelled, and no-changes outcomes in message-less commit mode.
- Do not return `terminate: true` for thrown-error outcomes; unsafe files, invalid drafts, git failures, and other errors should remain normal tool errors so the agent can explain or recover.

### 6. Update `commitme` prompt metadata
- Update the tool description to distinguish:
  - `action=gather` read-only context gathering.
  - `action=commit` with `message` explicit final-subject commit.
  - `action=commit` without `message` one-shot draft-and-commit equivalent to `/commitme`.
- Update `promptGuidelines`; every bullet must name `commitme` explicitly.
- Include guidance such as:
  - `Use commitme action=gather when the user asks for a commit message but not a commit.`
  - `Use commitme action=commit without message only when the user explicitly asks to create a local git commit from current changes.`
  - `Use commitme action=commit with message only when a final one-line subject has already been selected.`
  - `Pass user wording or scope guidance as commitme steeringPrompt when it matches the requested commit.`
  - `Set commitme confirm=true only when the user asks to review/confirm before committing.`
  - `Commitme may be used in same-turn edit-and-commit flows only when the user explicitly requested that end-to-end workflow.`

### 7. Keep existing behavior stable
- Preserve `commitme action="gather"` as the read-only path.
- Preserve explicit-message `commitme action="commit", message: "..."` behavior, early message validation, and existing non-terminating tool-result behavior.
- Do not change `/commitme` user-facing behavior; adding non-sensitive draft diagnostics to structured details is acceptable.
- Do not add background auto-commit behavior.
- Do not add amend/reset/stash/rebase/push behavior.

### 8. Update tests
- Add tests that `registerCommitMeTool` still registers exactly `commitme` with `executionMode: "sequential"`.
- Add tests that no separate `commit` tool is registered by `src/extension.ts`.
- Add tests that `createCommitMeTool` accepts an injected draft function so tests do not call a real model provider.
- Add temp-repo tests for message-less `commitme action="commit"`:
  - creates a commit after drafting a valid subject
  - includes `steeringPrompt` in the prompt/details for message-less commit mode
  - ignores `steeringPrompt` behaviorally when explicit `message` is provided
  - returns no-changes without drafting or staging
  - returns only final outcome content, not the full draft prompt
  - includes safe draft attempt diagnostics in `details.draft` when available
  - refuses sensitive or unreadable changed files before drafting/staging
  - rejects invalid drafts before staging
  - fails fast when `confirm: true` but no UI is available
  - asks for confirmation only after drafting/validating and displays the exact subject
  - treats empty/whitespace `message` as invalid explicit-message input rather than drafting
  - fails before staging/committing when no model/API key is available for message-less commit mode
  - still commits without a model when `message` is provided and valid
  - cancels without staging/committing when confirmation is denied
  - aborts before staging when git status changes after drafting
  - returns `terminate: true` for success/cancel/no-changes
- Rerun existing command and `commitme` explicit-message tests to ensure refactor did not change behavior.

### 9. Update documentation
- Update README Agent Tool section to describe the single `commitme` tool with three paths:
  - `action: "gather"` - read-only context and subject prompt.
  - `action: "commit", message: "..."` - explicit final-subject commit.
  - `action: "commit"` without `message` - one-shot draft-and-commit equivalent to `/commitme`.
- Update usage guidance so users understand message-less `commitme action="commit"` mutates git history locally and never pushes.
- Update `SECURITY.md` to mention message-less `commitme action="commit"` as an explicit user/agent-triggered commit path.
- Update `docs/STRUCTURE.md` to continue saying the package registers one slash command and one tool, with enhanced commit action behavior.
- Add a `CHANGELOG.md` Unreleased bullet.

### 10. Validate the feature
- Run all validation commands listed below.
- Manually smoke-test with isolated extension loading.
- Confirm `/commitme` and `commitme` are available in Pi.
- Confirm no separate `commit` tool is registered.

## Testing Strategy
Use deterministic unit tests and temporary git repositories. Avoid real network calls by injecting a fake `draftCommitMessage` implementation into the shared workflow or tool factory.

Key test groups:

- Registration/schema tests for the existing `commitme` tool, including sequential execution mode and updated `message` semantics.
- Shared workflow tests for no-changes, invalid draft, unsafe files, cancellation, and successful commit.
- Command regression tests to ensure `/commitme` still behaves exactly as before.
- Existing `commitme` gather and explicit-message commit regression tests.
- Documentation/package tests for updated structure expectations.

## Acceptance Criteria
- No new tool named `commit` is registered.
- The existing `commitme` tool supports message-less `action: "commit"` as one-shot draft-and-commit using the same core logic as `/commitme`.
- `commitme action="commit"` with `message` continues to commit with the explicit final subject.
- `commitme action="gather"` remains read-only and remains the default when `action` is omitted.
- Message-less commit mode accepts optional `steeringPrompt` and `confirm` parameters.
- Empty or whitespace-only `message` is invalid explicit-message input and does not trigger message-less drafting.
- Message-less `confirm: true` confirmation happens after subject drafting/validation and displays the exact subject.
- Message-less commit mode requires active-model drafting and fails safely before staging/committing if no model/API key is available.
- Explicit-message commit mode remains model-independent.
- Message-less commit mode defaults to no confirmation, matching `/commitme`; `confirm: true` is opt-in.
- Message-less commit mode returns only final outcome content and puts prompt diagnostics/truncation plus safe draft attempt diagnostics in `details`.
- Message-less commit mode treats no-changes as a successful no-op result rather than an error.
- Message-less commit mode returns `terminate: true` for committed, cancelled, and no-changes outcomes.
- Explicit-message commit mode does not gain `terminate: true` in this feature.
- Existing `/commitme` user-facing behavior is unchanged; structured details may gain safe draft diagnostics.
- Commit safety protections remain in force: no unsafe files, no invalid subjects, no status drift, no push.
- New and existing tests pass.
- README, SECURITY, STRUCTURE, and CHANGELOG document the enhanced `commitme` tool.

## Validation Commands
Execute these commands to validate the task is complete:

- `npm run typecheck` - Type-check TypeScript sources.
- `npm run format:check` - Verify formatting.
- `npm run test` - Run Node tests.
- `npm run check:pack` - Verify package contents.
- `npm run validate` - Run all validation checks.
- `pi --no-extensions -e .` - Isolated Pi smoke test; verify `/commitme` and `commitme` are available and no separate `commit` tool is registered.

## Notes
- This supersedes the earlier idea of adding a separate generic `commit` tool.
- The `commitme` tool is intentionally mutating only when `action: "commit"` is selected.
- Prefer shared workflow extraction over copy/paste so command and tool behavior cannot drift.
- Same-turn edit-and-commit flows are allowed only when the user explicitly requested that end-to-end workflow.
- Do not add background auto-commit behavior, amend/reset/stash/rebase behavior, telemetry, or push support.
