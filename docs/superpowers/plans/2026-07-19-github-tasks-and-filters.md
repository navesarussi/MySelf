# GitHub + Filters + Status Expand — Implementation Plan

> **For agentic workers:** Implement task-by-task. Checkboxes track progress.

**Goal:** Expanded statuses/priorities, smarter Tasks filters, and GitHub Issues sync (assigned-to-me).

**Architecture:** Reuse Monday/Google task-source port; migrate CHECK constraints; preserve local rich status on sync merge; filter sheet component in mobile.

**Tech Stack:** Expo mobile, Next API, Supabase, GitHub REST + OAuth.

## Global Constraints

- Version bump minor (`1.9.0`) for new features.
- Expo app primary; no legacy polish.
- Docs in English; UI i18n HE+EN.
- Max ~200 lines/file where splitting is reasonable.

---

### Task 1: Schema + domain types + merge

- [ ] Migration `0017_task_status_priority_expand.sql`
- [ ] Update `lib/types.ts`
- [ ] Update `merge.ts` + tests for status preserve / priority keep
- [ ] Orchestrator cleanup: non-done statuses
- [ ] API routes STATUSES/PRIORITIES + writeback done-boundary only
- [ ] Update SRS FR-TASK-01 + FR-INT-TASKS-15–20

### Task 2: Mobile status/priority UI

- [ ] Labels, tones, NEXT_STATUS cycle, forms, home counts
- [ ] i18n keys

### Task 3: Tasks filter bar

- [ ] `tasks-filter-bar.tsx` — search, sheet, chips, sort, overdue
- [ ] API `q` + sort params on tasks list
- [ ] Wire `tasks.tsx`

### Task 4: GitHub provider

- [ ] `lib/integrations/github-config.ts` + `task-sources/github/*`
- [ ] OAuth connect/callback
- [ ] v1 repos/settings/status/disconnect
- [ ] Register provider; cron already covers github in syncAll
- [ ] Mobile settings section + source filter chip
- [ ] Env `.env.example`

### Task 5: Verify

- [ ] Unit tests pass
- [ ] Bump version 1.9.0
