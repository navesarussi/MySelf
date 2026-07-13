function parseAllowedGoogleEmails() {
  const raw = process.env.ALLOWED_GOOGLE_EMAIL?.trim();
  if (!raw) return [];
  return raw
    .split(/[,;]/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowedGoogleEmail(email: string) {
  const allowed = parseAllowedGoogleEmails();
  if (allowed.length === 0) return true;
  return allowed.includes(email.trim().toLowerCase());
}

/**
 * The first email in ALLOWED_GOOGLE_EMAIL is the calendar owner: only its
 * login should ever create/replace the shared Google Calendar sync token,
 * so that additional allowed emails (guests) can sign in without hijacking
 * the calendar sync to their own account.
 */
export function isPrimaryGoogleEmail(email: string) {
  const allowed = parseAllowedGoogleEmails();
  if (allowed.length === 0) return true;
  return allowed[0] === email.trim().toLowerCase();
}
