# GitHub Issues + Task Filters / Status Expand — Design

**Date:** 2026-07-19  
**Status:** Approved — implementing  
**Product surface:** Expo app (`mobile/` + web SPA). Legacy website out of scope.  
**Mapped SRS:** FR-TASK-01 (update), FR-INT-TASKS-15–20 (new)

## Summary

1. Expand task **status** (`stuck`, `review`) and **priority** (`urgent`); apply to all tasks locally; external write-back only on done ↔ not-done.
2. Replace Tasks chip rows with **search + filter sheet + active chips + sort**.
3. Add **GitHub** task source: OAuth, select repos, pull open issues assigned to the user, complete/reopen write-back.

## Decisions

| Topic | Decision |
|---|---|
| Status set | `open \| in_progress \| stuck \| review \| done` |
| Priority set | `urgent \| high \| medium \| low` |
| External local statuses | Allowed; no write-back except crossing done boundary |
| Sync merge | If remote still open and local ∈ {in_progress, stuck, review}, keep local status; keep local priority on update |
| Mark-done cleanup | Treat all non-`done` as open for missing-remote cleanup |
| Filter UX | Search bar + Filters button → sheet; active filters as removable chips; sort in sheet |
| Default filters | Hide `done` (status filter defaults to non-done); sort priority desc then due |
| GitHub auth | OAuth App (`GITHUB_CLIENT_ID/SECRET/REDIRECT_URI`) |
| GitHub account | Single account (`account_key = ''`) |
| GitHub pull | Open issues assigned to me from `selected_list_ids` (repo `full_name`); exclude PRs |
| GitHub write-back | Close / reopen issue |
| Out of scope V1 | Multi GitHub accounts, Projects v2, labels mapping, webhooks, creating issues from app |

## Sync merge rule

```
if draft.status == done → status = done
else if existing.status in (in_progress, stuck, review) → keep existing.status
else → open
priority on update: keep existing.priority (insert default medium)
```

## Filter sheet fields

- Source (incl. github)
- Project, status (multi), priority, overdue toggle
- External list when source is google_tasks / monday / github
- Sort: priority | due_date | updated_at

## GitHub identity

- `source = 'github'`
- `external_id = '{owner}/{repo}#{number}'`
- `external_list_id = '{owner}/{repo}'`
- `external_meta.listTitle`, `deepLink`, optional `account_name` (login)
