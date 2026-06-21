# CommitMe

CommitMe is a planned TypeScript [Pi](https://pi.dev/) extension for creating clear, precise Conventional Commit messages from local git changes.

> Current status: repository preparation is complete, but the runtime feature is intentionally not implemented yet. The planned `/commitme` command and `commitme` tool are documented in specs and placeholders only.

## Goal

CommitMe will gather git diff and project context programmatically, format a compact prompt, and use the active Pi LLM provider to draft a commit message. It is designed to stay fast and simple enough for weaker or local models.

## Planned behavior

- `/commitme` drafts a Conventional Commit message from both staged and unstaged changes.
- `/commitme --commit` stages all changes with `git add -A` and commits with the generated message.
- `/commitme --commit --confirm` asks before staging and committing.
- The `commitme` Pi tool gathers the same context for agent-driven workflows.
- Draft mode is read-only.
- Commit mode never pushes.

## Planned context gathering

CommitMe will collect a compact, deterministic context bundle:

- current branch and git status
- staged and unstaged diff summaries
- changed file paths and statuses
- bounded diff excerpts
- relevant project files such as `package.json`, README, and common build/config files
- safe snippets from changed text files
- truncation metadata when context is too large

Sensitive files such as `.env` files and private keys should be listed by path/status only when relevant, not read for contents.

## Development setup

```bash
npm install
npm run validate
```

Useful commands:

```bash
npm run typecheck
npm run test
npm run check:pack
pi --no-extensions -e .
```

Use isolated loading for smoke tests so other configured Pi extensions do not interfere:

```bash
pi --no-extensions -e .
```

## Implementation handoff

Before implementing features, read:

- `docs/PROJECT_DEFINITION_BRIEF.md`
- `specs/spec-architecture.md`
- `specs/spec-guidelines.md`
- `specs/spec-tasks.md`

Then implement `specs/spec-tasks.md` one checkbox at a time. Keep all preparation-only checkboxes unchanged until real implementation work is done in a separate session.

## Packaging notes

- Pi loads TypeScript through its runtime, so this package does not compile to `dist/` by default.
- Pi core packages are listed in `peerDependencies` with `"*"`.
- Non-Pi runtime libraries should be added to `dependencies` only when needed.
