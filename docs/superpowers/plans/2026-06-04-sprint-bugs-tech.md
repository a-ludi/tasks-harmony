# Sprint Bugs & Tech Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close four sprint housekeeping items: commit PWA icons so CI builds include them (#25), replace SSH secrets with vars in the CD workflow (#24), upgrade GitHub Actions to Node.js 24 (#22), and install local git hooks via lefthook (#5).

**Architecture:** Isolated changes — icon commits unblock CI, workflow edits are textual replacements, lefthook adds a config file and a prepare script. No app code changes.

**Tech Stack:** git, GitHub Actions YAML, lefthook, bun

---

## Task 1: Fix #25 — Commit PWA icons so CI builds include them

`public/` is listed in `.gitignore`, so `public/icon-192.png` and `public/icon-512.png` are never committed. The CI `bun run build` step therefore produces a `dist/` without icons, causing the installability error. Fix: un-ignore those two specific files in `.gitignore` and force-add them.

**Files:**
- Modify: `.gitignore`
- Add tracked: `public/icon-192.png`, `public/icon-512.png`

- [ ] **Step 1: Verify the icons exist locally**

```bash
ls -lh public/icon-192.png public/icon-512.png
```

Expected: both files present. If missing, run `bun run generate-icons` first (requires `rsvg-convert` / `librsvg2-bin`).

- [ ] **Step 2: Un-ignore the icon files in `.gitignore`**

Add two negation rules immediately after the `public/` line in `.gitignore`:

```
public/
!public/icon-192.png
!public/icon-512.png
```

- [ ] **Step 3: Force-add the icons**

```bash
git add -f public/icon-192.png public/icon-512.png
git status
```

Expected: both files shown as "new file" staged.

- [ ] **Step 4: Run the PWA installability E2E test**

```bash
bun run dev &
DEV_PID=$!
sleep 4
bunx playwright test e2e/pwa-installability.spec.ts
kill $DEV_PID
```

Expected: test passes (zero installability errors).

- [ ] **Step 5: Commit**

```bash
git add .gitignore
git commit -m "fix: commit PWA icons so CI build includes them (#25)

Un-ignore public/icon-192.png and public/icon-512.png so they are
tracked and available to bun run build in CI.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

- [ ] **Step 6: Close the GitHub issue**

```bash
gh issue close 25 --comment "Icons are now committed (un-ignored via .gitignore negation rules). CI build will include them from this commit onward."
```

---

## Task 2: Fix #24 — Replace `secrets.SSH_*` with `vars.SSH_*` in cd.yml

`SSH_HOST`, `SSH_USER`, and `SSH_PATH` are non-sensitive deployment coordinates. Moving them to repository variables (not secrets) makes them visible in the Actions UI and easier to audit. `SSH_KEY` remains a secret.

**Files:**
- Create/Modify: `.github/workflows/cd.yml`

- [ ] **Step 1: Create `.github/workflows/` locally and write the updated cd.yml**

The file does not exist in the local working tree (it was created via the GitHub web UI). Fetch the current content and write it locally with the required substitutions:

```bash
mkdir -p .github/workflows
gh api repos/a-ludi/tasks-harmony/contents/.github/workflows/cd.yml \
  --jq '.content' | base64 -d > .github/workflows/cd.yml
```

- [ ] **Step 2: Apply the substitutions**

In `.github/workflows/cd.yml`, replace every occurrence of `secrets.SSH_HOST`, `secrets.SSH_USER`, and `secrets.SSH_PATH` with `vars.SSH_HOST`, `vars.SSH_USER`, `vars.SSH_PATH`. `secrets.SSH_KEY` must remain unchanged.

After editing, the Configure SSH and Deploy steps should look like:

```yaml
      - name: Configure SSH
        run: |
          mkdir -p ~/.ssh
          echo "${{ secrets.SSH_KEY }}" > ~/.ssh/deploy_key
          chmod 600 ~/.ssh/deploy_key
          ssh-keyscan -H "${{ vars.SSH_HOST }}" >> ~/.ssh/known_hosts

      - name: Deploy via rsync
        run: |
          rsync -avz --delete \
            -e "ssh -i ~/.ssh/deploy_key" \
            dist/ \
            "${{ vars.SSH_USER }}@${{ vars.SSH_HOST }}:${{ vars.SSH_PATH }}/"
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/cd.yml
git commit -m "ci: replace secrets.SSH_* with vars.SSH_* in cd.yml (#24)

SSH_HOST, SSH_USER, and SSH_PATH are non-sensitive coordinates;
moving them to repository variables makes them auditable in the
Actions UI. SSH_KEY remains a secret.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

- [ ] **Step 5: Create the repository variables on GitHub**

```bash
gh variable set SSH_HOST --body "<your-server-hostname>"
gh variable set SSH_USER --body "<your-ssh-username>"
gh variable set SSH_PATH --body "<your-deploy-path>"
```

Fill in the actual values. These must match the former secret values exactly.

- [ ] **Step 6: Close the GitHub issue**

```bash
gh issue close 24 --comment "secrets.SSH_HOST, secrets.SSH_USER, and secrets.SSH_PATH replaced with vars.* in cd.yml. Repository variables created."
```

---

## Task 3: Fix #22 — Upgrade GitHub Actions to Node.js 24

GitHub is deprecating actions that bundle Node.js 20. Check the latest major version of each action used in the workflows and upgrade to versions that use Node.js 24.

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/cd.yml`

- [ ] **Step 1: Fetch `ci.yml` locally**

```bash
gh api repos/a-ludi/tasks-harmony/contents/.github/workflows/ci.yml \
  --jq '.content' | base64 -d > .github/workflows/ci.yml
```

- [ ] **Step 2: Find the latest major version of each action**

```bash
gh api repos/actions/checkout/releases/latest --jq '.tag_name'
gh api repos/actions/upload-artifact/releases/latest --jq '.tag_name'
gh api repos/actions/download-artifact/releases/latest --jq '.tag_name'
```

Note the major version for each (e.g. `v5`). The plan assumes v5 for all three; adjust if the output differs.

- [ ] **Step 3: Update ci.yml**

In `.github/workflows/ci.yml`, update all `actions/checkout` references:

```yaml
      - uses: actions/checkout@v5
```

Update `actions/upload-artifact`:

```yaml
      - name: Upload build artifact
        id: upload
        uses: actions/upload-artifact@v5
        with:
          name: build
          path: dist/
          retention-days: 7
          if-no-files-found: error
```

- [ ] **Step 4: Update cd.yml**

In `.github/workflows/cd.yml`, update `actions/checkout` and `actions/download-artifact`:

```yaml
      - uses: actions/checkout@v5
```

```yaml
      - name: Download build artifact
        uses: actions/download-artifact@v5
        with:
          name: build
          path: dist/
```

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml .github/workflows/cd.yml
git commit -m "ci: upgrade actions to Node.js 24 (#22)

Bumps actions/checkout, actions/upload-artifact, and
actions/download-artifact to their latest major versions to
avoid the Node.js 20 deprecation warnings.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

- [ ] **Step 6: Verify CI passes**

```bash
gh run list --limit 3
```

After pushing, wait for the run triggered by this commit and confirm it passes:

```bash
gh run watch
```

- [ ] **Step 7: Close the GitHub issue**

```bash
gh issue close 22 --comment "actions/checkout, actions/upload-artifact, and actions/download-artifact upgraded to latest major versions (Node.js 24)."
```

---

## Task 4: Fix #5 — Local git hooks with lefthook

Install lefthook as a dev dependency and configure a pre-commit hook (typecheck) and a pre-push hook (unit tests). Add a `prepare` script so `bun install` installs the hooks automatically.

**Files:**
- Modify: `package.json`
- Create: `lefthook.yml`
- Modify: `CLAUDE.md` (document hook setup)

- [ ] **Step 1: Install lefthook**

```bash
bun add -d lefthook
```

Expected: lefthook appears in `devDependencies` in `package.json` and `bun.lock` is updated.

- [ ] **Step 2: Create `lefthook.yml`**

```yaml
pre-commit:
  commands:
    typecheck:
      run: bun run typecheck

pre-push:
  commands:
    unit-tests:
      run: bun run test
```

- [ ] **Step 3: Add `prepare` script to `package.json`**

In the `"scripts"` section of `package.json`, add:

```json
"prepare": "lefthook install"
```

- [ ] **Step 4: Install the hooks**

```bash
bun install
```

Expected: lefthook prints `SYNCING` and installs hooks into `.git/hooks/`.

- [ ] **Step 5: Verify pre-commit hook runs typecheck**

```bash
cat .git/hooks/pre-commit
```

Expected: file exists and references lefthook.

Trigger it manually:

```bash
lefthook run pre-commit
```

Expected: `bun run typecheck` runs and exits 0 (no type errors).

- [ ] **Step 6: Verify pre-push hook runs unit tests**

```bash
lefthook run pre-push
```

Expected: `bun run test` runs and all tests pass.

- [ ] **Step 7: Document in CLAUDE.md**

Add a section to `CLAUDE.md`:

```markdown
## Git hooks

Local hooks are managed via [lefthook](https://github.com/evilmartians/lefthook).
Run `bun install` to install them. Hooks installed:

- **pre-commit**: runs `bun run typecheck`
- **pre-push**: runs `bun run test`
```

- [ ] **Step 8: Commit**

```bash
git add lefthook.yml package.json bun.lock CLAUDE.md
git commit -m "chore: add local git hooks via lefthook (#5)

pre-commit runs typecheck; pre-push runs unit tests.
Hooks install automatically on bun install via prepare script.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

- [ ] **Step 9: Close the GitHub issue**

```bash
gh issue close 5 --comment "lefthook installed. Pre-commit: typecheck. Pre-push: unit tests. Hooks auto-install via prepare script on bun install."
```
