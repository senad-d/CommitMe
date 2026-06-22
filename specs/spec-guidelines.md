# Plan: CommitMe Implementation Guidelines

## Task Description
Define coding, packaging, documentation, testing, and security guidelines for the CommitMe Pi extension implementation.

## Objective
Give the later implementation session clear rules so CommitMe remains fast, simple, safe, and compatible with weaker/local models.

## Problem Statement
Commit-message generation can become slow, overly broad, or unsafe if the extension sends raw diffs directly to the model or mutates git state without clear user intent. The implementation needs strict boundaries and predictable formatting.

## Solution Approach
Use deterministic local preprocessing for context gathering and keep Pi integration thin. Favor small pure functions, compact prompts, explicit mutation modes, and preparation-safe documentation.

## Relevant Files

- `src/extension.ts` - Minimal extension factory.
- `src/commands/commitme-command.ts` - Slash command registration and orchestration.
- `src/tools/commitme-tool.ts` - Tool schema, descriptions, prompt metadata, and result shape.
- `src/git/*.ts` - Git read/mutation helpers.
- `src/prompt/*.ts` - Prompt construction.
- `src/utils/*.ts` - Truncation, path filters, formatting utilities.
- `test/*.test.mjs` - Tests for metadata, prompt building, context gathering, and git behavior.
- `README.md`, `SECURITY.md`, `docs/STRUCTURE.md`, `CHANGELOG.md` - Public project documentation.

## Implementation Phases

### Phase 1: Conventions and boundaries
- Replace placeholders with real modules only in a separate implementation session.
- Keep source files focused by behavior.
- Establish types before implementing behavior.

### Phase 2: Feature implementation
- Implement pure helpers first.
- Add Pi command/tool surfaces after helpers are testable.
- Add commit mutation last.

### Phase 3: Validation and documentation
- Update tests alongside behavior.
- Update README and SECURITY when behavior changes.
- Run isolated smoke tests.

## Coding Guidelines

### TypeScript

- Use strict TypeScript and explicit exported types for shared domain objects.
- Prefer pure functions for parsing, truncation, prompt building, and context normalization.
- Keep side effects isolated to git/file helpers and Pi registration modules.
- Use Node built-ins before adding runtime dependencies.
- Avoid global mutable state unless it is session-scoped and reconstructed from current repository/session state.

### File layout

Use purpose-based modules:

```text
src/
├── extension.ts
├── constants.ts
├── types.ts
├── commands/
│   └── commitme-command.ts
├── tools/
│   └── commitme-tool.ts
├── git/
│   ├── context.ts
│   └── commit.ts
├── prompt/
│   └── build-commit-prompt.ts
└── utils/
    └── truncation.ts
```

Do not add extra layers until there is a clear need.

### `src/extension.ts`

- Keep `src/extension.ts` small.
- It should import feature modules and call their `register*` functions.
- It should not run git commands, read files, build prompts, or start background work.
- Do not start long-lived processes, file watchers, timers, sockets, or background jobs directly in the extension factory.

### Pi command guidelines

- Register `/commitme` via `pi.registerCommand("commitme", ...)`.
- Keep argument parsing deterministic and documented.
- Commit mode is the default for `/commitme`.
- `--confirm` asks before mutation when UI is available.
- `help`, `--help`, and `-h` show usage without git or model work.
- If the agent is busy, handle this predictably: wait for idle or notify the user, depending on the final implementation choice.
- Use concise notifications; avoid noisy UI.

### Pi tool guidelines

- Register exactly one planned tool named `commitme` unless a future spec amendment says otherwise.
- Define clear TypeBox schemas.
- Use `StringEnum` from `@earendil-works/pi-ai` for string enum fields.
- Include `promptSnippet`.
- Include `promptGuidelines`; every guideline must name `commitme` explicitly.
- Return concise `content` for the model and structured `details` for metadata.
- Truncate large outputs and clearly tell the agent when truncation happened.
- If any future tool mutates files directly, use Pi file-mutation queue helpers and safe path resolution. The initial design should avoid direct file mutation and only use git commands for commit mode.

Example prompt guideline style:

```text
Use commitme when the user asks for a commit message based on the current git diff.
Use commitme instead of manually inspecting every changed file when a compact commit context is enough.
Do not use commitme to create a commit unless the user explicitly requested commit mode.
```

### Git command guidelines

- Execute git through Pi's `pi.exec("git", args, options)`.
- Use argument arrays, not shell-string interpolation.
- Add short timeouts for git commands where practical.
- Detect non-git repositories and report a clear error.
- Use both staged and unstaged diffs for context.
- In commit mode, stage all changes with `git add -A` before `git commit`.
- Do not auto-commit from lifecycle events.
- Do not push.
- Do not amend, rebase, reset, stash, or clean unless a future spec explicitly adds those features.

### Context selection guidelines

- Prioritize changed paths and diff stats over large raw diffs.
- Read only small, useful project metadata files.
- Include snippets from changed text files only when they help explain intent.
- Skip binary files and generated directories such as `node_modules`, `dist`, `build`, `coverage`, and caches.
- Avoid reading sensitive files such as `.env`, private keys, credential stores, and secret-like config files.
- Include path/name/status for sensitive changed files if needed, but not contents.

### Prompt guidelines for weaker/local models

- Use one deterministic prompt shape.
- Ask for one final Conventional Commit message, not many alternatives.
- State strict output rules near the top and bottom of the prompt.
- Keep context compact and labeled.
- Prefer simple language and explicit constraints.
- Avoid chain-of-thought requests.
- Ask for subject plus optional body only.

### Conventional Commit rules

- Subject format: `type(optional-scope): summary`.
- Prefer common types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`.
- Use imperative mood.
- Keep subject concise, ideally <= 72 characters.
- Add a body only when it explains why or important details.
- Avoid noisy file-by-file summaries unless the file itself is central to the change.

## Package Metadata Rules

- Package name: `@senad-d/commitme`.
- Display name: `CommitMe`.
- Author: `Senad Dizdarević <112484166+senad-d@users.noreply.github.com>`.
- Keep `pi.extensions` pointed at `./src/extension.ts` unless the entrypoint moves.
- Keep Pi core packages in `peerDependencies` with `"*"`:
  - `@earendil-works/pi-coding-agent`
  - `@earendil-works/pi-ai` if `StringEnum` is imported
  - `typebox`
- Put non-Pi runtime libraries in `dependencies` only if truly needed.
- Put local development tools in `devDependencies`.
- Keep `pi-package`, `pi-extension`, and commit-message-related keywords.

## Documentation Rules

- README must distinguish planned/prepared behavior from implemented behavior until feature work is complete.
- README must document `/commitme`, `/commitme --confirm`, and `/commitme help` when implemented.
- SECURITY must document local git/file reads, git mutation in commit mode, no push, no telemetry, and no non-LLM network APIs.
- CHANGELOG must record preparation and later implementation changes.
- `docs/STRUCTURE.md` must match the actual file layout.
- Keep docs concise and direct.

## Testing Rules

- Test pure functions without requiring Pi runtime when possible.
- Use temporary git repositories for git integration tests.
- Test both staged and unstaged changes.
- Test no-change and non-git-repository errors.
- Test truncation boundaries.
- Test sensitive-file filtering.
- Test command flag parsing:
  - no flags = commit all
  - `--confirm` = ask before commit
  - `help` = show usage
- Test package metadata and Pi manifest.
- Do not write tests that require real network APIs.

## Security and Privacy Rules

- Treat repository contents as potentially sensitive.
- Do not log raw diffs or secret-like content to persistent files.
- Do not send telemetry.
- Do not call external network APIs other than the active Pi LLM provider used by Pi itself.
- Do not read credentials or `.env` contents intentionally.
- Do not run arbitrary shell commands; use `git` only for the initial design.
- Commit mode is explicitly user-triggered by `/commitme`.
- Confirmation is controlled by `--confirm`; do not add hidden prompts in default mode.
- Never run `git push`.

## Isolated Smoke-Test Rules

Use isolated extension loading for manual checks:

```bash
pi --no-extensions -e .
```

Do not use `pi -e .` for validation unless intentionally testing interactions with the user's other configured extensions.

## Acceptance Criteria

- Implementation follows Pi extension package conventions.
- Core logic is testable without Pi UI.
- Commit mode is explicit and documented.
- Prompt and context are optimized for fast weak-model workflows.
- Security-sensitive behavior is visible in docs and tests.
- Validation commands pass before release.

## Validation Commands

- `npm run typecheck` - Type-check TypeScript.
- `npm run test` - Run tests.
- `npm run check:pack` - Check package contents.
- `npm run validate` - Run all configured checks.
- `pi --no-extensions -e .` - Isolated manual smoke test.

## Notes

This guidelines spec is binding for the later implementation session unless superseded by an explicit user decision.
