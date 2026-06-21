# Plan: CommitMe Architecture

## Task Description
Design the architecture for CommitMe, a TypeScript Pi extension that gathers git diff and project context, formats a weak-model-friendly prompt, and optionally creates a git commit using a Conventional Commit message.

## Objective
Provide a clear implementation blueprint for the later feature session. The extension should be fast, deterministic where possible, and safe about local mutations. Preparation creates this plan only; runtime feature behavior is not implemented in the preparation session.

## Problem Statement
Users need clear and precise commit messages from local code changes. Smaller/local models often struggle when given raw, oversized diffs or vague instructions, so CommitMe must programmatically collect only the most relevant context and present it in a strict, compact prompt format.

## Solution Approach
CommitMe should register one slash command (`/commitme`) and one LLM-callable tool (`commitme`). Both surfaces should reuse the same pure git/context/prompt modules so behavior is consistent and easy to test.

The implementation should prefer deterministic preprocessing over asking the model to discover context itself:

1. Read git status, branch, staged diff, unstaged diff, changed file list, and diff stats.
2. Read compact project metadata from files such as `package.json`, `README.md`, selected config files, and snippets from changed files.
3. Truncate and summarize large data before it reaches the LLM.
4. Build a strict Conventional Commit prompt with required output format.
5. For commit mode, stage all changes and run `git commit` only after a commit message is produced.

## Relevant Files
Use these files to complete the task:

- `src/extension.ts` - Keep small. It should import feature registration modules and call their `register*` functions only.
- `src/constants.ts` - Centralize extension display name, status key, command name, and tool name.
- `src/commands/commitme-command.ts` - Register `/commitme`, parse flags, orchestrate gather/draft/commit flow.
- `src/tools/commitme-tool.ts` - Register the `commitme` tool with TypeBox schemas, prompt metadata, and execution logic.
- `src/git/context.ts` - Gather local git status, branch, diffs, diff stats, changed files, and project context.
- `src/git/commit.ts` - Stage all changes and create commits via local git commands.
- `src/prompt/build-commit-prompt.ts` - Build the deterministic LLM prompt for commit message generation.
- `src/utils/truncation.ts` - Apply byte/line truncation and produce truncation metadata.
- `test/*.test.mjs` - Unit and preparation/behavior tests.
- `README.md`, `SECURITY.md`, `docs/STRUCTURE.md` - User-facing documentation and security notes.

### New Files

- `src/types.ts` - Shared domain types for context payloads, prompt inputs, commit options, and results.
- `test/context.test.mjs` - Tests for context normalization/truncation using mocked command outputs or temporary git repos.
- `test/prompt.test.mjs` - Tests for deterministic prompt shape and Conventional Commit instructions.
- `test/package.test.mjs` - Tests for package metadata and Pi manifest.

## Implementation Phases

### Phase 1: Foundation
- Replace preparation placeholders with real registration modules.
- Define shared domain types.
- Implement reusable argument parsing for `/commitme` flags.
- Implement safe wrappers around `pi.exec("git", args, ...)`.

### Phase 2: Core Implementation
- Implement git/context gathering.
- Implement truncation and project-context selection.
- Implement prompt builder.
- Implement `commitme` tool behavior.
- Implement `/commitme` command orchestration.

### Phase 3: Integration & Polish
- Add commit mode with `git add -A` and `git commit`.
- Add optional confirmation via `--confirm`.
- Add compact UI notifications/status.
- Add tests, docs, and validation.

## Architecture Details

### Pi surfaces

| Surface | Name | Responsibility |
| --- | --- | --- |
| Slash command | `/commitme` | Primary user entrypoint. Drafts by default; commits with `--commit`; confirms only with `--confirm`. |
| Tool | `commitme` | LLM-callable tool that gathers commit context and can perform the final commit action when explicitly requested by the command/agent. |
| Events | none initially | Avoid background behavior and long-lived resources. |
| UI | confirmation dialog | Only used when `--confirm` is present and UI is available. |

### Command flow

Pseudo-flow for `/commitme`:

```text
parse args
wait for idle if needed
collect context with includeStaged=true and includeUnstaged=true
build deterministic prompt
send prompt to active Pi model
if --commit:
  extract/receive selected commit message
  if --confirm and UI available: ask user
  run git add -A
  run git commit -m subject [-m body]
else:
  show/send drafted message only
```

The implementation must use Pi-supported APIs such as `pi.registerCommand`, `pi.sendUserMessage`, `ctx.ui.confirm`, and `pi.exec` rather than shelling out through unrelated process helpers.

### Tool design

The `commitme` tool should use a strict TypeBox schema. If string enum fields are needed, use `StringEnum` from `@earendil-works/pi-ai` for provider compatibility.

Potential schema shape:

```ts
Type.Object({
  action: StringEnum(["gather", "commit"] as const),
  message: Type.Optional(Type.String({ description: "Final commit message to use when action is commit." })),
  confirm: Type.Optional(Type.Boolean({ description: "Ask before creating the commit when UI is available." })),
})
```

The tool definition must include:

- `name: "commitme"`
- clear `label` and `description`
- `promptSnippet`
- `promptGuidelines` where every bullet explicitly names `commitme`
- output truncation notices when content is truncated
- `details` containing structured metadata such as branch, status summary, changed files, and truncation flags

### Data flow

```text
Pi command/tool
  -> argument parser
  -> git context collector
  -> project context selector
  -> truncation layer
  -> prompt builder
  -> LLM draft
  -> optional git commit executor
  -> result/details for UI and session history
```

### Git/context collection

Collect these local data points, with short timeouts and clear failures:

- `git rev-parse --show-toplevel`
- `git branch --show-current` or fallback to short HEAD
- `git status --porcelain=v1 --branch`
- `git diff --cached --stat`
- `git diff --stat`
- `git diff --cached --name-status`
- `git diff --name-status`
- `git diff --cached -- <limited file list>`
- `git diff -- <limited file list>`

Project metadata candidates:

- `package.json`, `README.md`, `CHANGELOG.md`
- `pyproject.toml`, `Cargo.toml`, `go.mod`, `pom.xml`, `build.gradle`, `deno.json`, `tsconfig.json`
- existing project guidance files such as `AGENTS.md`, `CLAUDE.md`, `.pi/SYSTEM.md` only when safe and already part of Pi context expectations

Avoid reading sensitive file contents such as `.env`, private keys, credential files, and large binary files. Changed sensitive paths can be listed by name/status, but their contents should not be included.

### Prompt format

The prompt builder should produce a compact prompt with stable sections:

```text
You are generating a git commit message.
Return only a Conventional Commit message.

Rules:
- Subject: <type>(optional-scope): <summary>
- Use imperative mood.
- Keep subject <= 72 characters when possible.
- Include a body only when it adds useful context.
- Do not mention files mechanically unless important.

Repository:
...

Change summary:
...

Relevant context:
...

Diff excerpts:
...

Output format:
<subject>

<body if needed>
```

The command/tool should bias toward a single high-quality result instead of multiple alternatives, because the extension targets weaker/local models and fast workflows.

### Config, state, and persistence

- No configuration file in the first implementation.
- No session-persistent state required.
- Store branch-sensitive metadata in tool result `details` when possible.
- Reconstruct anything needed from the current repository state on each command/tool invocation.

### Security boundaries

- Local shell execution is limited to `git` commands through `pi.exec`.
- Draft mode must not mutate files or git state.
- Commit mode mutates the git index and repository history with `git add -A` and `git commit`.
- Confirmation happens only when `--confirm` is set.
- No telemetry and no non-LLM network APIs.
- Do not intentionally read secrets; avoid secret-like files and binary files in context extraction.

## Pi Documentation Notes

Relevant docs/examples researched during preparation:

- `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/docs/extensions.md`
- `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/docs/packages.md`
- `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/docs/security.md`
- `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/docs/tui.md`
- `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/examples/extensions/commands.ts`
- `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/examples/extensions/tools.ts`
- `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/examples/extensions/auto-commit-on-exit.ts`
- `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/examples/extensions/truncated-tool.ts`
- `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/examples/extensions/structured-output.ts`

Key rules to preserve:

- Keep `src/extension.ts` small.
- Do not start long-lived processes, file watchers, timers, sockets, or background jobs directly in the extension factory.
- Start session-scoped resources from `session_start`, a command, or a tool; clean them up in `session_shutdown`.
- Tools need clear schemas, descriptions, `promptSnippet`, and tool-specific `promptGuidelines`.
- Use `StringEnum` from `@earendil-works/pi-ai` for string enum schemas.
- Truncate large tool outputs and tell the agent when output is truncated.
- Keep Pi core packages in `peerDependencies` with `"*"`.

## Testing Strategy

- Unit-test pure prompt/truncation helpers with deterministic fixtures.
- Integration-test git context gathering in temporary repositories.
- Test command argument parsing without invoking Pi UI.
- Test package metadata and Pi manifest.
- Manually smoke-test with `pi --no-extensions -e .`.

## Acceptance Criteria

- Architecture separates Pi registration, git operations, prompt building, truncation, and commit execution.
- Draft mode is read-only.
- Commit mode stages all changes and commits only when explicitly requested.
- Confirmation is controlled by `--confirm`.
- Output is compact enough for weaker/local models.
- Security-sensitive behavior is documented.

## Validation Commands

Execute these commands during implementation validation:

- `npm run typecheck` - Type-check TypeScript sources.
- `npm run test` - Run Node tests.
- `npm run check:pack` - Verify package contents.
- `npm run validate` - Run all validation checks.
- `pi --no-extensions -e .` - Isolated Pi smoke test.

## Notes

Do not implement background auto-commit behavior. CommitMe is user-triggered through `/commitme` or the `commitme` tool only.
