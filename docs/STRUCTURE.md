# CommitMe Structure Guide

CommitMe is prepared as a TypeScript Pi extension package. Runtime feature implementation is pending and must follow the approved brief plus the three specs under `specs/`.

## Current prepared layout

```text
src/
├── extension.ts                  # prepared entry point; registers no runtime behavior yet
├── constants.ts                  # project identity constants
├── types.ts                      # planned shared domain types placeholder
├── commands/
│   └── commitme-command.ts       # planned /commitme command placeholder
├── tools/
│   └── commitme-tool.ts          # planned commitme tool placeholder
├── events/
│   └── lifecycle.ts              # no-op lifecycle placeholder
├── git/
│   ├── context.ts                # planned git/project context collector placeholder
│   └── commit.ts                 # planned git add/commit helper placeholder
├── prompt/
│   └── build-commit-prompt.ts    # planned Conventional Commit prompt builder placeholder
└── utils/
    └── truncation.ts             # planned truncation helper placeholder
```

## Planned implementation layout

Keep the entrypoint small:

1. `src/extension.ts` imports registration functions.
2. `src/extension.ts` calls those `register*` functions.
3. Feature logic lives in command/tool/git/prompt/utils modules.
4. Tests cover pure helpers and git integration behavior.

## Pi extension conventions

- Do not start long-lived processes, file watchers, timers, sockets, or background jobs directly in the extension factory.
- Start session-scoped resources from `session_start`, a command, or a tool; clean them up in `session_shutdown`.
- For tools, define clear TypeBox schemas, descriptions, `promptSnippet`, and `promptGuidelines`.
- Each `promptGuidelines` bullet must name the `commitme` tool explicitly.
- Use `StringEnum` from `@earendil-works/pi-ai` for string enum schemas.
- Truncate large tool outputs and tell the agent when output is truncated.
- Keep Pi core packages in `peerDependencies` with `"*"`.

## Security-sensitive areas

The later implementation must document and test these boundaries:

- local git shell execution through `pi.exec("git", args)`
- read-only draft mode
- explicit commit mode using `git add -A` and `git commit`
- optional confirmation only when `--confirm` is set
- no `git push`
- no telemetry
- no non-LLM network APIs
- no intentional reading of secret files

## Planning files

- `docs/PROJECT_DEFINITION_BRIEF.md` - approved preparation brief
- `specs/spec-architecture.md` - architecture blueprint
- `specs/spec-guidelines.md` - implementation rules
- `specs/spec-tasks.md` - implementation task checklist for a later session
