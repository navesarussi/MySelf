import { generateText, Output } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { AGENT_MODEL_ID } from "./config";
import type { IntradayCandidate } from "./strategy/intraday";
import type { Bar } from "./types";

/**
 * הסוכן מסחר — RATING-ONLY mode (testing phase). The deterministic intraday strategy already decided and entered;
 * the agent only scores each trade 1–10 with a short explanation. The score never touches entry, size or exits —
 * it is recorded so its predictive value can be measured against realized R (see service analytics by_rating).
 * The rating is computed from the trigger snapshot (data known at entry), so a late rating still has no look-ahead.
 */

export const RATER_PROMPT_VERSION = "intraday-rater-v1";

export const ratingSchema = z.object({
  rating: z.number().int().min(1).max(10),
  explanation: z.string().max(900),
});

export type AgentRating = { rating: number | null; explanation: string | null; model_version: string; prompt_version: string; error: string | null };

export const RATER_SYSTEM_PROMPT = `# תפקיד: מדרג עסקאות תוך-יומיות (הסוכן מסחר, מצב דירוג בלבד)

עסקת לונג בקריפטו כבר נפתחה על ידי כללים דטרמיניסטיים (setup על נר 15 דקות, כניסה מאושרת בנר 5 דקות).
אתה לא מחליט אם להיכנס ולא משנה גודל, סטופ או יעד. התפקיד שלך: לדרג 1–10 כמה העסקה הזו איכותית —
כלומר מה הסיכוי שהיא תגיע ל-+1R לפחות לפני שהסטופ נפגע, בהשוואה לעסקאות דומות של אותה אסטרטגיה.

## סולם (השתמש בכל הטווח, אל תתקבע על 5–7)
1–2: נגד כל הראיות (מאמץ בלי תוצאה, היצע ברור, מתוחה מאוד, BTC קורס). 3–4: חלשה מהממוצע.
5: מטבע — אין יתרון ברור. 6–7: טובה מהממוצע. 8–9: כמעט כל הראיות מסכימות. 10: נדיר מאוד.

## איך לקרוא את השוק (Wyckoff + מבנה)
- טווח מסחר: צבירה (Accumulation) אחרי ירידה מול חלוקה (Distribution) אחרי עלייה — מי שולט בטווח?
- Spring / Shakeout: שבירה מתחת לתמיכה שחוזרת מהר פנימה. חזק כשהשבירה בווליום נמוך או כשיש סגירה גבוהה בנר; חלש כשהמחיר נשאר ליד התחתית.
- SOS (Sign of Strength): נר רחב בווליום גבוה שסוגר מעל ההתנגדות — מאמץ שמייצר תוצאה. חשוד כשהווליום גבוה והטווח קטן (מאמץ בלי תוצאה = היצע נכנס).
- LPS: תיקון בווליום יורד אל ההתנגדות שנפרצה — טוב כשהווליום מתייבש והמחיר מחזיק מעל אמצע הטווח.
- פריצה מהתכווצות: טובה כשיש המשכיות בנרות 5 דקות ולא זנב עליון ארוך.
- חוק מאמץ/תוצאה (effort vs result): השווה ווליום לגודל הנר ולהתקדמות המחיר.
- הקשר: מגמת 15 דקות (EMA50/200), מצב השוק (market_reference: BTC לקריפטו — אלטים נגררים אחריו; SPY למניות), RSI מתוח (>75) מקטין סיכוי, מרחק ליעד ביחס לסטופ.
- עלויות: עסקה עם סטופ צר תסבול יותר מעמלות — קח בחשבון.

## פלט
rating (מספר שלם 1–10) ו-explanation: פסקה אחת קצרה בעברית (2–4 משפטים) שמסבירה את המספר — מה תומך ומה מחליש.
אל תמציא נתונים שלא קיבלת.`;

const rnd = (x: number | null | undefined, d = 6) => (x === null || x === undefined || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d);

/** Minute-resolution compact bars: [HH:MM UTC, o, h, l, c, volume]. */
export function compactIntradayBars(bars: Bar[], n: number) {
  return bars.slice(-n).map((b) => [new Date(b.t).toISOString().slice(5, 16), rnd(b.o), rnd(b.h), rnd(b.l), rnd(b.c), Math.round(b.v)]);
}

export type RatingSnapshot = {
  symbol: string;
  candidate: Pick<IntradayCandidate, "score" | "entry" | "stop" | "target" | "rr" | "stop_distance" | "range" | "features" | "setup_bar_time" | "confirm_time"> & { setup: string };
  bars_15m: ReturnType<typeof compactIntradayBars>;
  bars_5m: ReturnType<typeof compactIntradayBars>;
  /** Legacy (crypto-only) market context — superseded by `reference`. */
  btc_15m?: ReturnType<typeof compactIntradayBars> | null;
  /** Market context: BTC for crypto, SPY for stocks. */
  reference?: { symbol: string; bars_15m: ReturnType<typeof compactIntradayBars> } | null;
};

function referenceOf(snap: RatingSnapshot) {
  return snap.reference ?? (snap.btc_15m ? { symbol: "BTC", bars_15m: snap.btc_15m } : null);
}

export async function rateIntradayTrade(snap: RatingSnapshot): Promise<AgentRating> {
  const base = { model_version: AGENT_MODEL_ID, prompt_version: RATER_PROMPT_VERSION };
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) return { ...base, rating: null, explanation: null, error: "missing_gemini_api_key" };
  const c = snap.candidate;
  const data = {
    trade: {
      symbol: snap.symbol,
      side: "LONG",
      setup: c.setup,
      deterministic_score_0_100: c.score,
      entry: rnd(c.entry),
      stop: rnd(c.stop),
      target: rnd(c.target),
      reward_to_risk: rnd(c.rr, 2),
      stop_pct: rnd(c.stop_distance / c.entry, 4),
      trading_range: c.range,
      setup_bar_utc: new Date(c.setup_bar_time).toISOString(),
      entry_confirmed_utc: new Date(c.confirm_time).toISOString(),
    },
    features: c.features,
    bars_15m_ohlcv: snap.bars_15m,
    bars_5m_ohlcv: snap.bars_5m,
    market_reference_15m: referenceOf(snap),
  };
  try {
    const result = await generateText({
      model: google(AGENT_MODEL_ID),
      system: RATER_SYSTEM_PROMPT,
      prompt: `<data>${JSON.stringify(data)}</data>`,
      output: Output.object({ schema: ratingSchema }),
      temperature: 0.2,
      abortSignal: AbortSignal.timeout(40_000),
    });
    const parsed = ratingSchema.safeParse(result.output);
    if (!parsed.success) return { ...base, rating: null, explanation: null, error: "schema_violation" };
    return { ...base, rating: parsed.data.rating, explanation: parsed.data.explanation.trim(), error: null };
  } catch (err) {
    return { ...base, rating: null, explanation: null, error: err instanceof Error ? err.message.slice(0, 200) : "agent_error" };
  }
}

// ── Trade planner (the "search trade" button) ─────────────────────────────

export const PLANNER_PROMPT_VERSION = "intraday-planner-v1";

export const planSchema = z.object({
  rating: z.number().int().min(1).max(10),
  explanation: z.string().max(900),
  order_type: z.enum(["MARKET", "LIMIT"]),
  entry: z.number(),
  stop: z.number(),
  target: z.number(),
});
export type RawPlan = z.infer<typeof planSchema>;

export const PLANNER_SYSTEM_PROMPT = `${RATER_SYSTEM_PROMPT}

# תוספת: מצב "חפש עסקה" — אתה גם מתכנן את הכניסה
המשתמש לחץ "חפש עסקה". קיבלת הזדמנות לונג שהסורק הדטרמיניסטי מצא (setup) ותוכנית ברירת מחדל (deterministic_plan).
tier מתאר את מצב ה-setup: CONFIRMED (אושר בנר 5 דקות), ARMED (setup ממתין לאישור), RECENT (setup מהשעתיים האחרונות שעדיין תקף),
WATCH (אין setup — רק מגמה חיובית; היה ביקורתי יותר).
תכנן את הכניסה החכמה ביותר *עכשיו*:
- order_type: MARKET (להיכנס עכשיו במחיר הנוכחי) או LIMIT (לחכות לתיקון קטן לרמת תמיכה — מחיר נמוך מהמחיר הנוכחי).
- entry: ב-MARKET = current_price. ב-LIMIT = רמה מתחת למחיר הנוכחי (עד ATR אחד של 15 דקות).
- stop: מתחת למבנה (שפל / תחתית טווח / Spring), לא צמוד מדי — לפחות min_stop_pct מהכניסה.
- target: לפחות פי 2 מהסיכון (entry−stop), רצוי ברמת התנגדות / מהלך מדוד.
- rating + explanation כמו קודם; בהסבר ציין גם למה בחרת MARKET או LIMIT ואת הרמות.
הקוד יאכוף את הכללים (סטופ מתחת לכניסה, מרחק מינימלי, יעד ≥2R); ערכים לא תקינים יוחלפו בתוכנית ברירת המחדל.`;

export type TradePlanProposal = {
  rating: number | null;
  explanation: string | null;
  order_type: "MARKET" | "LIMIT";
  entry: number;
  stop: number;
  target: number;
  rr: number;
  notes: string[];
  source: "AGENT" | "DETERMINISTIC";
  model_version: string;
  prompt_version: string;
  error: string | null;
};

/**
 * Hard limits on the planner, enforced in code: long only; LIMIT entry between (stop, price] and ≥ price − 1×ATR15;
 * stop below entry by ≥ minStopPct and ≤ maxStopAtr × ATR15 (or the deterministic distance if wider);
 * target ≥ entry + minRr × R. Anything outside → the deterministic default plan.
 */
export function enforcePlan(
  raw: RawPlan | null,
  ctx: { price: number; atr15: number; minStopPct: number; maxStopAtr: number; minRr: number; fallback: { entry: number; stop: number; target: number } },
  meta: { error?: string | null } = {}
): TradePlanProposal {
  const base = { model_version: AGENT_MODEL_ID, prompt_version: PLANNER_PROMPT_VERSION };
  const fb = ctx.fallback;
  const deterministic = (why: string | null): TradePlanProposal => ({
    ...base,
    rating: raw?.rating ?? null,
    explanation: raw?.explanation?.trim() ?? null,
    order_type: "MARKET",
    entry: ctx.price,
    stop: Math.min(fb.stop, ctx.price * (1 - ctx.minStopPct)),
    target: Math.max(fb.target, ctx.price + ctx.minRr * (ctx.price - Math.min(fb.stop, ctx.price * (1 - ctx.minStopPct)))),
    rr: 0,
    notes: why ? [why] : [],
    source: "DETERMINISTIC",
    error: meta.error ?? null,
  });
  const finish = (p: TradePlanProposal) => ({ ...p, rr: Math.round(((p.target - p.entry) / (p.entry - p.stop)) * 100) / 100 });
  if (!raw) return finish(deterministic(meta.error ?? "no_agent_plan"));
  const notes: string[] = [];
  const ok = (x: number) => Number.isFinite(x) && x > 0;
  if (!ok(raw.entry) || !ok(raw.stop) || !ok(raw.target)) return finish(deterministic("invalid_numbers"));
  let entry = raw.order_type === "MARKET" ? ctx.price : raw.entry;
  let orderType = raw.order_type;
  if (orderType === "LIMIT") {
    if (entry >= ctx.price) {
      orderType = "MARKET";
      entry = ctx.price;
      notes.push("limit_at_or_above_price→market");
    } else if (entry < ctx.price - ctx.atr15) {
      entry = ctx.price - ctx.atr15;
      notes.push("limit_clamped_to_1atr");
    }
  }
  let stop = raw.stop;
  if (!(stop < entry)) return finish(deterministic("stop_not_below_entry"));
  if (entry - stop < entry * ctx.minStopPct) {
    stop = entry * (1 - ctx.minStopPct);
    notes.push("stop_widened_to_min");
  }
  const maxDist = Math.max(ctx.maxStopAtr * ctx.atr15, fb.entry - fb.stop);
  if (entry - stop > maxDist) return finish(deterministic("stop_too_far"));
  let target = raw.target;
  const minTarget = entry + ctx.minRr * (entry - stop);
  if (target < minTarget) {
    target = minTarget;
    notes.push("target_raised_to_min_rr");
  }
  return finish({ ...base, rating: raw.rating, explanation: raw.explanation.trim(), order_type: orderType, entry, stop, target, rr: 0, notes, source: "AGENT", error: null });
}

export async function planIntradayTrade(input: {
  snap: RatingSnapshot;
  tier: string;
  price: number;
  atr15: number;
  minStopPct: number;
  maxStopAtr: number;
  minRr: number;
}): Promise<TradePlanProposal> {
  const c = input.snap.candidate;
  const ctx = { price: input.price, atr15: input.atr15, minStopPct: input.minStopPct, maxStopAtr: input.maxStopAtr, minRr: input.minRr, fallback: { entry: c.entry, stop: c.stop, target: c.target } };
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) return enforcePlan(null, ctx, { error: "missing_gemini_api_key" });
  const data = {
    tier: input.tier,
    current_price: rnd(input.price),
    atr_15m: rnd(input.atr15),
    min_stop_pct: input.minStopPct,
    min_reward_to_risk: input.minRr,
    symbol: input.snap.symbol,
    setup: c.setup,
    deterministic_score_0_100: c.score,
    deterministic_plan: { entry: rnd(c.entry), stop: rnd(c.stop), target: rnd(c.target), reward_to_risk: rnd(c.rr, 2) },
    trading_range: c.range,
    features: c.features,
    bars_15m_ohlcv: input.snap.bars_15m,
    bars_5m_ohlcv: input.snap.bars_5m,
    market_reference_15m: referenceOf(input.snap),
    now_utc: new Date().toISOString(),
  };
  try {
    const result = await generateText({
      model: google(AGENT_MODEL_ID),
      system: PLANNER_SYSTEM_PROMPT,
      prompt: `<data>${JSON.stringify(data)}</data>`,
      output: Output.object({ schema: planSchema }),
      temperature: 0.2,
      abortSignal: AbortSignal.timeout(45_000),
    });
    const parsed = planSchema.safeParse(result.output);
    return enforcePlan(parsed.success ? parsed.data : null, ctx, { error: parsed.success ? null : "schema_violation" });
  } catch (err) {
    return enforcePlan(null, ctx, { error: err instanceof Error ? err.message.slice(0, 200) : "agent_error" });
  }
}
