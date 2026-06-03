# CI/CD via GitHub Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add CI (runs on every push) and CD (runs on push to `main`, calls CI, then releases and deploys).

**Architecture:**
- `ci.yml` — reusable workflow (`workflow_call`) + standalone trigger (`push`). Jobs: `check` (typecheck + unit tests + E2E) and `build` (build + upload `dist/` artifact).
- `cd.yml` — triggers on push to `main`. Calls `ci.yml` via `jobs.<id>.uses`, then creates a GitHub Release (tag `v{version}` from `package.json`), then rsyncs `dist/` contents to the server using the `production` environment.
- App version is injected at build time via Vite `define`. Sidebar shows a faded version footer.

**Tech Stack:** GitHub Actions (`workflow_call`, `actions/upload-artifact@v4`, `actions/download-artifact@v4`, `gh` CLI for releases), `oven-sh/setup-bun@v2`, `rsync` over SSH. GitHub environment `production` holds `SSH_KEY`, `SSH_HOST`, `SSH_USER`, `SSH_PATH`.

---

### Task 1: Inject version and build date into the app

**Files:**
- Modify: `vite.config.ts`
- Modify: `src/vite-env.d.ts`
- Modify: `src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Add `define` to vite.config.ts**

In `vite.config.ts`, import `version` from `package.json` and add a `define` block:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'path';
import { version } from './package.json';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({ /* existing config unchanged */ }),
  ],
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().substring(0, 10)),
  },
});
```

- [ ] **Step 2: Declare the globals in vite-env.d.ts**

In `src/vite-env.d.ts`, add after the existing triple-slash reference:

```ts
declare const __APP_VERSION__: string;
declare const __BUILD_DATE__: string;
```

- [ ] **Step 3: Run typecheck to confirm the globals are recognised**

```bash
bun run typecheck
```

Expected: exits 0.

- [ ] **Step 4: Add version footer to Sidebar.tsx**

At the very bottom of the `<nav>` element in `src/components/layout/Sidebar.tsx`, before the closing `</nav>`, add:

```tsx
<footer className="mt-auto pt-4 text-xs text-gray-300 select-none">
  v{__APP_VERSION__} · {__BUILD_DATE__}
</footer>
```

- [ ] **Step 5: Run typecheck + build**

```bash
bun run typecheck && bun run build
```

Expected: exits 0, `dist/` created.

- [ ] **Step 6: Commit**

```bash
git add vite.config.ts src/vite-env.d.ts src/components/layout/Sidebar.tsx
git commit -m "feat: inject app version and build date, display in sidebar footer"
```

---

### Task 2: Create the reusable CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Verify all CI commands pass locally**

```bash
bun run typecheck && bun test && bun run build
```

Expected: exits 0.

- [ ] **Step 2: Create `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
  workflow_call:
    outputs:
      artifact-id:
        description: "GitHub artifact ID of the production build"
        value: ${{ jobs.build.outputs.artifact-id }}

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

      - name: Install Playwright browser
        run: bunx playwright install --with-deps chromium

      - name: E2E tests
        run: bun run test:e2e

  build:
    needs: check
    runs-on: ubuntu-latest
    outputs:
      artifact-id: ${{ steps.upload.outputs.artifact-id }}
    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - name: Install dependencies
        run: bun install

      - name: Build
        run: bun run build

      - name: Upload build artifact
        id: upload
        uses: actions/upload-artifact@v4
        with:
          name: build
          path: dist/
          retention-days: 7
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add reusable CI workflow (typecheck, tests, E2E, build, artifact upload)"
```

---

### Task 3: Create the CD workflow

**Files:**
- Create: `.github/workflows/cd.yml`

- [ ] **Step 1: Create `.github/workflows/cd.yml`**

```yaml
name: CD

on:
  push:
    branches: [main]

jobs:
  ci:
    uses: ./.github/workflows/ci.yml

  release:
    needs: ci
    runs-on: ubuntu-latest
    permissions:
      contents: write
    outputs:
      version: ${{ steps.get-version.outputs.version }}
    steps:
      - uses: actions/checkout@v4

      - name: Get version from package.json
        id: get-version
        run: echo "version=$(node -p "require('./package.json').version")" >> "$GITHUB_OUTPUT"

      - name: Create GitHub Release
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          gh release create "v${{ steps.get-version.outputs.version }}" \
            --title "v${{ steps.get-version.outputs.version }}" \
            --generate-notes

  deploy:
    needs: [ci, release]
    runs-on: ubuntu-latest
    environment: production
    steps:
      - name: Download build artifact
        uses: actions/download-artifact@v4
        with:
          name: build
          path: dist/
          run-id: ${{ needs.ci.outputs.artifact-id && github.run_id || github.run_id }}

      - name: Configure SSH
        run: |
          mkdir -p ~/.ssh
          echo "${{ secrets.SSH_KEY }}" > ~/.ssh/deploy_key
          chmod 600 ~/.ssh/deploy_key
          ssh-keyscan -H "${{ secrets.SSH_HOST }}" >> ~/.ssh/known_hosts

      - name: Deploy via rsync
        run: |
          rsync -avz --delete \
            -e "ssh -i ~/.ssh/deploy_key" \
            dist/ \
            "${{ secrets.SSH_USER }}@${{ secrets.SSH_HOST }}:${{ secrets.SSH_PATH }}/"
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/cd.yml
git commit -m "ci: add CD workflow — calls CI, creates GitHub release, deploys via rsync"
```
