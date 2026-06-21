# Project Definition Brief

Approved during preparation on 2026-06-21.

## 1. Bootstrap

- Template source: `/Users/senad/Documents/Code/Moj_git/pi-tmp`
- Target directory: `/Users/senad/Documents/Code/Moj_git/commitme`
- Copy status: copied successfully into a repository that only had `.git`.

## 2. Project identity

- Package name: `@senad-d/commitme`
- Display name: `CommitMe`
- Exported extension function: `commitMeExtension`
- Repository URL: `https://github.com/senad-d/commitme` assumed until corrected.
- One-sentence pitch: CommitMe quickly gathers git diff and project context so even weaker/local models can draft or create clear Conventional Commit messages.

## 3. Users and use cases

- Primary users: Pi users working in local git repositories.
- Primary use cases:
  - Draft a precise Conventional Commit message from staged and unstaged changes.
  - Programmatically gather relevant git/project context before prompting the LLM.
  - Optionally stage all changes and commit with the generated message.
- Non-goals:
  - No automatic background commits.
  - No remote APIs beyond the active Pi LLM provider.
  - No telemetry.
  - No complex UI widgets in the first implementation.

## 4. Pi integration surface

| Surface | Name | Purpose | Notes |
| --- | --- | --- | --- |
| Command | `/commitme` | Gather context and ask the LLM for a commit message | Planned, not implemented during preparation |
| Command flag | `--commit` | Stage all changes and commit using the generated message | Planned |
| Command flag | `--confirm` | Ask for confirmation before committing | Planned; default is no confirmation |
| Tool | `commitme` | Gather commit context and/or perform final git commit action | Planned |
| Event | none initially | No background behavior | Avoid long-lived resources |
| UI | confirmation dialog only | Used only when `--confirm` is set | No custom UI |
| Resource | none | No skills/prompts/themes initially | Keep extension simple |

## 5. Architecture

- Planned files:
  - `src/extension.ts` — small entrypoint.
  - `src/commands/commitme-command.ts` — planned command registration.
  - `src/tools/commitme-tool.ts` — planned tool schema and execution.
  - `src/git/context.ts` — planned git status/diff/context gathering.
  - `src/git/commit.ts` — planned stage-all and commit helper.
  - `src/prompt/build-commit-prompt.ts` — planned weak-model-friendly prompt builder.
  - `src/utils/truncation.ts` — planned truncation helpers.
- Module boundaries:
  - Command orchestrates user intent.
  - Tool exposes LLM-callable context/commit behavior.
  - Git modules do local git reads/mutations.
  - Prompt module formats compact deterministic context.
- Dependencies:
  - Keep Pi peer dependencies.
  - Prefer Node built-ins and no extra runtime dependencies.

## 6. Config, state, and persistence

- Config source: none initially.
- Session state: no persistent state; tool result `details` can store branch, changed files, and truncation metadata.
- Files written:
  - None for draft mode.
  - Git index and git commit object when commit mode runs.
- Cleanup behavior: no long-lived resources.

## 7. Security and privacy

- Shell execution: local `git` commands only via `pi.exec`.
- File access/mutation: read project metadata and changed files; mutate only via `git add -A` and `git commit` when commit mode is requested.
- Network access: none except active Pi LLM provider.
- Credentials/secrets: do not intentionally read env/secrets; avoid `.env` content.
- Telemetry/retention: none.
- User confirmations: only when `--confirm` flag is set.

## 8. Documentation and packaging

- README changes: describe planned usage, flags, security behavior, and pending implementation.
- SECURITY changes: document local git/file access and no telemetry.
- CHANGELOG changes: initial prepared project entry.
- package.json changes:
  - name `@senad-d/commitme`
  - author `Senad Dizdarević <112484166+senad-d@users.noreply.github.com>`
  - description/keywords updated for CommitMe.
- npm/git distribution plan: npm package under `@senad-d`, repository assumed GitHub unless corrected.

## 9. Validation plan

- Typecheck: `npm run typecheck`
- Tests: preparation-level tests for package metadata/spec presence/placeholders.
- Package dry-run: `npm run check:pack`
- Isolated Pi smoke test: `pi --no-extensions -e .`

## 10. Open questions and assumptions

- Questions:
  - Confirm repository URL: `https://github.com/senad-d/commitme`?
  - Confirm security contact before public publishing.
- Assumptions:
  - `/commitme` drafts only.
  - `/commitme --commit` stages all changes and commits without confirmation.
  - `/commitme --commit --confirm` asks before `git add -A` and `git commit`.
  - Tool name is exactly `commitme`.
  - MIT license is retained from the template.
- Decisions:
  - Optimize for speed and weaker/local models.
  - Gather both staged and unstaged changes.
  - Use Conventional Commit format.
  - No telemetry or non-LLM network calls.
