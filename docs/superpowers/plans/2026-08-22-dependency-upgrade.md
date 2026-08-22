# Dependency Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade pnpm/Next.js and the repo's direct dependencies to their latest compatible published versions, then verify dev/build still work.

**Architecture:** Update package manager metadata and direct dependencies from source-of-truth published versions, regenerate the lockfile with pnpm, then run build verification and fix only upgrade-induced breakage. Keep changes scoped to dependency and compatibility edits required by the upgrade.

**Tech Stack:** pnpm, Next.js, React, TypeScript, ESLint

**Spec:** User request in this task to upgrade pnpm, Next, and all dependencies to latest.

## Global Constraints

- Preserve the user's existing component edits.
- Verify latest versions against primary sources before changing manifests.
- Run fresh install/build verification after upgrades.
- Keep repo changes limited to upgrade-related files unless compatibility fixes are required.

---

### Task 1: Confirm target versions and current repo state

**Files:**
- Modify: `package.json`
- Review: `pnpm-lock.yaml`, `pnpm-workspace.yaml`
- Save: `docs/superpowers/plans/2026-08-22-dependency-upgrade.md`

**Interfaces:**
- Consumes: current dependency manifest and published package metadata
- Produces: exact target versions for package manager and direct dependencies

- [ ] **Step 1: Inspect current package manifest and workspace files**
- [ ] **Step 2: Confirm latest published versions from primary sources**
- [ ] **Step 3: Record the target versions in the manifest update**

### Task 2: Apply the dependency upgrade

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `pnpm-workspace.yaml` if install updates it

**Interfaces:**
- Consumes: target versions from Task 1
- Produces: upgraded manifest and lockfile

- [ ] **Step 1: Update package manager metadata if needed**
- [ ] **Step 2: Upgrade direct dependencies and devDependencies to latest**
- [ ] **Step 3: Regenerate lockfile with pnpm**

### Task 3: Verify runtime and build health

**Files:**
- Review: any files surfaced by build/type errors

**Interfaces:**
- Consumes: upgraded dependency tree
- Produces: verified build output and any minimal compatibility follow-up edits

- [ ] **Step 1: Run `pnpm build` and inspect failures if any**
- [ ] **Step 2: Run `pnpm dev` long enough to confirm startup**
- [ ] **Step 3: Apply only required compatibility fixes, then rerun verification**
