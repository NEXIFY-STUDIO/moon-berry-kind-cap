# Blueprint Scanner

[![CI](https://github.com/NEXIFY-STUDIO/moon-berry-kind-cap/actions/workflows/ci.yml/badge.svg)](https://github.com/NEXIFY-STUDIO/moon-berry-kind-cap/actions/workflows/ci.yml)
[![Node 22](https://img.shields.io/badge/node-22-brightgreen)](package.json)
[![Tests](https://img.shields.io/badge/tests-271%20passed-success)](docs/TESTING.md)
[![Repo](https://img.shields.io/badge/github-NEXIFY--STUDIO%2Fmoon--berry--kind--cap-blue)](https://github.com/NEXIFY-STUDIO/moon-berry-kind-cap)

**Public URL or HTML → structured frontend reverse-spec (blueprint).**  
Not a backend/DB/secrets clone — a high-signal public UI snapshot for rebuild, audit, and design extraction.

**Repo:** [D1G1C3RRRT/EEEEEE](https://github.com/D1G1C3RRRT/EEEEEE)

## What it does

- Scans a **public** `https://` page (or pasted HTML) into a versioned Blueprint JSON
- Same-origin multi-page crawl with **partial recovery** and transient **retry**
- Headless render → static HTTP → **Wayback** fallback chain
- Extracts design tokens, forms, tech signals, assets, OG/JSON-LD metadata
- Optional **WordPress / JetEngine / Elementor** architecture extract + importable Elementor template JSON
- Local vault (history), compare, JSON / ZIP / Elementor export
- **AI Rebuild Studio** + Architecture Compiler prompts (copy-only; no live LLM API key)

## What it does **not** do

- Clone server code, databases, `.env`, auth secrets, or private APIs
- Bypass login walls or capture session cookies
- Promise 1:1 full-stack replication (target: ~70–90% of **public** frontend)

## Features

| Area | Capabilities |
|------|----------------|
| Ingest | URL scan · HTML paste · `baseUrl` for relative paths |
| Fetch chain | Headless (Playwright) → HTTP static → archive.org Wayback |
| Crawl | Same-origin BFS · `maxPages` 1–20 · per-URL fault isolation |
| Resilience | Partial `scanStatus` · AbortSignal cancel · HTTP retry backoff |
| Extract | Meta/SEO · headings · links · forms · tech · design tokens · CSS vars |
| WordPress | REST/CCT hints · listing grids · Elementor globals · template JSON |
| Hardening | SSRF blocklist · asset size caps · browser process shield · API guards |
| AI | Rebuild prompt + Tailwind fragment · SPA-aware architecture prompt |
| Storage | localStorage vault (≤15) · optional PGLite DB save · import JSON |
| UI | 2×100dvh scan/result · neon input · long-press option toggles · cancel |

## Quick start

```bash
git clone git@github.com:D1G1C3RRRT/EEEEEE.git
cd EEEEEE
npm ci
npm run dev
```

Open the dev server (default `0.0.0.0:8080`). Paste a public URL → **Vytvoriť blueprint**.

```bash
npm run typecheck
npm run test:unit
npm run build
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Vite dev server · `0.0.0.0:8080` |
| `npm run build` | Production build + `db:migrate` |
| `npm run preview` | Preview production build on `0.0.0.0:8080` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run format` | Prettier write |
| `npm test` | Vitest run (default suite) |
| `npm run test:unit` | Unit + integration (`tests/unit`, `tests/integration`) |
| `npm run test:smoke` | Playwright UI smoke (`tests/smoke/smoke-runner.mjs`) |
| `npm run test:all` | `test:unit` then `test:smoke` |
| `npm run db:migrate` | PGLite / DB migrations |
| `npm run build:dev` | Vite build (development mode) |

## Project structure

```text
src/
  components/blueprint/   # ScanForm, BlueprintView, History, Compare
  components/ui/          # shadcn-style primitives
  lib/blueprint/          # scan pipeline, types, storage, WP/Elementor
  lib/scanner/            # browser shield, assets guard, pipeline, API errors
  lib/ai-rebuild/         # prompter + architecture compiler
  lib/seo/                # JSON-LD helpers
  routes/                 # TanStack Start routes
tests/
  unit/ · integration/ · smoke/ · fixtures/ · helpers/
scripts/                  # migrate, browser-smoke, qa-scan
docs/                     # Architecture, Security, Testing, …
.github/workflows/ci.yml
```

## Exports

| Format | How |
|--------|-----|
| Blueprint JSON | Copy / download from result view · `exportBlueprintJson` |
| ZIP archive | Captured assets + JSON · `exportBlueprintZip` |
| Elementor template | `elementor-template-import.json` (v0.4 schema) |
| AI Rebuild prompt | Clipboard · system + user + Tailwind config fragment |
| Architecture prompt | SPA-aware UI rebuild brief (copy-only) |

## Limitations

- **Thin HTML / SPA**: without successful headless render, shell may be empty (`isThinHtml`)
- **Login walls**: only public DOM is visible
- **No private networks**: localhost / RFC1918 / cloud metadata blocked (SSRF)
- **Asset budgets**: max 10 MB per file, 50 MB total capture, 40 assets
- **Crawl size**: max 20 same-origin pages per scan
- **Serverless headless**: Playwright needs a Chromium binary; document runtime limits in [Deployment](docs/DEPLOYMENT.md)

## Git: overenie local = remote (1:1)

**Čo to robí:** stiahne najnovší stav z GitHubu (`fetch`, bez zmeny tvojich súborov), ukáže či si *ahead* / *behind*, a vypíše hash lokálneho `HEAD` a `origin/main`. Ak sú hashe **rovnaké** a `git status` ukazuje `main...origin/main` bez „ahead/behind“, máš **1:1** kópiu s branchom `main` na GitHube.

```bash
cd "/Users/erikbabcan/HUB/01-Projekty/moon-berry-kind-cap-main" && \
git fetch origin && \
git status -sb && \
git rev-parse HEAD && git rev-parse origin/main
```

| Výstup | Význam |
|--------|--------|
| `## main...origin/main` | branch trackuje remote |
| bez `ahead` / `behind` | žiadne nepushnuté / nestiahnuté commity |
| rovnaký hash 2× | lokálny `main` ≡ GitHub `main` |
| rôzne hashe | nie 1:1 — `git pull` alebo `git push` podľa smeru |

**Poznámka:** `git fetch` nič neprepisuje v working tree. Iba aktualizuje vedomosť o remote.

## Documentation

| Doc | Audience |
|-----|----------|
| [Architecture](docs/ARCHITECTURE.md) | Engineers |
| [Development](docs/DEVELOPMENT.md) | Contributors |
| [Testing](docs/TESTING.md) | QA / CI |
| [API](docs/API.md) | Integrators |
| [Security](docs/SECURITY.md) | Security / ops |
| [Deployment](docs/DEPLOYMENT.md) | DevOps |
| [Runbook](docs/RUNBOOK.md) | On-call / support |
| [Contributing](CONTRIBUTING.md) | PRs |
| [Changelog](CHANGELOG.md) | Releases |

## Repository

- Primary: [D1G1C3RRRT/EEEEEE](https://github.com/D1G1C3RRRT/EEEEEE)

## License

Private / all rights reserved unless otherwise stated in the repository settings.
