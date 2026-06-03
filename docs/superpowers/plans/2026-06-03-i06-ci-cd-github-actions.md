# CI/CD via GitHub Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a GitHub Actions CI workflow that runs typecheck, unit tests, and a production build on every push and pull request, with a separate job for Playwright E2E tests.

**Architecture:** Two jobs — `check` (fast: typecheck + unit tests + build) and `e2e` (Playwright Chromium). Both trigger on `push` to `main` and on `pull_request` targeting `main`. The Git remote is named `public`, not `origin`.

**Tech Stack:** GitHub Actions, `oven-sh/setup-bun@v2`, `actions/checkout@v4`, Playwright Chromium via `bunx playwright install --with-deps chromium`.

---

### Task 1: Create the CI workflow file

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Verify local commands pass before creating the workflow**

Run each command to confirm they currently all succeed:

```bash
bun run typecheck
```
Expected: exits 0, no type errors printed.

```bash
bun test
```
Expected: exits 0, all unit tests pass.

```bash
bun run build
```
Expected: exits 0, `dist/` directory created.

- [ ] **Step 2: Create the workflows directory and CI config**

```bash
mkdir -p .github/workflows
```

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - name: Install dependencies
        run: bun install

      - name: Typecheck
        run: bun run typecheck

      - name: Unit tests
        run: bun test

      - name: Build
        run: bun run build

  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - name: Install dependencies
        run: bun install

      - name: Install Playwright browser
        run: bunx playwright install --with-deps chromium

      - name: E2E tests
        run: bun run test:e2e
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add GitHub Actions workflow for typecheck, unit tests, build, and E2E"
```
