export function isAllowedGoogleEmail(email: string) {
  const raw = process.env.ALLOWED_GOOGLE_EMAIL?.trim();
  if (!raw) return true;
  const allowed = raw
    .split(/[,;]/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length === 0) return true;
  return allowed.includes(email.trim().toLowerCase());
}
