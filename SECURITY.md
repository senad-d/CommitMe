# Security Policy

## Trust model

CommitMe is a Pi extension package. Pi extensions run with the full local permissions of the user account that starts Pi. Review extension source before installing it, pin versions in sensitive environments, and install only from trusted sources.

```bash
pi install npm:@senad-d/commitme@<version>
pi install git:https://github.com/senad-d/commitme@<tag>
```

## Runtime security behavior

- `/commitme` is an explicit user-triggered commit command: it reads git/project context, drafts a bounded message prompt with the active Pi LLM provider, stages all changes with `git add -A`, and creates a local git commit with `git commit`.
- `/commitme --confirm` requests confirmation before staging and committing.
- Tool `action: "gather"` is read-only and returns compact commit context.
- Tool `action: "commit"` requires an explicit final message and creates a local commit.
- Commit actions abort before staging if known secret files or high-confidence secret tokens would be committed, or if git status changes after context gathering.
- Confirmation is requested only when `--confirm` or tool `confirm: true` is set.
- CommitMe never runs `git push`.
- CommitMe does not send telemetry.
- CommitMe does not call non-LLM network APIs.
- CommitMe uses only the active Pi LLM provider for command message drafting.
- CommitMe avoids intentionally reading secret files such as `.env`, `.envrc`, private keys, kubeconfigs, and credential stores.
- Sensitive, generated, binary, unreadable, overly large, or secret-like changed files may be listed by path/status but their contents are omitted from model context.
- Diff excerpts are filtered through path checks, content checks, and line-level redaction before they are sent to the active Pi LLM provider.

## Reporting vulnerabilities

Before public publishing, add a private security contact or vulnerability disclosure process here.

For non-sensitive issues during early development, use the repository issue tracker:

<https://github.com/senad-d/commitme/issues>

Do not open public issues for security-sensitive reports that include exploit details, private repository contents, secrets, or credentials.

## Secure development checklist

- Do not commit secrets, tokens, local `.pi/` state, or generated artifacts.
- Document any file, shell, network, or credential access added by the extension.
- Avoid starting background resources in the extension factory.
- Keep package contents minimal with `npm run check:pack`.
- Use isolated smoke tests with `pi --no-extensions -e .`.
