import { safeEqual } from "@/lib/auth";

export const MAINTAINER_TEST_HEADER = "x-maintainer-test";

export function verifyMaintainerTestHeader(
  header: string | null | undefined,
  configuredKey: string | null | undefined
): boolean {
  if (!header || !configuredKey) return false;
  return safeEqual(header.trim(), configuredKey);
}
