# Changelog

## Unreleased

## 0.3.2 - 2026-10-22

- Added an optional `worktreePath` to the `commitme` tool so one agent session can gather and commit in another worktree of the same repository; it must be the absolute root of a worktree sharing the current repository's git common dir, and anything else is refused before staging.

## 0.3.1 - 2026-10-22

- Parallelized independent metadata, snippet, and diff-safety reads while preserving deterministic ordering and filtering; high-confidence secret scans run in deduplicated batches of at most eight files.
- Made git lock retry waits abortable while keeping retries sequential and retaining the lock deadline and failure diagnostics.
- Updated development-only Pi packages to 1.3.0 and refreshed the lockfile to remove known dependency vulnerabilities; host-provided peer dependency ranges remain unchanged.
- A git command that fails because another git process holds `index.lock`, `HEAD.lock` or a ref lock is retried every 250 ms for up to 10 seconds, then fails with git's error plus "The lock was still held after waiting 10 s."; lock files are never removed. Local git reads time out after 30 seconds instead of 5, for slow or emulated git under parallel agents.
- Added an optional `paths` allowlist to `commitme action="commit"` so agents can stage and commit only approved repo-relative paths, refusing listed paths without changes and staged changes outside the list; `steeringPrompt` guides message wording only and never scopes paths.
- Fixed `commitme action="commit"` results to return control to the agent so requested follow-up tools can run after a local commit.
- Added UI approval prompts for flagged unsafe changed files so users can commit reviewed safe fixtures/placeholders or block the commit before staging.
- Added a user-visible UI fixture test that captures command help, dialogs, notifications, safety copy, and representative output.
- Added `/commitme --steering <prompt>` and `/commitme --steering=<prompt>` parsing for explicit command steering while preserving positional steering.
- Added message-less `commitme action="commit"` tool parity with `/commitme`, including active-model drafting, optional confirmation, local commit creation, and concise no-op/cancel/success results.
- Refused unreadable changed files before staging so CommitMe does not auto-commit content it cannot scan for high-confidence secret tokens.
- Escaped control characters in unsafe-path refusal messages to avoid malformed terminal output from unusual filenames.
- Prevented changed paths reached through symlinked directories from reading content outside the repository into model context.
- Restored the tracked preparation specs expected by validation while keeping them out of packaged npm contents.
- Limited commit staging to the changed paths gathered during the final safety scan so unrelated files that appear later are not swept into the commit.
- Stopped reading symlink target contents into model context while preserving unsafe handling for symlinks that point at sensitive repository paths.
- Escaped all ASCII control characters in prompt-rendered paths to avoid malformed prompt sections or terminal control output from unusual filenames.
- Aligned `commitme` gather-tool prompt sizing with the active model context window and output-token budget.
- Hardened commit safety checks so generated and binary-looking changed files are locally scanned for high-confidence secret tokens before staging while staying out of model context.
- Propagated Pi abort signals through high-confidence secret scans for changed-file content.
- Hardened commit safety checks so oversized changed files and renames from sensitive paths are still scanned locally for high-confidence secret tokens before staging.
- Added early validation for `commitme` tool `action: "commit"` messages so invalid subjects fail before reading git context or prompting for confirmation.
- Added optional steering prompts for `/commitme [steering prompt]` and `/commitme --confirm [steering prompt]`.
- Added `steeringPrompt` support to the `commitme` gather tool so agent workflows can guide commit-message drafting.
- Improved local-model drafting reliability with system/user prompt parts, priority-budgeted context, weak-model drafting instructions, response diagnostics, retry/repair handling for empty/thinking-only/length-stopped/invalid drafts, and validation before staging.
- Standardized CommitMe output on one-line Conventional Commit subjects by prompting for subject-only drafts and automatically extracting the first valid subject from verbose model output.

## 0.1.0 - 2026-06-21

- Implemented the `/commitme` command to draft a Lightweight Conventional Commit message from staged and unstaged changes, then commit with `git add -A` and `git commit`.
- Added `/commitme --confirm` confirmation before mutation.
- Added `/commitme help` usage guidance with an in-session help panel.
- Updated the `commitme` tool description and prompt guidelines with slash-command usage and the Lightweight Conventional Commit standard.
- Added the `commitme` Pi tool with gather and explicit commit actions.
- Added git/project context gathering, sensitive/generated/binary filtering, truncation notices, and deterministic prompt building.
- Hardened context gathering with secret-like content filtering, diff redaction, unreadable-file handling, `.envrc` detection, untracked-directory expansion, symlink target filtering, disabled Git external diff/textconv execution, and robust parsing for paths with spaces.
- Added commit safety guards that refuse known secret files or high-confidence secret tokens, recheck unsafe content immediately before staging, and abort when git status changes after context gathering.
- Bounded command/tool prompts with truncation metadata while preserving the final commit-message output reminder.
- Aligned prompt and validation with the team Lightweight Conventional Commits standard.
- Added tests for argument parsing, context gathering, project filtering, truncation, prompt shape, tool behavior, no-change handling, confirmation failure modes, package metadata, and commit behavior.
- Switched CI installs to `npm ci` for lockfile-based validation.
- Corrected package gallery metadata to reference CommitMe assets and removed machine-local preparation paths from packaged documentation.
- Documented implemented usage and security boundaries.
