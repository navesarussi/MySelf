/**
 * Dictionary-based Hebrew merchant segmentation for display labels.
 * DP / longest-match: maximize known tokens; opaque chunks only when needed (≥ 3 letters).
 */

function compactHebrew(s: string): string {
  return s.replace(/[\s"'-]/g, "");
}

/** Compact for segmentation — keeps geresh so brand names like ג'נט stay readable. */
function compactForSegment(s: string): string {
  return s.replace(/[\s-]/g, "");
}

/** Cal category prefixes — full spaced + glued truncated forms (longest first). */
export const CAL_GLUED_CATEGORY_PREFIXES = [
  "מזון ומשקאות",
  "מזוןומשקא",
  "מזון מהיר",
  "מזוןמהיר",
  "פנאי בילוי",
  "פנאיבילוי",
  "פנאיבילו",
  "רכבות חבור",
  "רכבותחבור",
  "ריהוט ובית",
  "ריהוט בית",
  "ריהוטובית",
  "עמותות ותר",
  "עמותותותר",
  "ציוד ומשרד",
  "ציודומשרד",
  "ביטוח ופינ",
  "מוצרי און",
  "מוצריאון",
  "חדשהבכרטיס",
  "מסעדות",
  "מוסדות",
  "אנרגיה",
  "תיירות",
  "רפואה",
  "אופנה",
] as const;

const CITY_TOKENS = [
  "תל אביב",
  "ראשון לציון",
  "כפר סבא",
  "גבעתיים",
  "פתח תקווה",
  "קרית מלאכי",
  "קרית גת",
  "קרית אונו",
  "באר יעקב",
  "מצפה רמון",
  "רמת גן",
  "הרצליה",
  "נתניה",
  "חבצלת השרון",
  "ראש העין",
  "עזריאלי",
  "פלורנטין",
  "שרונה",
  "יקום",
  "מודיעין",
  "אשדוד",
  "אילת",
  "טבריה",
  "חולון",
  "לוד",
  "רמלה",
  "חיפה",
  "ירושלים",
  "בית שמש",
  "בית לחם",
  "רמות",
  "צמרת",
  "ביג",
  "שדה",
  "השרון",
] as const;

const MERCHANT_TOKENS = [
  "חברת החשמל לישראל",
  "חברת החשמל",
  "רשות הטבע והגנים",
  "משרד התחבורה",
  "מי שקמה",
  "פיצה האט",
  "ישירות בעיר",
  "סופר-פארם",
  "סופר פארם",
  "רמי לוי",
  "רמילוי",
  "אושר עד",
  "שופרסל",
  "ויקטורי",
  "מינימרקט",
  "מכולת",
  "מרכול",
  "מרקט",
  "סיטונאית",
  "סיטונאות",
  "משתלה",
  "חניונים",
  "חניון",
  "מסעדת",
  "מסעדה",
  "בורגר",
  "בורגרס",
  "שווארמה",
  "הזמנת",
  "אונליין",
  "משלוח",
  "מטבח",
  "ישראלי",
  "ישראל",
  "קולינרי",
  "אינטרנט",
  "האופים",
  "המלביה",
  "הבורקס",
  "המחתרת",
  "התאילנדית",
  "הנכד",
  "הצפונית",
  "הבוריקה",
  "הפיצה",
  "הפלאפל",
  "המאפיה",
  "המכולת",
  "האימפריה",
  "המשרד",
  "התחנה",
  "השוק",
  "הפינה",
  "הלבנה",
  "העיר",
  "החוף",
  "הגשר",
  "השדה",
  "התחבורה",
  "רשיונות",
  "נהיגה",
  "נהיג",
  "עיריית",
  "עירייה",
  "סונול",
  "דלק",
  "פז",
  "טן",
  "דור",
  "אלון",
  "אלונית",
  "שופר",
  "סופר",
  "פארם",
  "פיצה",
  "פיצוח",
  "פלאפל",
  "מאפה",
  "מאפיית",
  "מאפיה",
  "קפה",
  "ארומה",
  "סושי",
  "גריל",
  "בירות",
  "בריכה",
  "בינוי",
  "חניונ",
  "אופניים",
  "אופנים",
  "יין",
  "משקאות",
  "פירות",
  "ירקות",
  "בית",
  "בתי",
  "כלבו",
  "כפר",
  "מרכז",
  "מתחם",
  "קניון",
  "קניונית",
  "חנויות",
  "חנות",
  "נוחות",
  "אגס",
  "ניו",
  "קוקטייל",
  "שאפה",
  "שיבא",
  "לינקולן",
  "מועדון",
  "צומת",
  "ספרים",
  "חוצות",
  "גן",
  "סיפור",
  "זיגו",
  "כרטיסים",
  "לאירועים",
  "למטייל",
  "ולספורטאי",
  "טופ",
  "הודנא",
  "שלום",
  "דרום",
  "צפון",
  "מזרח",
  "מערב",
  "מורדן",
  "ליז",
  "סרכבת",
  "רכבת",
  "כביש",
  "חשמל",
  "גז",
  "מילוד",
  "מישק",
  "שקמה",
  "תאגיד",
  "המים",
  "אספני",
  "אספנ",
  "חלומות",
  "הילדות",
  "לציון",
  "ראשון",
  "גבעת",
  "עמלת",
  "בעמ",
  'בע"מ',
  "חומוס",
  "בנא",
  "מינימיס",
  "סוזן",
  "חסונה",
  "אמברוק",
  "אליהו",
  "אילנס",
  "הצאנס",
  "סיטימרקט",
  "ההגנה",
  "פמיפרימיום",
  "ופינ",
  "ת\"א",
  "בינו",
  "קרית",
] as const;

type CompactToken = { display: string; compact: string };

const SHORT_TOKEN_ALLOW = new Set(["פז", "טן", "בר"]);

function buildCompactTokens(words: readonly string[]): CompactToken[] {
  const seen = new Set<string>();
  const out: CompactToken[] = [];
  for (const display of words) {
    const compact = compactForSegment(display);
    if (!compact || seen.has(compact)) continue;
    const isMulti = display.includes(" ");
    if (!isMulti && compact.length < 3 && !SHORT_TOKEN_ALLOW.has(compact)) continue;
    seen.add(compact);
    out.push({ display, compact });
  }
  return out.sort((a, b) => b.compact.length - a.compact.length);
}

const SEGMENT_TOKENS: CompactToken[] = buildCompactTokens([
  ...CITY_TOKENS,
  ...MERCHANT_TOKENS,
]);

/** Category prefixes that only match with a trailing space (avoid mid-word glued false positives). */
const SPACED_ONLY_PREFIXES = new Set<string>(["ביטוח ופינ"]);

const CARD_NEW_PREFIX = "חדשהבכרטיס";

/** Lone Cal category blobs → readable spaced labels. */
const LONE_CATEGORY_LABELS: Record<string, string> = {
  "מזוןומשקא": "מזון ומשקאות",
  "מזון ומשקאות": "מזון ומשקאות",
  "ריהוטובית": "ריהוט ובית",
  "ריהוט ובית": "ריהוט ובית",
  "פנאיבילוי": "פנאי ובילוי",
  "פנאיבילו": "פנאי ובילוי",
  "פנאי בילוי": "פנאי ובילוי",
  "מוצריאון": "מוצרי און",
  "מוצרי און": "מוצרי און",
};

const GLUED_CATEGORY_LABELS: Record<string, string> = {
  פנאיבילוי: "פנאי ובילוי",
  פנאיבילו: "פנאי ובילוי",
  מוצריאון: "מוצרי און",
};

export function sliceAfterCompactPrefix(text: string, prefixCompactLen: number): string {
  let ci = 0;
  let oi = 0;
  while (oi < text.length && ci < prefixCompactLen) {
    if (!/[\s"'-]/.test(text[oi])) ci++;
    oi++;
  }
  return text.slice(oi).trim();
}

/** Strip Cal category prefix (spaced or glued). Remainder must have ≥ 2 meaningful letters. */
/** Strip Cal "new on card" marker before category/merchant remainder. */
export function stripCardNewPrefix(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;

  if (trimmed.startsWith(`${CARD_NEW_PREFIX} `) || trimmed === CARD_NEW_PREFIX) {
    const rest = trimmed.slice(CARD_NEW_PREFIX.length).trim();
    if (meaningfulCharCount(rest) >= 2) return rest;
  }

  const compact = compactHebrew(trimmed);
  const prefixC = compactHebrew(CARD_NEW_PREFIX);
  if (compact.startsWith(prefixC) && compact.length > prefixC.length) {
    const rest = sliceAfterCompactPrefix(trimmed, prefixC.length);
    if (meaningfulCharCount(rest) >= 2) return rest;
  }
  return trimmed;
}

export function stripCategoryAndCardPrefixes(text: string): string {
  let s = text.trim();
  for (let i = 0; i < 4; i++) {
    const next = stripCategoryPrefix(stripCardNewPrefix(s));
    if (next === s) break;
    s = next;
  }
  return s;
}

export function expandLoneCategoryLabel(text: string): string {
  const t = text.trim();
  if (LONE_CATEGORY_LABELS[t]) return LONE_CATEGORY_LABELS[t];
  const compact = compactHebrew(t);
  for (const [key, label] of Object.entries(LONE_CATEGORY_LABELS)) {
    if (compactHebrew(key) === compact) return label;
  }
  return t;
}

export function expandGluedCategoryLabel(text: string): string {
  const compact = compactHebrew(text.trim());
  return GLUED_CATEGORY_LABELS[compact] ?? text.trim();
}

export function stripInsuranceCategoryPrefix(text: string): string {
  const trimmed = text.trim();
  if (/^ביטוח\s+ופינ\s+/iu.test(trimmed)) {
    return trimmed.replace(/^ביטוח\s+ופינ\s+/iu, "").trim();
  }
  const compact = compactHebrew(trimmed);
  const prefix = compactHebrew("ביטוח ופינ");
  if (compact.startsWith(prefix) && compact.length > prefix.length) {
    return sliceAfterCompactPrefix(trimmed, prefix.length);
  }
  return trimmed;
}

export function stripCategoryPrefix(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;

  for (const cat of CAL_GLUED_CATEGORY_PREFIXES) {
    if (trimmed.startsWith(`${cat} `) || trimmed === cat) {
      const rest = trimmed.slice(cat.length).trim();
      if (meaningfulCharCount(rest) >= 2) return rest;
    }
  }

  const compact = compactHebrew(trimmed);
  let bestRest: string | null = null;
  let bestRemainderScore = -1;
  for (const cat of CAL_GLUED_CATEGORY_PREFIXES) {
    if (SPACED_ONLY_PREFIXES.has(cat)) continue;
    const catC = compactHebrew(cat);
    if (!compact.startsWith(catC) || compact.length <= catC.length) continue;
    const rest = sliceAfterCompactPrefix(trimmed, catC.length);
    const score = meaningfulCharCount(rest);
    if (score >= 2 && score > bestRemainderScore) {
      bestRemainderScore = score;
      bestRest = rest;
    }
  }
  if (bestRest !== null) return bestRest;
  return trimmed;
}

export function meaningfulCharCount(s: string): number {
  return (s.match(/[\u0590-\u05FFA-Za-z]/g) ?? []).length;
}

type SegState = { parts: string[]; tokenCount: number };

/** DP segmentation: maximize known tokens; allow opaque chunks (≥ 3 letters) between tokens. */
export function segmentMerchantRemainder(text: string): string {
  const raw = text.trim();
  if (raw.includes("'") || raw.includes("\u05f3")) return raw;
  const s = compactForSegment(raw);
  if (s.length < 3) return raw;

  const n = s.length;
  const memo = new Map<number, SegState | null>();

  function solve(pos: number): SegState | null {
    if (pos === n) return { parts: [], tokenCount: 0 };
    const cached = memo.get(pos);
    if (cached !== undefined) return cached;

    let best: SegState | null = null;
    const consider = (parts: string[], tokenCount: number) => {
      const candidate = { parts, tokenCount };
      if (
        !best ||
        tokenCount > best.tokenCount ||
        (tokenCount === best.tokenCount && parts.length < best.parts.length)
      ) {
        best = candidate;
      }
    };

    for (const { display, compact } of SEGMENT_TOKENS) {
      if (pos + compact.length <= n && s.slice(pos, pos + compact.length) === compact) {
        const sub = solve(pos + compact.length);
        if (sub) consider([display, ...sub.parts], sub.tokenCount + 1);
      }
    }

    if (n - pos >= 3) {
      for (let len = 3; len <= n - pos; len++) {
        const sub = solve(pos + len);
        if (sub) consider([s.slice(pos, pos + len), ...sub.parts], sub.tokenCount);
      }
    }

    memo.set(pos, best);
    return best;
  }

  const result = solve(0);
  if (!result || result.tokenCount === 0) return raw;
  return result.parts.join(" ").replace(/\s+/g, " ").trim();
}

/** Strip trailing company suffixes and dangling hyphens for display. */
export function stripCompanySuffix(text: string): string {
  return text
    .replace(/(?:^|\s|(?<=[\u0590-\u05FF]))בע['"]{1,2}מ\.?\s*$/u, "")
    .replace(/(?:^|\s|(?<=[\u0590-\u05FF]))בע['"]{1,2}\s*$/u, "")
    .replace(/(?:^|\s|(?<=[\u0590-\u05FF]))בעמ\.?\s*$/iu, "")
    .replace(/(?<=[\u0590-\u05FF]{3,})בע\s*$/u, "")
    .replace(/-+\s*$/u, "")
    .trim();
}

/** Collapse common glued brand spellings after segmentation. */
export function normalizeBrandPhrases(text: string): string {
  let s = text;
  const rules: Array<[RegExp, string]> = [
    [/חברת\s*ה?חשמל\s*(?:ל?ישראל)?/giu, "חברת החשמל לישראל"],
    [/פיצה\s*האט/giu, "פיצה האט"],
    [/רמי\s*לוי|רמילוי/giu, "רמי לוי"],
    [/רשות\s*ה?טבע\s*ו?ה?גנים/giu, "רשות הטבע והגנים"],
    [/משרד\s*ה?תחבורה/giu, "משרד התחבורה"],
    [/מי\s*ש?קמה/giu, "מי שקמה"],
    [/סופר\s*-?\s*פאר\s*-?\s*ם?/giu, "סופר-פארם"],
    [/ויקט?ורי/giu, "ויקטורי"],
    [/שופר\s*סל/giu, "שופרסל"],
    [/אושר\s*עד/giu, "אושר עד"],
    [/ראשון\s*ל?\s*ציון/giu, "ראשון לציון"],
    [/כפר\s*סבא/giu, "כפר סבא"],
    [/תל\s*א?ביב|ת"\s*א/giu, "תל אביב"],
    [/ראש\s*ה?\s*עין/giu, "ראש העין"],
    [/בית\s*ש?מש/giu, "בית שמש"],
    [/רמלה\s*לוד|רמלוד/giu, "רמלה לוד"],
    [/חסונה/giu, "חסון"],
    [/^מילוד(?:\s+בע)?$/giu, "מי לוד"],
    [/^כביש$/giu, "כביש 6"],
    [/פמי\s*פרימיום|פמיפרימיום/giu, "פמי פרימיום"],
    [/גזאלקטרהפאוור(?:סופרגז)?/giu, (m) =>
      /סופרגז/i.test(m) ? "אלקטרה פאוור סופרגז" : "אלקטרה פאוור"],
    [/(?<![\u0590-\u05FF])גז(?=אלקטרה)/giu, ""],
    [/גו\s*אה/giu, "גו אה"],
    [/לישראל\s*בע$/giu, "לישראל"],
    [/לישראלבע$/giu, "לישראל"],
  ];
  for (const [re, rep] of rules) s = s.replace(re, rep);
  return s.replace(/\s+/g, " ").trim();
}

function segmentGluedParts(text: string): string {
  if (!/\s/.test(text)) {
    const compact = compactForSegment(text);
    return compact.length >= 3 ? segmentMerchantRemainder(compact) : text;
  }
  return text
    .split(/\s+/)
    .map((part) => {
      const c = compactForSegment(part);
      return c.length >= 6 ? segmentMerchantRemainder(c) : part;
    })
    .join(" ");
}

export function formatHebrewMerchantRemainder(text: string): string {
  let s = stripInsuranceCategoryPrefix(stripCompanySuffix(text.trim()));
  s = segmentGluedParts(s);
  s = normalizeBrandPhrases(s);
  s = expandLoneCategoryLabel(stripCompanySuffix(s));
  return s;
}
