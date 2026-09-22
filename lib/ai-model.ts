/**
 * The Gemini model this app runs on.
 *
 * It was written out in four places (the chat agent, the trading agent, the
 * voice transcriber). Changing models meant finding all of them, and a missed
 * one is a silent split-brain: two parts of the product answering on different
 * models with no error anywhere.
 */
export const GEMINI_MODEL_ID = "gemini-3-flash-preview";
