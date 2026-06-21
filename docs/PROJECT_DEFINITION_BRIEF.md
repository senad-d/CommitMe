# Project Definition Brief

Approved during preparation on 2026-06-21.

## 1. Bootstrap

- Template source: local Pi extension template repository (path omitted).
- Target directory: local `commitme` repository checkout (path omitted).
- Copy status: copied successfully into a repository that only had `.git`.

## 2. Project identity

- Package name: `@senad-d/commitme`
- Display name: `CommitMe`
- Exported extension function: `commitMeExtension`
- Repository URL: `https://github.com/senad-d/commitme` assumed until corrected.
- One-sentence pitch: CommitMe quickly gathers git diff and project context so even weaker/local models can draft or create clear Lightweight Conventional Commit messages.

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
| Command | `/commitme` | Gather context, ask the LLM for a commit message, and create a local commit | Implemented after preparation |
| Command flag | `--confirm` | Ask for confirmation before committing | Implemented after preparation; default is no confirmation |
| Tool | `commitme` | Gather commit context and/or perform final git commit action | Implemented after preparation |
| Event | none initially | No background behavior | Avoid long-lived resources |
| UI | confirmation dialog only | Used only when `--confirm` is set | No custom UI |
| Resource | none | No skills/prompts/themes initially | Keep extension simple |

## 5. Architecture

- Implemented files:
  - `src/extension.ts` — small entrypoint.
  - `src/commands/commitme-command.ts` — command registration and flow.
  - `src/tools/commitme-tool.ts` — tool schema and execution.
  - `src/git/context.ts` — git status/diff/context gathering.
  - `src/git/commit.ts` — stage-all and commit helper.
  - `src/prompt/build-commit-prompt.ts` — weak-model-friendly prompt builder.
  - `src/utils/truncation.ts` — truncation helpers.
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
  - None for tool gather mode.
  - Git index and git commit object when `/commitme` or tool commit mode runs.
- Cleanup behavior: no long-lived resources.

## 7. Security and privacy

- Shell execution: local `git` commands only via `pi.exec`.
- File access/mutation: read project metadata and changed files; mutate only via `git add -A` and `git commit` when commit mode is requested.
- Network access: none except active Pi LLM provider.
- Credentials/secrets: do not intentionally read env/secrets; avoid `.env` content.
- Telemetry/retention: none.
- User confirmations: only when `--confirm` flag is set.

## 8. Documentation and packaging

- README changes: document implemented usage, flags, context boundaries, and security behavior.
- SECURITY changes: document local git/file access, confirmation behavior, secret filtering, and no telemetry.
- CHANGELOG changes: track implemented behavior and review hardening.
- package.json changes:
  - name `@senad-d/commitme`
  - author `Senad Dizdarević <112484166+senad-d@users.noreply.github.com>`
  - description/keywords/gallery metadata updated for CommitMe.
- npm/git distribution plan: npm package under `@senad-d`, repository assumed GitHub unless corrected.

## 9. Validation plan

- Typecheck: `npm run typecheck`
- Tests: Node test suite covering arguments, command/tool flows, git context, commit behavior, prompt building, package metadata, and truncation.
- Package dry-run: `npm run check:pack`
- Isolated Pi smoke test: `pi --no-extensions -e .`

## 10. Open questions and assumptions

- Questions:
  - Confirm repository URL: `https://github.com/senad-d/commitme`?
  - Confirm security contact before public publishing.
- Assumptions:
  - `/commitme` stages all changes and commits without confirmation.
  - `/commitme --confirm` asks before `git add -A` and `git commit`.
  - Tool name is exactly `commitme`.
  - MIT license is retained from the template.
- Decisions:
  - Optimize for speed and weaker/local models.
  - Gather both staged and unstaged changes.
  - Use the team Lightweight Conventional Commits standard.
  - No telemetry or non-LLM network calls.
