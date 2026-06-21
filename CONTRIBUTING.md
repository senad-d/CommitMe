# Contributing

CommitMe is a prepared Pi extension project. Runtime feature implementation should follow the approved brief and specs before changing behavior.

## Development setup

CommitMe requires Node.js `>=22.19.0`.

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

## Implementation workflow

1. Read `docs/PROJECT_DEFINITION_BRIEF.md`.
2. Read the three specs in `specs/`.
3. Implement `specs/spec-tasks.md` one checkbox at a time.
4. Update tests and documentation with each behavior change.
5. Run validation before requesting review.

## Pull requests

- Keep changes focused and explain user-visible behavior.
- Update README/docs/examples when commands, tools, settings, packaging, or security behavior changes.
- Run `npm run validate` before requesting review, or explain why it could not be run.
- Do not commit secrets, local `.pi/` state, generated package tarballs, `node_modules/`, or machine-local paths.

## Security expectations

Pi extensions run with the user's local permissions. Treat changes that execute shell commands, read files, write files, or call the network as security-sensitive and document the behavior.

For CommitMe specifically, document and test any changes to git execution, file context selection, commit mutation, and confirmation behavior.
