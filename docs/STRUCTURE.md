# CommitMe Structure Guide

CommitMe is a TypeScript Pi extension package that registers one slash command and one tool for Conventional Commit message workflows.

## Current layout

```text
src/
├── extension.ts                  # small extension entry point
├── constants.ts                  # names, limits, metadata candidates, commit types
├── types.ts                      # serializable domain types
├── commitme-details.ts           # shared tool/command result details helpers
├── commands/
│   └── commitme-command.ts       # /commitme argument parsing and command flow
├── tools/
│   └── commitme-tool.ts          # commitme TypeBox tool schema and execution
├── git/
│   ├── context.ts                # git/project context gathering and filtering
│   └── commit.ts                 # commit message validation and git add/commit helper
├── prompt/
│   └── build-commit-prompt.ts    # deterministic Conventional Commit prompt builder
└── utils/
    └── truncation.ts             # byte/line truncation helpers and notices
```

## Module boundaries

1. `src/extension.ts` imports registration functions and calls them only.
2. `src/commands/commitme-command.ts` parses flags, serves `/commitme help`, gathers context, calls the active Pi model, and commits (`--confirm` asks first).
3. `src/tools/commitme-tool.ts` exposes gather/commit behavior to the agent with structured `details`.
4. `src/git/context.ts` reads git status/diff data, project metadata, and safe file snippets.
5. `src/git/commit.ts` validates Lightweight Conventional Commit messages, stages with `git add -A`, and commits with `git commit`.
6. `src/prompt/build-commit-prompt.ts` formats weak-model-friendly prompt sections, bounds final prompt size, and preserves the final output reminder when truncation is needed.
7. `src/commitme-details.ts` keeps command and tool result metadata consistent.
8. `src/utils/truncation.ts` enforces output limits and emits truncation metadata/notices.

## Pi extension conventions

- No long-lived processes, file watchers, timers, sockets, or background jobs are started.
- Tools define TypeBox schemas, descriptions, `promptSnippet`, and `promptGuidelines`.
- Each `promptGuidelines` bullet names the `commitme` tool.
- String action enums use `StringEnum` from `@earendil-works/pi-ai`.
- Large outputs are truncated before reaching the model.
- Pi core packages remain in `peerDependencies` with `"*"`.

## Security-sensitive areas

- Local git shell execution uses `pi.exec("git", args)` with argument arrays.
- Tool gather mode is read-only; `/commitme` is an explicit commit command.
- Commit mode is explicit and uses only `git add -A` plus `git commit`.
- Optional confirmation runs only when requested.
- There is no `git push`, telemetry, or non-LLM network API usage.
- Secret-like, generated, binary, unreadable, and overly large file contents are filtered from context.
- Commit actions refuse known secret files or high-confidence secret-token content before staging and abort if git status changes after context gathering.
- Git status parsing uses NUL-delimited `-uall` output internally so untracked directories, paths with spaces, and special characters are handled safely.

## Planning files

- `docs/PROJECT_DEFINITION_BRIEF.md` - approved preparation brief
- `specs/spec-architecture.md` - architecture blueprint
- `specs/spec-guidelines.md` - implementation rules
- `specs/spec-tasks.md` - implementation task checklist
