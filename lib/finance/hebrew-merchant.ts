/** Shared Hebrew merchant/description spacing for imports, keys, and display. */

const HEBREW_LOCATION_NOISE =
  /^(?:לא\s+)?(?:אירלנד|ארה"ב|ארצות\s*הברית|בריטניה|אירופה|חו"ל|ישראל|תל\s*אביב|ירושלים|חיפה)$/u;

/** Common Hebrew tokens glued in PDF/spreadsheet extraction (longest first). */
const HEBREW_VOCAB = [
  "ארצות הברית",
  "הוראת קבע",
  "לא הוראת קבע",
  "לא הוראת",
  "מוצרי און",
  "סופר פאר",
  "סופר-פאר",
  "לא אירלנד",
  "תל אביב",
  "בית עסק",
  "תחבורה",
  "ברכבות",
  "רכבות",
  "עמותות",
  "תר",
  "הוראת",
  "ארנונה",
  "אירלנד",
  "מוצרי",
  "תשלומים",
  "ירושלים",
  "ביטוח",
  "חשמל",
  "ישראל",
  "כביש",
  "חבור",
  "חיפה",
  "לובי",
  "סופר",
  "קבע",
  "פאר",
  "דלק",
  "מים",
  "און",
  "לא",
  "שק",
].sort((a, b) => b.length - a.length);

function segmentGluedHebrew(text: string): string {
  let rest = text.replace(/\s+/g, "");
  if (!rest) return text.trim();
  const parts: string[] = [];
  while (rest.length > 0) {
    let matched = "";
    for (const word of HEBREW_VOCAB) {
      const compact = word.replace(/\s+/g, "");
      if (rest.startsWith(compact)) {
        matched = word;
        rest = rest.slice(compact.length);
        break;
      }
    }
    if (!matched) {
      const m = rest.match(/^[\u0590-\u05FF]+/u);
      if (!m) break;
      parts.push(m[0]);
      rest = rest.slice(m[0].length);
      continue;
    }
    parts.push(matched);
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/** Insert readable spaces in RTL Hebrew merchant/description text. */
export function normalizeHebrewDescription(text: string): string {
  let out = text
    .replace(/([^\s|])(\|)([^\s|])/g, "$1 $3")
    .replace(/([\u0590-\u05FF])([A-Za-z0-9])/g, "$1 $2")
    .replace(/([A-Za-z0-9])([\u0590-\u05FF])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();

  const hebrewRuns = out.match(/[\u0590-\u05FF"']+/gu) ?? [];
  for (const run of hebrewRuns) {
    if (run.length >= 8 && !/\s/.test(run)) {
      const segmented = segmentGluedHebrew(run);
      if (segmented.includes(" ")) out = out.replace(run, segmented);
    }
  }
  return out.replace(/\s+/g, " ").trim();
}

export function isHebrewLocationNoise(text: string): boolean {
  return HEBREW_LOCATION_NOISE.test(text.trim());
}
