# Finance Cashflow — Riseup-style Monthly Management

## Goal

Transform the finance tab from a transaction list into a **monthly cash-flow control center**:
fixed / variable / planned expenses, weekly pacing, savings, planned vs actual.

## User choice

- **Budget mode:** auto from previous month + manual edits (Riseup-style bootstrap).

## Phased delivery

### Phase 1 — Plan engine + dashboard UI (this sprint)

- DB: `finance_month_plans`, `finance_plan_lines`
- Auto-create plan for month from previous plan, or from last month's actuals per category
- Line types: `income`, `fixed`, `variable`, `planned`, `savings`
- API: `GET/PATCH /finance/plan?month=YYYY-MM`
- Dashboard UI: sections with planned vs actual bars, weekly spend strip, transaction list below
- Category → type defaults (מנויים/בית = fixed; rest = variable)

### Phase 2 — Planned expenses & savings pots

- Add/remove planned one-off lines (חופשה, מתנה)
- Savings goals with target + monthly allocation
- "Left to spend this week" variable budget pacing

### Phase 3 — Intelligence

- Recurring detection from Leumi (mark as fixed automatically)
- Alerts when over weekly pace or category budget
- Income salary line from recurring deposits

## Data model

```
finance_month_plans (id, month YYYY-MM unique, created_at, updated_at)
finance_plan_lines (
  id, plan_id FK, line_type, name, category nullable,
  planned_amount, sort_order, created_at, updated_at
)
```

Actuals computed at read time from `finance_transactions` (no duplicate amounts).

## Weekly breakdown

Calendar weeks (Sun–Sat, Israel). For each week in month:
`spent`, `income`, `variable_budget_share` (optional phase 2).

## UI layout (RTL)

1. Month navigator + net summary card
2. **הכנסות** — lines + actual
3. **קבועות** — rent, subscriptions
4. **משתנות** — food, transport…
5. **מתוכננות** — one-offs (phase 2 add button)
6. **חיסכון** — allocation vs transferred (phase 2)
7. **לפי שבוע** — 4–5 week bars
8. **תנועות** — collapsible list

## Non-goals (V1 plan)

- Multi-currency
- Shared household / split bills
- MAX/Cal cards (Leumi only ingest remains)
