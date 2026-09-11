Read the live specification @docs/spec.md if needed.

## Agent skills

- Issues: markdown files under `docs/scratch/<feature>/`. See `docs/agents/issue-tracker.md`.
- Triage labels: five roles, label string equals role name. See `docs/agents/triage-labels.md`.
- Domain docs: `CONTEXT.md` plus `docs/adr/` at repo root. See `docs/agents/domain.md`.

## General rules

- Commits and PRs: commit small and often, 400 changed lines per pull request, split into several
  PRs per ticket if needed. PR titles should always start by a verb. PR description should be
  concise only relevant info. Use conventional commit naming for commits, branch names, and PR
  titles.
- Work trees go in .claude.
- Docs writing: minimal. Facts as short bullets, no tables unless the data is a real grid, no
  restating what the fact already says. One line per fact. Cut consequences and commentary unless
  asked for them.
- Never commit my email address, account ids, organization ids, API keys or any other personal
  information. Redact them as `<redacted>` in evidence files, logs and pasted command output before
  staging. Scan the diff for them before every commit.
