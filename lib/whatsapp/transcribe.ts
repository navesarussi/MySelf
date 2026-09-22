import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { GEMINI_MODEL_ID } from "@/lib/ai-model";

export function normalizeAudioMime(mime: string): string {
  return mime.split(";")[0]?.trim() || "audio/ogg";
}

/** Transcribe a WhatsApp voice note to Hebrew text via Gemini. */
export async function transcribeWhatsAppAudio(input: {
  bytes: Uint8Array;
  mimeType: string;
}): Promise<string> {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    throw new Error("missing_gemini_api_key");
  }

  const mimeType = normalizeAudioMime(input.mimeType);
  const prompt =
    "תמלל את ההקלטה לעברית בלבד. החזר רק את התמלול, בלי מרכאות ובלי הערות. " +
    "אם לא ברור — החזר את המילים הכי סבירות.";

  for (let attempt = 0; attempt < 2; attempt++) {
    const { text } = await generateText({
      model: google(GEMINI_MODEL_ID),
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "file", data: input.bytes, mediaType: mimeType },
          ],
        },
      ],
    });
    const out = text?.trim() || "";
    if (out) return out;
  }

  throw new Error("empty_transcript");
}
