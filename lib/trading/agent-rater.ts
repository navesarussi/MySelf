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
- הקשר: מגמת 15 דקות (EMA50/200), מצב BTC (אלטים נגררים אחרי BTC), RSI מתוח (>75) מקטין סיכוי, מרחק ליעד ביחס לסטופ.
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
  candidate: Pick<IntradayCandidate, "setup" | "score" | "entry" | "stop" | "target" | "rr" | "stop_distance" | "range" | "features" | "setup_bar_time" | "confirm_time">;
  bars_15m: ReturnType<typeof compactIntradayBars>;
  bars_5m: ReturnType<typeof compactIntradayBars>;
  btc_15m: ReturnType<typeof compactIntradayBars> | null;
};

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
    btc_15m_ohlcv: snap.btc_15m,
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
