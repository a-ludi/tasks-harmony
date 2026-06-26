# Sticky Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the mobile header and desktop sidebar stay fixed at the top/side of the viewport while the page content scrolls.

**Architecture:** Two CSS-only changes to `App.tsx` — add `sticky top-0 z-10` to the mobile `<header>` and `sticky top-0 h-screen overflow-y-auto` to the desktop `<aside>`. No new files or logic needed.

**Tech Stack:** React, Tailwind CSS

---

## File Map

- Modify: `src/App.tsx:112-148` — add sticky positioning classes to both the mobile header and desktop sidebar

---

### Task 1: Sticky mobile header

The mobile `<header>` at line 125 of `src/App.tsx` needs to stay pinned to the top of the viewport when the user scrolls content. Currently it has no positioning, so it scrolls away.

**Files:**
- Modify: `src/App.tsx:125`

- [ ] **Step 1: Read the current header className**

Open `src/App.tsx` and locate line 125:
```
<header className="flex items-center gap-3 border-b border-border bg-background px-4 py-3 md:hidden">
```

- [ ] **Step 2: Add sticky classes**

Change the `<header>` className to include `sticky top-0 z-10`:

```tsx
<header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-background px-4 py-3 md:hidden">
```

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat: make mobile header sticky"
```

---

### Task 2: Sticky desktop sidebar

The desktop `<aside>` at line 112 of `src/App.tsx` needs to stay pinned while the main content scrolls. Adding `sticky top-0 h-screen overflow-y-auto` pins it to the viewport and makes the sidebar itself scrollable if its content overflows.

**Files:**
- Modify: `src/App.tsx:112-122`

- [ ] **Step 1: Read the current aside className**

Locate line 112 in `src/App.tsx`:
```tsx
<aside
  style={{ width: sidebarWidth }}
  className="hidden md:flex flex-col relative bg-background border-r"
>
```

- [ ] **Step 2: Add sticky classes**

Change the aside `className` to include `sticky top-0 h-screen overflow-y-auto`:

```tsx
<aside
  style={{ width: sidebarWidth }}
  className="hidden md:flex flex-col relative bg-background border-r sticky top-0 h-screen overflow-y-auto"
>
```

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat: make desktop sidebar sticky"
```
