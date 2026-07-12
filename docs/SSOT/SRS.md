# SRS — מרכז השליטה (MySelf)

## Scope
Personal private dashboard: timeline, habits/goals, relationships, content library, tasks.

## Requirements

### FR-AUTH-GOOGLE-01
Site access via Google Sign-In (openid, email, profile, calendar.readonly). Only `ALLOWED_GOOGLE_EMAIL` may enter when configured.

### FR-AUTH-GOOGLE-02
After sign-in, calendar sync runs in the background without blocking the redirect.

### FR-NAV-01
Navigation includes: בית, ציר זמן, משימות, פרויקטים, הרגלים, מטרות וחלומות, קשרים, ספריית תוכן, הגדרות.

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

### FR-INT-GCAL-01
Connect primary Google Calendar via OAuth; sync all historical and future events to timeline.

### FR-INT-GCAL-02
Calendar-sourced events display with a calendar icon and category `יומן`, indistinguishable from manual events except for the indicator.

### FR-INT-GCAL-03
User may set local title/description overrides on calendar events; re-sync preserves overrides.

### FR-INT-GCAL-04
Manual sync on demand plus weekly automatic background sync.

### FR-INT-WA-01
Optional phone number on relationships; when set, show WhatsApp quick-link via `wa.me`.

### FR-HABIT-01
Dedicated Habits tab (`/habits`) separate from goals/dreams (`/goals`).
Habit stats: current streak, best streak, total successful days, failure count (streak breaks).
Successful days and best streak persist after a missed day.

### FR-HOME-01
Home page is a data dashboard (no module shortcut cards). Shows aggregated stats for habits, goals, tasks, relationships, timeline.

### FR-TL-04
Visual timeline supports deep zoom down to hourly divisions on a specific date (log-scale zoom control, adaptive axis ticks).

### FR-TASK-01
Dedicated Tasks tab (`/tasks`) separate from habits/commitments.
Fields: title, `project_id` (references `projects`), priority (high|medium|low), status (open|in_progress|done), optional due_date.
Filter by project and status. CRUD supported.

### FR-TOAST-01
After create / update / delete actions, show a short Hebrew toast (נוסף / עודכן / נמחק / error).

### FR-TL-01
Timeline supports overlapping life periods (`life_periods`) that may nest or overlap in time.
Views: (1) chronological list newest-first, (2) visual axis with period bands + zoom, (3) by-period accordion.
Events can be browsed chronologically regardless of period grouping.

### FR-TL-03
Visual timeline: wide zoom range (fit → deep zoom), non-overlapping event labels via lane packing,
period hover tooltip with full name + date range, readable labels for short periods (external label or hover).
Year markers along the axis; full start/end dates on each period band.
Click period to edit or delete with precise dates. Default tab is visual view.

### FR-TL-02
Seeded milestones: birth 2002-01-02, enlist 2021-12-23, release 2025-04-19.
Seeded periods include childhood, high school, degree, mechina, Golan, army, relationship (from 2023-07-26 ongoing), post-release, Australia.

### NFR-01
Data lives in Supabase schema `myself`, isolated from other apps on the shared project.
