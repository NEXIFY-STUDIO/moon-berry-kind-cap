# CI status

## Source of truth

| Gate | Command | Status |
|------|---------|--------|
| Typecheck | `npm run typecheck` | required |
| Unit + integration | `npm run test:unit` | required (271 tests) |
| Production build | `npm run build` | required |
| One-shot | `npm run ci:verify` | runs all three + posts GitHub status |

## GitHub Actions

GitHub-hosted runners on this account currently fail at **startup** with:

> The job was not started because your account is locked due to a billing issue.

Until billing is unlocked:

1. `.github/workflows/ci.yml` is **manual only** (`workflow_dispatch`) so pushes do not create red X marks.
2. Local gate `npm run ci:verify` is the green path and posts commit status **`ci/local-quality`**.
3. After billing is fixed: restore `push` / `pull_request` triggers in `ci.yml`.

## Local ↔ GitHub 1:1

```bash
git fetch origin
git status          # should be clean, main == origin/main
npm run ci:verify   # green gate + status
git push origin main
git push sync main  # optional mirror
```

SHA on `main` must match `origin/main` and `sync/main`.
