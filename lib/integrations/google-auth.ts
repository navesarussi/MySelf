import { getSupabase } from "@/lib/supabase";

function parseEnvAllowedEmails() {
  const raw = process.env.ALLOWED_GOOGLE_EMAIL?.trim();
  if (!raw) return [];
  return raw
    .split(/[,;]/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Extra allowed emails live in the DB so they can be managed without touching
 * Vercel env vars. Falls back to an empty list if the table isn't set up yet
 * or Supabase env vars are missing, so this never blocks the env-var-only path.
 */
async function getDbAllowlist(): Promise<{ emails: string[]; primary: string | null }> {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.from("allowed_google_emails").select("email, is_primary");
    if (error || !data) return { emails: [], primary: null };
    const emails = data.map((row) => String(row.email).trim().toLowerCase());
    const primary = data.find((row) => row.is_primary)?.email as string | undefined;
    return { emails, primary: primary?.trim().toLowerCase() ?? null };
  } catch {
    return { emails: [], primary: null };
  }
}

export async function isAllowedGoogleEmail(email: string) {
  const envAllowed = parseEnvAllowedEmails();
  const { emails: dbAllowed } = await getDbAllowlist();
  const allowed = new Set([...envAllowed, ...dbAllowed]);
  if (allowed.size === 0) return true;
  return allowed.has(email.trim().toLowerCase());
}

/**
 * Only the primary (calendar-owner) account's login should ever
 * create/replace the shared Google Calendar sync token, so that additional
 * allowed emails (guests) can sign in without hijacking the calendar sync to
 * their own account. The DB's `is_primary` flag wins; otherwise the first
 * email in ALLOWED_GOOGLE_EMAIL is treated as primary.
 */
export async function isPrimaryGoogleEmail(email: string) {
  const envAllowed = parseEnvAllowedEmails();
  const { primary: dbPrimary } = await getDbAllowlist();
  const primary = dbPrimary ?? envAllowed[0] ?? null;
  if (!primary) return true;
  return primary === email.trim().toLowerCase();
}
