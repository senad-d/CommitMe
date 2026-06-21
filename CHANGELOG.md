# Changelog

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
