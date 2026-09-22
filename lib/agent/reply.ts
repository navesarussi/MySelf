const BANNED = [/לא הצלחתי לענות/i, /נסה שוב/i];

export function sanitizeAgentReply(text: string): string {
  const t = text.trim();
  if (!t) return "";
  if (BANNED.some((re) => re.test(t))) {
    return "נתקעתי באמצע. תנסח שוב בקצרה מה אתה רוצה שאעשה (משימה / הרגל / מייל / קשר).";
  }
  return t;
}
