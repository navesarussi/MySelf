import { createHash } from "crypto";
import { unreverseRtlDateToken } from "@/lib/finance/import/rtl-date";
import type { ParseFileResult, ParsedImportTransaction } from "@/lib/finance/import/types";

const RTL_DATE = /\b(\d{4}\/\d{2}\/\d{2})\b/g;
const AMOUNT_LINE = /^(?:₪|EU|\$)\s*(-?\d[\d,.]*)/;
const AMOUNT_INLINE = /^(-?\d[\d,.]*)\s+(\d{4}\/\d{2}\/\d{2})$/;

function parseAmount(raw: string, currencyPrefix?: string): { amount: number; currency: string } | null {
  const cleaned = raw.replace(/,/g, "").trim();
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n === 0) return null;
  const currency =
    currencyPrefix === "$" ? "USD" : currencyPrefix === "EU" || currencyPrefix === "₪" ? "ILS" : "ILS";
  return { amount: Math.abs(n), currency };
}

function reverseMerchantLabel(raw: string): string {
  const trimmed = raw.trim();
  if (/[\u0590-\u05FF]/.test(trimmed)) return trimmed;
  return trimmed
    .split(/\s+/)
    .map((w) => w.split("").reverse().join(""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function makeSourceRef(parts: Record<string, string | number>): string {
  const raw = Object.entries(parts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("|");
  return `cal:import:${createHash("sha256").update(raw).digest("hex").slice(0, 24)}`;
}

function extractCardMeta(text: string): Record<string, unknown> {
  const cardLast4 = text.match(/(\d{4})\s*$/m);
  const creditLimit = text.match(/₪\s*([\d,]+)/);
  const billingTotal = text.match(/₪\s*([\d,]+)סיטרכל/i);
  const cardMask = text.match(/(\d{10,}-\d{3}-\d{2})/);
  const isPaybox = /פייבוקס|pay\s*box|xoByaP/i.test(text);
  return {
    card_last4: cardLast4?.[1] ?? null,
    card_mask: cardMask?.[1] ?? null,
    credit_limit_ils: creditLimit ? Number(creditLimit[1].replace(/,/g, "")) : null,
    statement_total_ils: billingTotal ? Number(billingTotal[1].replace(/,/g, "")) : null,
    paybox: isPaybox,
  };
}

/** Parse Cal / Visa Leumi / PayBox monthly statement PDFs. */
export function parseCalStatementPdf(text: string): ParseFileResult {
  const meta = extractCardMeta(text);
  const label = meta.paybox ? "Cal PayBox" : "Cal Visa Leumi";
  const warnings: string[] = [];
  const transactions: ParsedImportTransaction[] = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  let pendingMerchant: string | null = null;
  let pendingTxnDate: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const inline = line.match(AMOUNT_INLINE);
    if (inline) {
      const amt = parseAmount(inline[1]);
      const booked = unreverseRtlDateToken(inline[2]);
      if (amt && booked) {
        transactions.push({
          booked_at: booked,
          amount: amt.amount,
          kind: inline[1].startsWith("-") ? "income" : "expense",
          description: pendingMerchant ?? "Cal",
          merchant: pendingMerchant,
          currency: amt.currency,
          source_ref: makeSourceRef({ d: booked, a: amt.amount, m: pendingMerchant ?? "cal" }),
          raw: { line: i + 1, pattern: "inline" },
        });
        pendingMerchant = null;
        pendingTxnDate = null;
      }
      continue;
    }

    const amtMatch = line.match(AMOUNT_LINE);
    if (amtMatch) {
      const prefix = amtMatch[0].trim().charAt(0) === "₪" ? "₪" : amtMatch[0].includes("$") ? "$" : "EU";
      const amt = parseAmount(amtMatch[1], prefix);
      const booked = pendingTxnDate ?? pendingMerchant?.match(RTL_DATE)?.[1];
      let bookedAt: string | null = null;
      if (booked) {
        const token = typeof booked === "string" && booked.includes("/") ? booked : null;
        bookedAt = token ? unreverseRtlDateToken(token) : null;
      }
      if (!bookedAt && pendingMerchant) {
        const m = pendingMerchant.match(/\b(\d{4}\/\d{2}\/\d{2})\b/);
        if (m) bookedAt = unreverseRtlDateToken(m[1]);
      }
      if (amt && bookedAt) {
        const merchant = pendingMerchant
          ? reverseMerchantLabel(pendingMerchant.replace(/\b\d{4}\/\d{2}\/\d{2}\b/g, "").trim())
          : "Cal";
        transactions.push({
          booked_at: bookedAt,
          amount: amt.amount,
          kind: amtMatch[1].startsWith("-") ? "income" : "expense",
          description: merchant || "Cal",
          merchant: merchant || null,
          currency: amt.currency,
          source_ref: makeSourceRef({ d: bookedAt, a: amt.amount, m: merchant }),
          raw: { line: i + 1, pattern: "amount_line" },
        });
        pendingMerchant = null;
        pendingTxnDate = null;
      }
      continue;
    }

    const dateOnly = line.match(/^(\d{4}\/\d{2}\/\d{2})$/);
    if (dateOnly) {
      pendingTxnDate = unreverseRtlDateToken(dateOnly[1]);
      continue;
    }

    const merchantDate = line.match(/^(.+?)\s+(\d{4}\/\d{2}\/\d{2})$/);
    if (merchantDate && !/^(₪|EU|\$)/.test(merchantDate[1])) {
      pendingMerchant = merchantDate[1].trim();
      pendingTxnDate = unreverseRtlDateToken(merchantDate[2]);
      continue;
    }

    if (/^[A-Za-z0-9*.,\s/-]{4,}$/.test(line) && !/PRD-|ctovet|www\./i.test(line)) {
      pendingMerchant = line;
    }
  }

  const deduped = new Map<string, ParsedImportTransaction>();
  for (const t of transactions) deduped.set(t.source_ref, t);

  if (deduped.size === 0) {
    warnings.push("no_transactions_found");
  }

  return {
    source: "cal",
    accountLabel: label,
    accountMetadata: meta,
    transactions: [...deduped.values()],
    warnings,
  };
}
