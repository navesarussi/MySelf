export function isAllowedGoogleEmail(email: string) {
  const allowed = process.env.ALLOWED_GOOGLE_EMAIL?.trim().toLowerCase();
  if (!allowed) return true;
  return email.trim().toLowerCase() === allowed;
}
