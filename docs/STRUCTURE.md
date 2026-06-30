# CommitMe Structure Guide

CommitMe is a TypeScript Pi extension package that registers one slash command and one `commitme` tool for Conventional Commit subject-line workflows, including gather, explicit-message commit, and message-less draft-and-commit tool paths.

## Current layout

```text
src/
├── extension.ts                  # small extension entry point
├── constants.ts                  # names, limits, metadata candidates, commit types
├── types.ts                      # serializable domain types
├── commitme-details.ts           # shared tool/command result details helpers
├── commands/
│   └── commitme-command.ts       # /commitme argument parsing, help, and UI notifications
├── tools/
│   └── commitme-tool.ts          # commitme TypeBox tool schema and gather/commit execution
├── workflows/
│   └── commitme-commit-flow.ts   # shared draft-and-create-commit orchestration
├── model/
│   └── draft-commit-message.ts   # active-model drafting, response diagnostics, retry, and repair
├── git/
│   ├── context.ts                # git/project context gathering and filtering
│   └── commit.ts                 # commit subject validation/normalization and git add/commit helper
├── prompt/
│   └── build-commit-prompt.ts    # deterministic Conventional Commit prompt builder
└── utils/
    └── truncation.ts             # byte/line truncation helpers and notices
```

## Module boundaries

1. `src/extension.ts` imports registration functions and calls them only.
2. `src/commands/commitme-command.ts` parses flags and optional steering text, serves `/commitme help`, waits for idle, delegates draft-and-commit work, and reports UI notifications/messages.
3. `src/tools/commitme-tool.ts` exposes gather behavior, explicit-message commit behavior, and message-less `/commitme` parity commit behavior to the agent with structured `details`.
4. `src/workflows/commitme-commit-flow.ts` gathers context, refuses unsafe files, builds bounded prompts, drafts and validates subjects, optionally confirms, and creates local commits without UI-specific side effects.
5. `src/model/draft-commit-message.ts` calls the active Pi model with system/user prompt parts, inspects response shape, retries empty/thinking-only/length-stopped drafts, repairs invalid drafts when safe, and returns only validated one-line subjects plus safe diagnostics where requested.
6. `src/git/context.ts` reads git status/diff data, project metadata, safe file snippets, symlink-safe omission reasons, and abort-aware local secret scans for changed files.
7. `src/git/commit.ts` validates and normalizes Lightweight Conventional Commit subjects, stages the gathered changed paths, and commits with `git commit`.
8. `src/prompt/build-commit-prompt.ts` formats weak-model-friendly prompt sections, includes bounded user steering guidance, independently budgets sections by priority, bounds final prompt size, and preserves the final output reminder when truncation is needed.
9. `src/commitme-details.ts` keeps command and tool result metadata consistent.
10. `src/utils/truncation.ts` enforces output limits and emits truncation metadata/notices.

## Pi extension conventions

- No long-lived processes, file watchers, timers, sockets, or background jobs are started.
- Tools define TypeBox schemas, descriptions, `promptSnippet`, and `promptGuidelines`.
- Each `promptGuidelines` bullet names the `commitme` tool.
- String action enums use `StringEnum` from `@earendil-works/pi-ai`.
- Large outputs are truncated before reaching the model.
- Pi core packages remain in `peerDependencies` with `"*"`.

## Security-sensitive areas

- Local git shell execution uses `pi.exec("git", args)` with argument arrays.
- Tool gather mode is read-only; `/commitme` and message-less `commitme action="commit"` are explicit draft-and-commit paths; explicit-message `commitme action="commit"` uses a provided final subject.
- Model drafting retries and repairs happen before confirmation, staging, or committing, and diagnostics avoid raw prompt/diff/model-output content.
- Commit mode is explicit and stages only gathered changed paths before `git commit`.
- Optional confirmation runs only when requested.
- There is no `git push`, telemetry, or non-LLM network API usage.
- Secret-like, generated, binary-looking, unreadable, symlinked, symlink-aliased, and overly large changed-file contents are filtered from model context; symlinks to sensitive repository paths are marked unsafe.
- Commit actions refuse known secret files, unreadable changed files, or high-confidence secret-token content before staging, including high-confidence tokens found in generated, binary-looking, or `.env.*` regular changed paths, recheck current content immediately before staging, abort if git status changes after context gathering, and avoid staging unrelated paths that appear after the final changed-file scan.
- Git diff collection disables external diff and textconv commands.
- Git status parsing uses NUL-delimited `-uall` output internally so untracked directories, paths with spaces, and special characters are handled safely.

## Planning files

- `docs/PROJECT_DEFINITION_BRIEF.md` - approved preparation brief
- `specs/spec-architecture.md` - architecture blueprint
- `specs/spec-guidelines.md` - implementation rules
- `specs/spec-tasks.md` - implementation task checklist
