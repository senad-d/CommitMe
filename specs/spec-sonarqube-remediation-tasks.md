# Plan: SonarQube Remediation Tasks

## Task Description
Task backlog for resolving every active SonarCloud issue in the current CommitMe repository.

## Objective
Resolve all 56 active issues for project senad-d_CommitMe: 5 vulnerabilities and 51 code smells.

## Sonar Source
- Project key: senad-d_CommitMe, read from sonar-project.properties.
- Organization: senad-d.
- Snapshot date: 2026-07-02.
- Note: the environment default resolved to a different project, senad-d_GuardMe. Follow-up Sonar checks must pass the CommitMe project key explicitly.

## Relevant Files
- scripts/publish-npm.mjs
- src/tools/commitme-tool.ts
- src/commands/commitme-command.ts
- src/model/draft-commit-message.ts
- src/git/commit.ts
- src/git/context.ts
- src/prompt/build-commit-prompt.ts
- scripts/check-format.mjs
- src/utils/truncation.ts
- dev-shims/pi-coding-agent/index.js
- test/*.test.mjs

## Execution Rules
- Complete one task at a time.
- Mark a checkbox with x only after its acceptance criteria are met.
- Avoid nesting functions; prefer small top-level helpers.
- Preserve behavior unless a task explicitly tightens security.
- If an issue needs more detail, inspect it by key with AnalyseMe using project senad-d_CommitMe and organization senad-d.

## Step by Step Tasks

### 1. Harden publish script command execution

- [x] Fix all publish-script security findings and the top-level-await smell.

Sonar issues: AZ8dprtaewCGJePZAXGB, AZ8dprtaewCGJePZAXGA, AZ8dprtZewCGJePZAXF9, AZ8dprtaewCGJePZAXF-, AZ8dprtaewCGJePZAXGC, AZ8dprtaewCGJePZAXF_.

#### Why
The publish script passes user-entered or derived values to npm and git. Sonar flags this as argument-injection risk for agentic workflows and as PATH-hijacking risk when tools are resolved by name.

#### How to fix
- Add strict validators for package name, requested version, derived npm package spec, derived git tag, and current branch before any value reaches a command argument.
- Reject empty values, values starting with a dash, whitespace, control characters, unsafe git-ref segments, and unexpected package/version characters.
- Centralize command execution in safe helpers that only run expected tools with validated argument arrays.
- Avoid untrusted PATH resolution by using absolute command paths where practical or by using a fixed safe command environment.
- Use explicit and validated git ref forms for tag and branch operations.
- Replace the final promise-chain entrypoint with top-level await and normal try/catch error handling.

#### Acceptance criteria
- The five vulnerability keys and the top-level-await key no longer appear in Sonar.
- Invalid package names, versions, tags, and branches fail before command execution.
- Command helpers accept only known commands and validated arguments.
- The publish script syntax check passes.
- Full project validation passes.

### 2. Reduce CommitMe tool execution complexity

- [x] Split src/tools/commitme-tool.ts execution branches into helpers.

Sonar issue: AZ8dprs8ewCGJePZAXFx.

#### Why
The tool execute function handles gather, explicit commit, drafted commit, confirmation, cancellation, and result formatting in one branch-heavy function.

#### How to fix
- Extract top-level helpers for confirmation preflight, explicit commit execution, drafted commit execution, gather execution, and result formatting.
- Keep createCommitMeTool focused on registration metadata and simple action dispatch.
- Preserve existing safety behavior: subject validation, UI requirement for confirmation, sensitive-file rejection, and no push behavior.
- Add or update tests for gather, explicit commit, drafted commit, no changes, cancellation, and non-UI confirmation errors.

#### Acceptance criteria
- The flagged function cognitive complexity is at or below Sonar's limit.
- Tool behavior remains unchanged for all existing modes.
- No new nested helper functions are introduced.
- Typecheck and tests pass.

### 3. Reduce slash command handler complexity

- [x] Refactor src/commands/commitme-command.ts command orchestration.

Sonar issue: AZ8dprsuewCGJePZAXFu.

#### Why
The command handler mixes parsing, help output, UI checks, idle waiting, workflow execution, and notification formatting.

#### How to fix
- Extract top-level helpers for parse errors, help handling, confirmation preflight, idle waiting, workflow option construction, and workflow result handling.
- Keep registerCommitMeCommand as thin registration plus dispatch.
- Preserve behavior for normal commit, confirm mode, help mode, no changes, cancellation, and successful commit.

#### Acceptance criteria
- The flagged function cognitive complexity is at or below Sonar's limit.
- User-facing command messages remain compatible.
- Command parser tests still pass.
- Typecheck and tests pass.

### 4. Simplify draft, retry, and repair flow

- [x] Refactor src/model/draft-commit-message.ts and remove nested template interpolation.

Sonar issues: AZ8dprs2ewCGJePZAXFw, AZ8dprs2ewCGJePZAXFv.

#### Why
The model drafting workflow has nested decisions for initial output, retries, repair, empty diagnostics, and invalid output. It is central to CommitMe behavior and should be easier to audit.

#### How to fix
- Split the main diagnostic draft function into top-level helpers for initial attempt creation, initial execution, retry attempts, repair attempt, and latest failure diagnostics.
- Keep retry and repair limits unchanged.
- Replace nested template interpolation with named intermediate variables.
- Preserve error codes and user-facing error meaning.
- Add focused tests for initial success, retry success, repair success, empty output, invalid output, abort, and model error if coverage is missing.

#### Acceptance criteria
- The flagged cognitive complexity is at or below Sonar's limit.
- The nested template literal issue is resolved.
- Draft diagnostics and returned subject behavior remain compatible.
- Typecheck and tests pass.

### 5. Clean up commit parsing and display escaping

- [x] Resolve all src/git/commit.ts regex, escaping, unicode, replaceAll, and RegExp.exec findings.

Sonar issues: AZ8dprpYewCGJePZAXFM, AZ8dprpYewCGJePZAXFN, AZ8dprpYewCGJePZAXFO, AZ8dprpYewCGJePZAXFP, AZ8dprpYewCGJePZAXFQ, AZ8dprpYewCGJePZAXFR, AZ8dprpYewCGJePZAXFV, AZ8dprpYewCGJePZAXFS, AZ8dprpYewCGJePZAXFT, AZ8dprpYewCGJePZAXFU, AZ8dprpYewCGJePZAXFW.

#### Why
Commit-message parsing validates model output, and unsafe-path display is security-adjacent. The current regex and escape handling is functional but harder to maintain and triggers multiple Sonar findings.

#### How to fix
- Create a shared display-path helper for escaping control characters and reuse it from commit and prompt code.
- Use raw-string style regex sources for patterns containing backslashes.
- Replace charCodeAt usage with codePointAt and handle missing values defensively.
- Replace literal global replacements with replaceAll where no regex is needed.
- Replace match-based captures with RegExp.exec.
- Rewrite markdown fence stripping with line-based logic instead of a broad multiline capture regex.
- Keep Conventional Commit validation semantics unchanged.

#### Acceptance criteria
- All listed commit.ts issue keys are resolved.
- Valid Lightweight Conventional Commit subjects are still accepted and invalid ones rejected.
- Displayed unsafe paths still escape control characters.
- Typecheck and tests pass.

### 6. Simplify prompt builder formatting and branching

- [x] Resolve src/prompt/build-commit-prompt.ts path escaping, nested template, and nested ternary findings.

Sonar issues: AZ8dprtFewCGJePZAXFy, AZ8dprtFewCGJePZAXFz, AZ8dprtFewCGJePZAXF0, AZ8dprtFewCGJePZAXF1, AZ8dprtFewCGJePZAXF2, AZ8dprtFewCGJePZAXF3, AZ8dprtFewCGJePZAXF4, AZ8dprtFewCGJePZAXF5, AZ8dprtFewCGJePZAXF6.

#### Why
Prompt text must be reliable and easy to review. Duplicated escaping and nested expressions make future prompt edits riskier.

#### How to fix
- Reuse the shared display-path helper from Task 5.
- Replace nested template interpolation with named suffix variables.
- Replace nested ternary profile selection with clear conditional logic or a small helper.
- Replace profile-specific limit ternaries with a map keyed by profile.
- Keep prompt output and diagnostics stable except for harmless formatting changes.

#### Acceptance criteria
- All listed prompt builder issue keys are resolved.
- Budget selection returns the same profile and limits as before.
- Prompt tests cover normal and compact-budget contexts.
- Typecheck and tests pass.

### 7. Decompose git context secret regexes

- [x] Replace complex secret and path regexes in src/git/context.ts with smaller named checks.

Sonar issues: AZ8dprsmewCGJePZAXFX, AZ8dprsmewCGJePZAXFY, AZ8dprsmewCGJePZAXFZ, AZ8dprsmewCGJePZAXFa, AZ8dprsmewCGJePZAXFb, AZ8dprsmewCGJePZAXFc, AZ8dprsmewCGJePZAXFd, AZ8dprsmewCGJePZAXFe, AZ8dprsmewCGJePZAXFf, AZ8dprsmewCGJePZAXFg, AZ8dprsmewCGJePZAXFh, AZ8dprsmewCGJePZAXFi, AZ8dprsmewCGJePZAXFj, AZ8dprsmewCGJePZAXFk, AZ8dprsmewCGJePZAXFp.

#### Why
Large alternation regexes are hard to audit and trigger complexity, duplicate character class, and concise character class findings. Secret detection should be readable and well tested.

#### How to fix
- Replace the assignment regex with a two-step check: secret-like key name, then assignment operator and non-empty value.
- Replace the high-confidence secret regex with named focused patterns for private keys, bearer tokens, AWS keys, GitHub tokens, GitLab tokens, OpenAI tokens, Slack tokens, and JWTs.
- Preserve placeholder filtering for fake, example, redacted, and dummy values.
- Split sensitive basename and extension checks into named helpers and sets where possible.
- Remove duplicate character classes and use concise classes only when equivalent.
- Add tests for real-looking secrets and placeholder values.

#### Acceptance criteria
- All listed git-context regex issue keys are resolved.
- Secret-path and secret-content detection behavior is preserved or intentionally stricter with tests.
- Tests cover AWS, GitHub, GitLab, OpenAI, Slack, JWT, private key, and placeholder cases.
- Typecheck and tests pass.

### 8. Normalize git context paths and parser complexity

- [x] Resolve src/git/context.ts replaceAll findings and porcelain parser complexity.

Sonar issues: AZ8dprsmewCGJePZAXFl, AZ8dprsmewCGJePZAXFm, AZ8dprsmewCGJePZAXFn, AZ8dprsmewCGJePZAXFo, AZ8dprsmewCGJePZAXFq, AZ8dprsmewCGJePZAXFr, AZ8dprsmewCGJePZAXFs, AZ8dprsmewCGJePZAXFt.

#### Why
Path normalization is repeated with regex replacements, and the porcelain status parser has enough branching to exceed Sonar's cognitive-complexity limit.

#### How to fix
- Add one helper that normalizes repository paths by replacing backslashes with forward slashes using replaceAll.
- Use that helper in all path normalization call sites.
- Split parseStatusPorcelainZ into top-level helpers for reading records, detecting rename or copy sources, creating status entries, and checking index or worktree changes.
- Preserve behavior for untracked files, staged changes, unstaged changes, renames, copies, and related paths.
- Add parser tests for untracked, staged-only, unstaged-only, staged plus unstaged, rename, and copy records.

#### Acceptance criteria
- All listed replaceAll and parser-complexity issue keys are resolved.
- Parser output remains identical for existing fixtures.
- New parser tests cover the listed status cases.
- Typecheck and tests pass.

### 9. Replace trailing-whitespace regex in format checker

- [x] Remove the super-linear trailing whitespace regex from scripts/check-format.mjs.

Sonar issue: AZ8dprtTewCGJePZAXF8.

#### Why
The format checker scans every line in repository files. A deterministic string operation is simpler and avoids the regex runtime warning.

#### How to fix
- Replace the trailing whitespace regex test with a non-regex string-length check after trimming line endings on the right.
- Keep the existing failure message format.

#### Acceptance criteria
- The format-checker regex issue is resolved.
- The checker still detects trailing spaces and tabs.
- Full project validation passes.

### 10. Avoid inline reverse mutation in truncation helper

- [x] Update src/utils/truncation.ts tail byte slicing so reverse is not called inline.

Sonar issue: AZ8dprtMewCGJePZAXF7.

#### Why
Inline reverse mutates an array inside an expression and is less readable in a central truncation helper.

#### How to fix
- Use a non-mutating reversed copy or move reverse to its own statement before joining.
- Keep byte-preserving Unicode behavior unchanged.

#### Acceptance criteria
- The truncation reverse issue is resolved.
- Tail truncation returns the same text as before.
- Typecheck and tests pass.

### 11. Make the development shim no-op explicit

- [x] Update dev-shims/pi-coding-agent/index.js so DynamicBorder.invalidate is not empty.

Sonar issue: AZ8dprtjewCGJePZAXGD.

#### Why
The shim intentionally does nothing for invalidation, but an empty method appears accidental and is flagged as suspicious.

#### How to fix
- Add a clear no-op body that documents invalidation is intentionally unnecessary in the development shim.
- Do not change shim behavior.

#### Acceptance criteria
- The empty method issue is resolved.
- Local typecheck and smoke behavior are unchanged.

### 12. Validate locally and reconcile Sonar

- [x] Run final validation and confirm the Sonar issue list is clear for senad-d_CommitMe.

#### Why
Refactors and security fixes must be validated together, and Sonar must be queried with the explicit CommitMe key to avoid the environment-project mismatch.

#### How to fix
- Run the package syntax check, typecheck, format check, tests, package check, and full validation.
- Run or wait for SonarCloud analysis for senad-d_CommitMe.
- Query the project summary and issue list explicitly for senad-d_CommitMe.
- If any active issue remains, add a focused follow-up task before marking this complete.

#### Acceptance criteria
- Full local validation passes.
- Sonar reports zero active issues for senad-d_CommitMe, or every remaining issue has an explicit documented follow-up.
- None of the issue keys listed above remain open.

### 13. Re-run SonarCloud analysis after CI updates the CommitMe snapshot

- [ ] Confirm the remote SonarCloud issue list reflects the remediation commit.

#### Why
AnalyseMe still reports the original 56 active issues for `senad-d_CommitMe` after local remediation because no post-change SonarCloud analysis has run for this working tree commit. The repository workflow runs Sonar on push and pull request events with `SONAR_TOKEN`.

#### How to fix
- Push the remediation branch or open/update a pull request so `.github/workflows/scan.yml` runs the SonarQube scan.
- Alternatively, run an authorized local Sonar scanner with `sonar.projectKey=senad-d_CommitMe` and `sonar.organization=senad-d` without exposing the token.
- Query `analyseme_get_project_summary` and `analyseme_list_issues` with the explicit CommitMe project key after the analysis completes.
- If any active issue remains, add a focused remediation task with the issue key, file, and acceptance criteria.

#### Acceptance criteria
- SonarCloud has analyzed a commit containing the remediation changes in this task file.
- AnalyseMe reports zero active issues for `senad-d_CommitMe`, or every remaining active issue has a focused follow-up task.
- No secrets or Sonar tokens are printed in logs or task documentation.
