export function makeMondayExternalId(accountKey: string, itemId: string): string {
  return `${accountKey}:${itemId}`;
}

export function parseMondayExternalId(externalId: string): {
  accountKey: string;
  itemId: string;
} {
  const idx = externalId.indexOf(":");
  if (idx <= 0 || idx === externalId.length - 1) {
    throw new Error("invalid_monday_external_id");
  }
  return {
    accountKey: externalId.slice(0, idx),
    itemId: externalId.slice(idx + 1),
  };
}
