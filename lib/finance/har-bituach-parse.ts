import type { WealthCategory } from "@/lib/finance/wealth-types";

export type ParsedWealthLine = {
  category: WealthCategory;
  name: string;
  provider: string | null;
  balance: number;
};

const CATEGORY_HINTS: Array<{ pattern: RegExp; category: WealthCategory }> = [
  { pattern: /פנס|גמל|השתלמות|קרן פנס/i, category: "pension" },
  { pattern: /ביטוח|פוליס|פרמיה|חיים|בריאות|אובדן/i, category: "insurance" },
  { pattern: /דירה|נכס|משכנת|נדל/i, category: "property" },
  { pattern: /מניה|etf|השקע|תיק|קרן נאמנות/i, category: "investment" },
];

function guessCategory(line: string): WealthCategory {
  for (const { pattern, category } of CATEGORY_HINTS) {
    if (pattern.test(line)) return category;
  }
  return "other";
}

function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[,\s]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

/** Best-effort parse of pasted הר הביטוח / Cover text exports. */
export function parseWealthImportText(text: string): ParsedWealthLine[] {
  const lines = text
    .split(/\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 2);

  const results: ParsedWealthLine[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const amountMatch = line.match(/₪\s*([\d,]+(?:\.\d+)?)|([\d,]+(?:\.\d+)?)\s*₪/);
    if (!amountMatch) continue;

    const amount = parseAmount(amountMatch[1] ?? amountMatch[2]);
    if (!amount) continue;

    const namePart = line
      .replace(amountMatch[0], "")
      .replace(/[:\-|–—]+/g, " ")
      .trim();
    if (namePart.length < 2) continue;

    const key = `${namePart}:${amount}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const provider = namePart.includes(" - ") ? namePart.split(" - ")[0].trim() : null;
    results.push({
      category: guessCategory(line),
      name: namePart.slice(0, 80),
      provider,
      balance: amount,
    });
  }

  return results;
}
