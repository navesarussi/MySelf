# Projects Design — פרויקטים with Tasks & Connections

**Date:** 2026-07-12  
**Status:** Approved (brainstorming)  
**Mapped SRS additions:** FR-NAV-01 (update), FR-PROJ-01–06

## Summary

Add a **פרויקטים** (`/projects`) screen where the user manages projects (add, rename, delete) and views each project's **משימות** and **קשרים** in two tabs, reusing the same task and relationship UI components.

The existing **משימות** (`/tasks`) and **קשרים** (`/relationships`) screens continue to show **all** tasks and **all** connections across every project, with project selection on create forms and project badges on list items.

## Decisions

| Topic | Decision |
|---|---|
| Screen layout | Approach A — single `/projects` page with project picker + content tabs |
| Project fields | `name`, `sort_order` only (no slug) |
| Delete behavior | Block delete when project has any tasks or connections (Option A) |
| Task project link | Replace `tasks.project` text enum with `project_id` FK |
| Relationship project link | New `relationships.project_id` FK (required) |
| Migration | Seed projects from old task enum values; assign orphan relationships to `כללי` |
| Component reuse | Extend `TaskForm`/`TaskList`; extract `RelationshipForm`/`RelationshipList` |

## Data Model

### `projects` — new table

| Column | Type | Purpose |
|---|---|---|
| `id` | `uuid` PK | |
| `name` | `text` NOT NULL | Display name (Hebrew or English) |
| `sort_order` | `int` NOT NULL DEFAULT 0 | Display order in picker |
| `created_at` | `timestamptz` NOT NULL DEFAULT now() | |

Unique constraint on `name` (case-sensitive).

### `tasks` — schema change

| Change | Detail |
|---|---|
| Remove | `project text` with check constraint |
| Add | `project_id uuid NOT NULL REFERENCES projects(id)` |
| Index | `(project_id, status)` |

### `relationships` — schema change

| Change | Detail |
|---|---|
| Add | `project_id uuid NOT NULL REFERENCES projects(id)` |
| Index | `(project_id)` |

### Migration (`0007_projects.sql`)

1. Create `projects` table.
2. Insert seed rows from legacy task enum: `Digital Scale`, `Glowy`, `KupaPay`, `אישי`, `אחר`, plus `כללי` for relationships without a project.
3. Add `project_id` to `tasks`, backfill from old `project` text column.
4. Drop old `project` column and its check constraint.
5. Add `project_id` to `relationships`, backfill all existing rows to `כללי`.
6. Set `NOT NULL` on both FK columns.

## Delete Guard

Before `deleteProject`, count related rows:

```sql
SELECT
  (SELECT COUNT(*) FROM tasks WHERE project_id = $id) +
  (SELECT COUNT(*) FROM relationships WHERE project_id = $id) AS total
```

If `total > 0`, abort with Hebrew toast: **"לא ניתן למחוק — יש משימות או קשרים בפרויקט"**.

Pure logic in `lib/projects/delete-guard.ts` for unit testing.

## Screens

### `/projects` — project hub

```
┌─────────────────────────────────────────────┐
│  פרויקטים                                    │
├─────────────────────────────────────────────┤
│  [כללי] [KC] [Glowy] [+]   ← project pills  │
│  ✏️ rename  🗑 delete (selected project)     │
├─────────────────────────────────────────────┤
│  [משימות]  [קשרים]          ← content tabs  │
├─────────────────────────────────────────────┤
│  Form (project locked) + List               │
└─────────────────────────────────────────────┘
```

- URL: `/projects?project=<uuid>&tab=missions|connections`
- Default: first project by `sort_order`, tab `missions`
- **Add project**: inline name input + submit
- **Rename**: pencil on selected pill → inline edit
- **Delete**: button on selected project; guarded by delete check

Client component `ProjectBoard` handles picker + tab state (same pill pattern as `TimelineBoard`).

### `/tasks` — all tasks

- Fetch all tasks; filter by status (existing) and project (dynamic from DB, plus "הכל")
- `TaskForm`: project dropdown from `projects` table
- `TaskList`: project name badge on each row

### `/relationships` — all connections

- Fetch all relationships with project name (join)
- `RelationshipForm`: project dropdown
- Cards: project badge + existing group/contact UI
- Grouping by `group_name` unchanged

## Component Refactor

| Component | Location | Props |
|---|---|---|
| `TaskForm` | `app/tasks/task-board.tsx` | `projects[]`, optional `fixedProjectId` (hides dropdown) |
| `TaskList` | `app/tasks/task-board.tsx` | `tasks[]`, optional `showProjectBadge` (default true) |
| `RelationshipForm` | `app/relationships/relationship-board.tsx` (new) | `projects[]`, optional `fixedProjectId` |
| `RelationshipList` | `app/relationships/relationship-board.tsx` (new) | `relationships[]`, optional `showProjectBadge` |
| `ProjectBoard` | `app/projects/project-board.tsx` (new) | `projects[]`, `tasks[]`, `relationships[]` |

When `fixedProjectId` is set (on `/projects`), the form includes a hidden `project_id` input and skips the dropdown.

## Server Actions

| File | Actions |
|---|---|
| `app/projects/actions.ts` | `addProject`, `renameProject`, `deleteProject` |
| `app/tasks/actions.ts` | Use `project_id` instead of `project` text; revalidate `/projects` |
| `app/relationships/actions.ts` | Require `project_id` on insert; revalidate `/projects` |

All mutating actions revalidate: `/tasks`, `/relationships`, `/projects`, `/`.

## Error Handling

| Action | Condition | Toast |
|---|---|---|
| Add project | Empty name | "חסר שם לפרויקט" |
| Add project | Duplicate name | "פרויקט בשם זה כבר קיים" |
| Rename project | Empty name | "חסר שם לפרויקט" |
| Delete project | Has content | "לא ניתן למחוק — יש משימות או קשרים בפרויקט" |
| Add task / connection | Missing project | "יש לבחור פרויקט" |
| Any DB error | Supabase error | "שגיאה" (FR-TOAST-01) |
| Success | — | "נוסף" / "עודכן" / "נמחק" (FR-TOAST-01) |

## SRS Requirements

### FR-NAV-01 (update)

Navigation includes: בית, ציר זמן, משימות, **פרויקטים**, הרגלים, מטרות וחלומות, קשרים, ספריית תוכן, הגדרות.

### FR-PROJ-01

Projects are a first-class entity with CRUD. Fields: `name`, `sort_order`.

### FR-PROJ-02

Delete is blocked when the project has any tasks or connections.

### FR-PROJ-03

`/projects` shows a project picker and two tabs (משימות | קשרים). Content is scoped to the selected project. Create forms lock `project_id` to the selected project.

### FR-PROJ-04

`/tasks` shows all tasks from all projects. Dynamic project filter and project badge per task. Task form includes project selector.

### FR-PROJ-05

`/relationships` shows all connections from all projects. Relationship form includes project selector; cards show project badge.

### FR-PROJ-06

Migration maps existing `tasks.project` enum values to `projects` rows. Existing relationships without a project assign to default `כללי`.

## Testing

| Layer | Test |
|---|---|
| `lib/projects/delete-guard.ts` | Unit test: blocked when count > 0, allowed when 0 |
| Migration | Manual: existing tasks retain correct project after migration |

No E2E in scope — matches current app testing level.

## Files

### New

- `supabase/migrations/0007_projects.sql`
- `app/projects/page.tsx`
- `app/projects/project-board.tsx`
- `app/projects/actions.ts`
- `app/relationships/relationship-board.tsx`
- `lib/projects/delete-guard.ts`
- `lib/projects/__tests__/delete-guard.test.ts`

### Modified

- `lib/types.ts` — `Project` type; `Task.project_id`; `Relationship.project_id`
- `components/nav.tsx` — add פרויקטים link
- `app/tasks/page.tsx`, `task-board.tsx`, `actions.ts`
- `app/relationships/page.tsx`, `actions.ts`
- `docs/SSOT/SRS.md` — FR-NAV-01 update + FR-PROJ-01–06

## Out of Scope

- Project color/icon customization
- Drag-and-drop project reordering (use `sort_order` via rename/add order only in V1)
- Moving tasks/connections between projects via bulk action
- Per-project permissions or sharing
