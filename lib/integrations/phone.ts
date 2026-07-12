export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("972")) return digits;
  if (digits.startsWith("0")) return `972${digits.slice(1)}`;
  return digits;
}

export function isValidPhone(raw: string): boolean {
  const n = normalizePhone(raw);
  return n.length >= 11 && n.length <= 15;
}

export function whatsappUrl(raw: string): string | null {
  if (!isValidPhone(raw)) return null;
  return `https://wa.me/${normalizePhone(raw)}`;
}
