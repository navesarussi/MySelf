type Kind = "income" | "expense";

const INCOME_HINTS =
  /זיכוי|משכורת|הפקדה|החזר|קצבה|מענק|דיבידנד|העברה דיגיטל|העברה מ|salary|refund|deposit/i;
const EXPENSE_HINTS =
  /עמלה|משיכה|חיוב|תשלום|סילוק|קני[הי]|apple\s*pay|מקס איט|סופר|רכישה/i;
const BANK_OPS = /עמלה|סילוק פיגור|ריבית|דמי כרטיס|עמלת/;

function blob(description?: string | null, merchant?: string | null): string {
  return `${description ?? ""} ${merchant ?? ""}`;
}

export function inferTxnKind(input: {
  signedAmount?: number | null;
  kind?: Kind;
  description?: string | null;
  merchant?: string | null;
}): Kind {
  const signed = Number(input.signedAmount);
  if (Number.isFinite(signed) && signed !== 0) {
    return signed > 0 ? "income" : "expense";
  }
  const text = blob(input.description, input.merchant);
  const incomeHit = INCOME_HINTS.test(text);
  const expenseHit = EXPENSE_HINTS.test(text);
  if (incomeHit && !expenseHit) return "income";
  if (expenseHit && !incomeHit) return "expense";
  if (input.kind === "income" || input.kind === "expense") return input.kind;
  return "expense";
}

export function isObviousBankFee(description: string | null | undefined): boolean {
  return BANK_OPS.test(description ?? "");
}

/** Skip "why?" for bank fees and internal transfers. */
export function shouldSkipCategorizationPrompt(input: {
  description?: string | null;
  merchant?: string | null;
  kind: Kind;
}): boolean {
  const text = blob(input.description, input.merchant);
  if (BANK_OPS.test(text)) return true;
  if (input.kind === "income" && /העברה דיגיטל|העברה מ|זיכוי|משכורת/.test(text)) return true;
  return false;
}

export function inferredCategory(input: {
  description?: string | null;
  merchant?: string | null;
  kind: Kind;
}): string | null {
  const text = blob(input.description, input.merchant);
  if (BANK_OPS.test(text)) return "אחר";
  if (input.kind === "income" && /משכורת|זיכוי|העברה/.test(text)) return null;
  return null;
}
