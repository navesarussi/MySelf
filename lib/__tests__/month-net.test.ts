import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { FinanceTransaction } from "../finance/ingest";
import type { MerchantRule } from "../finance/merchant-rules";
import {
  monthNet,
  monthNetFromPlanSections,
  monthNetFromTransactions,
} from "../finance/month-net";
import { buildMonthPlanView, type PlanLineRow } from "../finance/plan";

function txn(p: Partial<FinanceTransaction> & Pick<FinanceTransaction, "txn_date" | "amount" | "kind">): FinanceTransaction {
  return {
    id: p.id ?? "1",
    source: "manual",
    external_key: "k",
    currency: "ILS",
    original_amount: null,
    amount_ils: p.amount,
    ils_estimated: false,
    description: "x",
    merchant: null,
    account_number: null,
    card_name: null,
    status: "completed",
    category: null,
    purpose_note: null,
    expense_type: null,
    txn_time: null,
    installment_index: null,
    installment_total: null,
    installment_label: null,
    is_internal: false,
    needs_categorization: false,
    categorized_at: null,
    created_at: "",
    updated_at: "",
    ...p,
  };
}

describe("monthNet (legacy row sum)", () => {
  it("is income minus expense, to the agora", () => {
    assert.equal(
      monthNet([
        { kind: "income", amount: 10000 },
        { kind: "expense", amount: "2500.10" },
        { kind: "expense", amount: 0.2 },
      ]),
      7499.7
    );
  });

  it("ignores other kinds and missing amounts", () => {
    assert.equal(monthNet([{ kind: "transfer", amount: 999 }, { kind: "income", amount: null }]), 0);
  });

  it("is zero for an empty month", () => {
    assert.equal(monthNet([]), 0);
  });
});

describe("monthNetFromTransactions", () => {
  it("matches income minus non-savings expenses for the month", () => {
    const totals = monthNetFromTransactions(
      [
        txn({ txn_date: "2026-09-05", amount: 4143, kind: "income" }),
        txn({ txn_date: "2026-09-10", amount: 2000, kind: "expense", category: "מזון" }),
        txn({ txn_date: "2026-09-11", amount: 893, kind: "expense", category: "תחבורה" }),
      ],
      "2026-09"
    );
    assert.equal(totals.actual_income, 4143);
    assert.equal(totals.actual_expense, 2893);
    assert.equal(totals.net_actual, 1250);
  });

  it("excludes savings expenses from net (home vs money tab bug)", () => {
    const totals = monthNetFromTransactions(
      [
        txn({ txn_date: "2026-09-01", amount: 4143, kind: "income" }),
        txn({ txn_date: "2026-09-02", amount: 2893, kind: "expense", category: "מזון" }),
        txn({
          txn_date: "2026-09-03",
          amount: 1762,
          kind: "expense",
          category: "חיסכון",
          expense_type: "savings",
        }),
      ],
      "2026-09"
    );
    assert.equal(totals.actual_expense, 2893);
    assert.equal(totals.net_actual, 1250);
  });

  it("skips internal transfers and out-of-month rows", () => {
    const totals = monthNetFromTransactions(
      [
        txn({ txn_date: "2026-09-01", amount: 1000, kind: "income" }),
        txn({ txn_date: "2026-09-02", amount: 500, kind: "expense", category: "מזון", is_internal: true }),
        txn({ txn_date: "2026-08-31", amount: 999, kind: "expense", category: "מזון" }),
        txn({ txn_date: "2026-10-01", amount: 999, kind: "expense", category: "מזון" }),
      ],
      "2026-09"
    );
    assert.equal(totals.net_actual, 1000);
  });

  it("respects explicit expense_type overrides", () => {
    const totals = monthNetFromTransactions(
      [
        txn({ txn_date: "2026-09-01", amount: 1000, kind: "income" }),
        txn({
          txn_date: "2026-09-02",
          amount: 300,
          kind: "expense",
          category: "מזון",
          expense_type: "fixed",
        }),
        txn({
          txn_date: "2026-09-03",
          amount: 200,
          kind: "expense",
          category: "חיסכון",
          expense_type: "savings",
        }),
      ],
      "2026-09"
    );
    assert.equal(totals.actual_expense, 300);
    assert.equal(totals.net_actual, 700);
  });

  it("uses merchant rules when expense_type is missing", () => {
    const rulesMap = new Map<string, MerchantRule>([
      [
        "pension",
        {
          merchant_key: "pension",
          category: "חיסכון",
          expense_type: "savings",
          kind: "expense",
          default_note: null,
        },
      ],
    ]);
    const totals = monthNetFromTransactions(
      [
        txn({ txn_date: "2026-09-01", amount: 5000, kind: "income" }),
        txn({
          txn_date: "2026-09-02",
          amount: 1500,
          kind: "expense",
          merchant: "Pension Fund",
          description: "pension",
        }),
        txn({ txn_date: "2026-09-03", amount: 800, kind: "expense", category: "מזון" }),
      ],
      "2026-09",
      rulesMap
    );
    assert.equal(totals.actual_expense, 800);
    assert.equal(totals.net_actual, 4200);
  });

  it("uses split parts instead of the parent amount", () => {
    const totals = monthNetFromTransactions(
      [txn({ id: "parent", txn_date: "2026-09-05", amount: 500, kind: "expense", category: "קניות" })],
      "2026-09",
      undefined,
      new Map([
        [
          "parent",
          [
            { amount: 300, kind: "expense", expense_type: "variable" },
            { amount: 200, kind: "expense", expense_type: "savings" },
          ],
        ],
      ])
    );
    assert.equal(totals.actual_expense, 300);
    assert.equal(totals.net_actual, -300);
  });

  it("September-like totals when savings carry expense_type", () => {
    const totals = monthNetFromTransactions(
      [
        txn({ txn_date: "2026-09-01", amount: 4143, kind: "income" }),
        txn({ txn_date: "2026-09-02", amount: 2893, kind: "expense", category: "מזון" }),
        txn({
          txn_date: "2026-09-03",
          amount: 1762,
          kind: "expense",
          category: "חיסכון",
          expense_type: "savings",
        }),
      ],
      "2026-09"
    );
    assert.equal(totals.net_actual, 1250);
  });

  it("raw txn net differs from plan sections when card batch is not yet reconciled", () => {
    const lines: PlanLineRow[] = [
      {
        id: "1",
        plan_id: "p",
        line_type: "income",
        name: "הכנסות",
        category: null,
        planned_amount: 5000,
        sort_order: 0,
      },
      {
        id: "2",
        plan_id: "p",
        line_type: "variable",
        name: "מזון",
        category: "מזון",
        planned_amount: 1000,
        sort_order: 1,
      },
    ];
    const reconciled = [
      txn({ txn_date: "2026-09-01", amount: 4143, kind: "income" }),
      txn({ txn_date: "2026-09-05", amount: 2893, kind: "expense", category: "מזון" }),
      txn({
        txn_date: "2026-09-10",
        amount: 1762,
        kind: "expense",
        merchant: "מקס איט",
        description: "מקס איט פיננ",
        is_internal: true,
      }),
    ];
    const unreconciled = reconciled.map((t) =>
      t.merchant === "מקס איט" ? { ...t, is_internal: false } : t
    );
    const view = buildMonthPlanView("2026-09", "p", lines, reconciled);
    const raw = monthNetFromTransactions(unreconciled, "2026-09");
    assert.equal(monthNetFromPlanSections(view.totals), 1250);
    assert.equal(view.totals.net_actual, 1250);
    assert.equal(raw.net_actual, -512);
  });

  it("counts split income toward net", () => {
    const totals = monthNetFromTransactions(
      [txn({ id: "parent", txn_date: "2026-09-05", amount: 1000, kind: "income" })],
      "2026-09",
      undefined,
      new Map([
        [
          "parent",
          [
            { amount: 600, kind: "income" },
            { amount: 400, kind: "expense", expense_type: "variable" },
          ],
        ],
      ])
    );
    assert.equal(totals.actual_income, 600);
    assert.equal(totals.actual_expense, 400);
    assert.equal(totals.net_actual, 200);
  });
});
