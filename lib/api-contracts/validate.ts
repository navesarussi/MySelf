import { z } from "zod";
import {
  assertFinancePlanSections,
  assertHomeTradingLegacyFields,
  MOBILE_API_CONTRACTS,
} from "./schemas";

export type ContractViolation = { path: string; reason: string };

function formatZod(path: string, err: z.ZodError): ContractViolation {
  const issue = err.issues[0];
  const at = issue?.path?.length ? `.${issue.path.join(".")}` : "";
  return { path, reason: `schema:${issue?.code ?? "invalid"}${at}:${issue?.message ?? "invalid"}` };
}

/** Validate a parsed JSON body against a mobile API contract schema. */
export function validateMobileApiContract(
  key: keyof typeof MOBILE_API_CONTRACTS,
  body: unknown
): ContractViolation | null {
  const spec = MOBILE_API_CONTRACTS[key];
  const parsed = spec.schema.safeParse(body);
  if (!parsed.success) return formatZod(spec.path, parsed.error);

  if (key === "home") {
    const legacy = assertHomeTradingLegacyFields((body as { trading?: unknown }).trading ?? null);
    if (legacy) return { path: spec.path, reason: legacy };
  }
  if (key === "financePlan") {
    const sections = assertFinancePlanSections((body as { sections?: unknown }).sections);
    if (sections) return { path: spec.path, reason: sections };
  }
  return null;
}

/** Map smoke URL path (+ optional query) to a contract key. */
export function contractKeyForSmokePath(path: string): keyof typeof MOBILE_API_CONTRACTS | null {
  const base = path.split("?")[0];
  for (const [key, spec] of Object.entries(MOBILE_API_CONTRACTS) as [
    keyof typeof MOBILE_API_CONTRACTS,
    (typeof MOBILE_API_CONTRACTS)[keyof typeof MOBILE_API_CONTRACTS],
  ][]) {
    if (spec.path === base) return key;
  }
  return null;
}

export function evaluateContractResponse(path: string, status: number, bodyText: string): string | null {
  if (status !== 200) return `http_${status}`;
  let body: unknown;
  try {
    body = JSON.parse(bodyText);
  } catch {
    return "invalid_json";
  }
  const key = contractKeyForSmokePath(path);
  if (!key) return null;
  const violation = validateMobileApiContract(key, body);
  return violation?.reason ?? null;
}
