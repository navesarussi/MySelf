export type DeviceContactInput = {
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phoneNumbers?: { number?: string | null }[] | null;
  emails?: { email?: string | null }[] | null;
};

export type DeviceContactFields = {
  name: string;
  phone: string;
  email: string;
};

export function mapDeviceContact(contact: DeviceContactInput): DeviceContactFields {
  const composed = [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim();
  const name = (contact.name?.trim() || composed || "").trim();
  const phone = contact.phoneNumbers?.find((p) => p.number?.trim())?.number?.trim() ?? "";
  const email = contact.emails?.find((e) => e.email?.trim())?.email?.trim() ?? "";
  return { name, phone, email };
}
