const BODY_PREVIEW_CHARS = 400;

/** Truncate library body for list payloads so editors still fetch the full row. */
export function previewContentBody(body: string | null | undefined, max = BODY_PREVIEW_CHARS): string {
  const text = body ?? "";
  if (text.length <= max) return text;
  return text.slice(0, max);
}
