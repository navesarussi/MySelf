/** Approximate USD→ILS rates for estimated foreign-card charges (monthly BOI-ish). */
const USD_ILS_BY_MONTH: Record<string, number> = {
  "2025-01": 3.65,
  "2025-02": 3.67,
  "2025-03": 3.68,
  "2025-04": 3.72,
  "2025-05": 3.68,
  "2025-06": 3.75,
  "2025-07": 3.72,
  "2025-08": 3.78,
  "2025-09": 3.76,
  "2025-10": 3.74,
  "2025-11": 3.72,
  "2025-12": 3.6,
  "2026-01": 3.58,
  "2026-02": 3.55,
  "2026-03": 3.62,
  "2026-04": 3.02,
  "2026-05": 2.98,
  "2026-06": 3.38,
  "2026-07": 3.51,
  "2026-08": 3.35,
  "2026-09": 3.4,
};

const DEFAULT_USD_ILS = 3.65;

export function estimateUsdToIls(usdAmount: number, txnDate: string): { ils: number; estimated: true } {
  const month = txnDate.slice(0, 7);
  const rate = USD_ILS_BY_MONTH[month] ?? DEFAULT_USD_ILS;
  return { ils: Math.round(usdAmount * rate * 100) / 100, estimated: true };
}

export function convertForeignToIls(
  amount: number,
  currency: string,
  txnDate: string
): { ils: number; estimated: boolean } {
  const cur = currency.trim().toUpperCase();
  if (cur === "ILS") return { ils: amount, estimated: false };
  if (cur === "USD") {
    const est = estimateUsdToIls(amount, txnDate);
    return { ils: est.ils, estimated: true };
  }
  // EUR and other majors — rough USD parity fallback, flagged estimated.
  const est = estimateUsdToIls(amount * 1.08, txnDate);
  return { ils: est.ils, estimated: true };
}
