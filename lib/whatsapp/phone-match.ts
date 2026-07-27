import { normalizePhone } from "@/lib/integrations/phone";

export function isAuthorizedWhatsAppSender(from: string, userPhone: string | null): boolean {
  if (!userPhone) return false;
  return normalizePhone(from) === normalizePhone(userPhone);
}
