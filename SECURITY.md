# Security Policy

## Trust model

CommitMe is a Pi extension package. Pi extensions run with the full local permissions of the user account that starts Pi. Review extension source before installing it, pin versions in sensitive environments, and install only from trusted sources.

```bash
pi install npm:@senad-d/commitme@<version>
pi install git:https://github.com/senad-d/commitme@<tag>
```

## Planned security behavior

Runtime feature implementation is pending. The approved design requires these boundaries:

- Draft mode reads local git and project context only.
- Commit mode is explicit via `/commitme --commit`.
- Commit mode stages all changes with `git add -A` and creates a local git commit.
- Confirmation is requested only when `--confirm` is set.
- CommitMe must never run `git push`.
- CommitMe must not send telemetry.
- CommitMe must not call non-LLM network APIs.
- CommitMe must avoid intentionally reading secret files such as `.env` files, private keys, and credential stores.
- CommitMe uses the active Pi LLM provider through Pi for message drafting.

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
