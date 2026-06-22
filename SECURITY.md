# Security Policy

## Trust model

CommitMe is a Pi extension package. Pi extensions run with the full local permissions of the user account that starts Pi. Review extension source before installing it, pin versions in sensitive environments, and install only from trusted sources.

```bash
pi install npm:@senad-d/commitme@<version>
pi install git:https://github.com/senad-d/commitme@<tag>
```

## Runtime security behavior

- `/commitme` is an explicit user-triggered commit command: it reads git/project context, drafts a bounded subject-line prompt with the active Pi LLM provider, validates and normalizes the final one-line subject, stages the gathered changed paths, and creates a local git commit with `git commit`.
- `/commitme --confirm` requests confirmation before staging and committing.
- Tool `action: "gather"` is read-only and returns compact commit context.
- Tool `action: "commit"` requires an explicit final one-line subject and creates a local commit.
- Commit actions abort before staging if known secret files or high-confidence secret tokens would be committed or if the drafted subject cannot be validated after cleanup/retry/repair; they recheck the current working tree for unsafe content immediately before staging, stop if git status changes after context gathering, and avoid staging unrelated paths that appear after the final changed-file scan.
- Oversized, generated, binary-looking, renamed, and symlinked changed files are omitted from model context when appropriate; CommitMe still scans regular local file content for high-confidence secret tokens before staging, and symlinks to sensitive repository paths are treated as unsafe.
- Confirmation is requested only when `--confirm` or tool `confirm: true` is set. UI confirmation modes fail before context gathering or model drafting when no UI is available.
- CommitMe never runs `git push`.
- CommitMe does not send telemetry.
- CommitMe does not call non-LLM network APIs.
- CommitMe uses only the active Pi LLM provider for command message drafting, including one safe retry or repair prompt when needed.
- Drafting diagnostics are non-sensitive: they report stop reason, content block type counts, text length, token usage totals when available, and prompt truncation metadata. They do not include raw prompts, raw diffs, file contents, secrets, or raw model output.
- CommitMe avoids intentionally reading secret files such as `.env`, `.envrc`, private keys, kubeconfigs, and credential stores.
- Sensitive, generated, binary-looking, unreadable, overly large, symlinked, or secret-like changed-file contents may be listed by path/status but are omitted from model context. Generated and binary-looking regular files are still locally checked for high-confidence token patterns before commit actions stage changes.
- Diff excerpts are collected with Git external diff and textconv disabled, then filtered through path checks, content checks, and line-level redaction before they are sent to the active Pi LLM provider.

## Reporting vulnerabilities

Please report suspected security vulnerabilities privately by email: <senad.dizdarevic@proton.me>.

For non-sensitive issues, use the repository issue tracker:

<https://github.com/senad-d/commitme/issues>

Do not open public issues for security-sensitive reports that include exploit details, private repository contents, secrets, or credentials.

## Secure development checklist

- Do not commit secrets, tokens, local `.pi/` state, or generated artifacts.
- Document any file, shell, network, or credential access added by the extension.
- Avoid starting background resources in the extension factory.
- Keep package contents minimal with `npm run check:pack`.
- Use isolated smoke tests with `pi --no-extensions -e .`.
