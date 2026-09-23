/** Build Hebrew/English display label for installment rows. */
export function formatInstallmentLabel(index: number, total: number, locale: "he" | "en" = "he"): string {
  if (index < 1 || total < 1 || index > total) return "";
  return locale === "he" ? `${index} מתוך ${total}` : `${index} of ${total}`;
}

export function parseInstallmentLabel(label: string): { index: number; total: number } | null {
  const he = label.match(/(\d{1,2})\s*מתוך\s*(\d{1,2})/);
  if (he) {
    const index = Number(he[1]);
    const total = Number(he[2]);
    if (index >= 1 && total >= 1 && index <= total) return { index, total };
  }
  const en = label.match(/(\d{1,2})\s*(?:of|\/)\s*(\d{1,2})/i);
  if (en) {
    const index = Number(en[1]);
    const total = Number(en[2]);
    if (index >= 1 && total >= 1 && index <= total) return { index, total };
  }
  return null;
}
