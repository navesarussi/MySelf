# SRS — מרכז השליטה (MySelf)

## Scope
Personal private dashboard: timeline, habits/goals, relationships, content library, tasks.

## Requirements

### FR-NAV-01
Navigation includes: בית, ציר זמן, משימות, הרגלים ומטרות, קשרים, ספריית תוכן.

### FR-TASK-01
Dedicated Tasks tab (`/tasks`) separate from habits/commitments.
Fields: title, project (Digital Scale | Glowy | KupaPay | אישי | אחר), priority (high|medium|low), status (open|in_progress|done), optional due_date.
Filter by project and status. CRUD supported.

### FR-TOAST-01
After create / update / delete actions, show a short Hebrew toast (נוסף / עודכן / נמחק / error).

### FR-TL-01
Timeline supports overlapping life periods (`life_periods`) that may nest or overlap in time.
Events appear under every period whose date range contains the event date.
Periods are collapsible; active-today periods open by default; expand/collapse all controls.

### FR-TL-02
Seeded milestones: birth 2002-01-02, enlist 2021-12-23, release 2025-04-19.
Seeded periods include childhood, high school, degree, mechina, Golan, army, relationship (from 2023-07-26 ongoing), post-release, Australia.

### NFR-01
Data lives in Supabase schema `myself`, isolated from other apps on the shared project.
