# CommitMe

CommitMe is a TypeScript [Pi](https://pi.dev/) extension that creates clear Conventional Commit messages from local git changes and commits them.

It gathers staged and unstaged git context, trims noisy diffs, adds small project metadata, asks the active Pi model for one commit message, then creates a local git commit.

CommitMe follows Lightweight Conventional Commits:

```text
<type>(optional-scope): <summary>

[optional body]

[optional footer]
```

Allowed types are `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `build`, `ci`, `perf`, `style`, and `revert`. Summaries should be imperative, clear, specific, and must not end with a period.

## Usage

Load the extension locally:

```bash
pi --no-extensions -e .
```

Then run:

```text
/commitme
/commitme --confirm
/commitme help
```

Behavior:

- `/commitme` drafts a Conventional Commit message, runs `git add -A`, and creates a local commit.
- `/commitme --confirm` asks before staging and committing.
- `/commitme help` explains usage, commit standards, and safety behavior.
- CommitMe aborts before staging if known secret files or high-confidence secret tokens would be committed, or if git status changes after context gathering.
- CommitMe never pushes.

The `commitme` tool is also available to agents. Use `action: "gather"` to collect compact read-only commit context, or `action: "commit"` with an explicit `message` to create a commit. Commit actions use the same sensitive-file and git-status-change guards as `/commitme`.

## Context gathered

CommitMe collects a compact bundle from the current repository:

- current branch and porcelain status
- staged and unstaged diff stats
- staged and unstaged changed paths
- bounded, redacted diff excerpts
- small project metadata such as `package.json`, README, and common build config files
- safe snippets from changed text files
- truncation metadata and visible truncation notices

Untracked directories are expanded to individual files before filtering. The final model prompt is bounded and keeps a commit-message output reminder when truncation is required.

Sensitive paths such as `.env`, `.envrc`, private keys, kubeconfigs, credentials, generated/binary paths, unreadable files, and files with obvious secret-like content are listed by path/status when relevant but not read into model context. Ordinary source files that contain placeholder words like `TOKEN=not-real` are redacted for model context but are not blocked from committing. Commit actions refuse to stage known secret files or high-confidence token patterns; remove them from the commit or commit them manually if intentional.

## Development

```bash
npm install
npm run validate
```

Useful checks:

```bash
npm run typecheck
npm run lint
npm run format:check
npm run test
npm run check:pack
pi --no-extensions -e .
```

## Packaging notes

- Pi loads TypeScript through its runtime, so this package does not compile to `dist/` by default.
- Pi core packages are listed in `peerDependencies` with `"*"`.
- Non-Pi runtime libraries should be added to `dependencies` only when needed.
