import { generateText } from "ai";
import { google } from "@ai-sdk/google";

/** Transcribe a WhatsApp voice note to Hebrew text via Gemini. */
export async function transcribeWhatsAppAudio(input: {
  bytes: Uint8Array;
  mimeType: string;
}): Promise<string> {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    throw new Error("missing_gemini_api_key");
  }

  const mimeType = input.mimeType.split(";")[0]?.trim() || "audio/ogg";
  const { text } = await generateText({
    model: google("gemini-3-flash-preview"),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              "Transcribe this WhatsApp voice note to plain Hebrew text only. " +
              "No commentary, no quotes, no translation. If unclear, return the best-effort Hebrew.",
          },
          {
            type: "file",
            data: input.bytes,
            mediaType: mimeType,
          },
        ],
      },
    ],
  });

  const out = text?.trim() || "";
  if (!out) throw new Error("empty_transcript");
  return out;
}
